import { NextResponse, type NextRequest } from "next/server";
import {
  getAnthropicExtraHeaders,
  getAnthropicModel,
  getAnthropicWorkspaceId,
  hasAnthropicKey,
} from "@/lib/ai/extractor";

const ANTHROPIC_MODELS_URL = "https://api.anthropic.com/v1/models";
/** Cheap key check must stay fast — the health endpoint is not a scan. */
const KEY_CHECK_TIMEOUT_MS = 5000;

/**
 * Verify the configured Anthropic key actually works, cheaply: list
 * models (no tokens spent). HTTP 200 means the key is valid. Returns
 * the status code (or null when the request never completed) so the
 * deep health check can say WHY a key fails: 400 = workspace header
 * problem, 401 = bad key, 402/403 = billing/permission, 429/5xx =
 * rate limit/outage. Never throws and never exposes the key. Kept
 * module-local on purpose: a route module may only export handlers,
 * or Next's generated route types fail to compile.
 */
async function checkAnthropicKey(): Promise<number | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    const res = await fetch(ANTHROPIC_MODELS_URL, {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        ...getAnthropicExtraHeaders(),
      },
      signal: AbortSignal.timeout(KEY_CHECK_TIMEOUT_MS),
    });
    return res.status;
  } catch {
    return null;
  }
}

/**
 * Health check.
 * - Plain: GET /api/health -> { status: "ok", extractor } exactly as
 *   before — no extra fields, no key check, no network call.
 * - Deep: GET /api/health?deep=1 -> { status, extractor, model,
 *   keyConfigured, keyValid, workspaceConfigured, keyCheckStatus }.
 *   When no key is configured the Anthropic API is not called at all
 *   (keyConfigured/keyValid are both false, keyCheckStatus is null).
 *   The key and workspace id themselves are never returned.
 */
export async function GET(request: NextRequest) {
  const extractor = hasAnthropicKey() ? "anthropic" : "mock";
  const deep = request.nextUrl.searchParams.get("deep") === "1";
  if (!deep) {
    return NextResponse.json({
      status: "ok",
      extractor,
    });
  }
  const keyConfigured = hasAnthropicKey();
  const workspaceConfigured = Boolean(getAnthropicWorkspaceId());
  const keyCheckStatus = keyConfigured ? await checkAnthropicKey() : null;
  const keyValid = keyCheckStatus === 200;
  return NextResponse.json({
    status: "ok",
    extractor,
    model: getAnthropicModel(),
    keyConfigured,
    keyValid,
    workspaceConfigured,
    keyCheckStatus,
  });
}
