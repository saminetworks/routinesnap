import { NextResponse, type NextRequest } from "next/server";
import { categoryInputSchema } from "@/lib/ai/schema";
import { classifyExtractionError, type ExtractionErrorCode } from "@/lib/ai/extractor";
import { getServerTextExtractor, MAX_TEXT_LENGTH } from "@/lib/ai/extract-text";
import { checkRateLimit, getClientIp, getDailyScanLimit } from "@/lib/rate-limit";

/**
 * POST /api/extract-text — pasted routine text -> structured events JSON.
 *
 * - JSON body: { text, category, locale, timezone, referenceDate }.
 * - Same 5/day per-IP rate limit as /api/extract (runs FIRST, before
 *   any AI call), same ExtractResult shape, same error-code style.
 * - Stateless: the text is processed in memory and discarded. Nothing
 *   is stored, nothing is logged — no pasted text, no extracted content.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOCALES = new Set(["en", "bn", "ja"]);

function errorResponse(
  status: number,
  error: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json({ error, message, ...extra }, { status });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_request", "Could not read the request. Please try again.");
  }
  const input = (body ?? {}) as Record<string, unknown>;

  // 1. Rate limiting FIRST — before validation details and any AI call.
  const ip = getClientIp(request);
  const limit = getDailyScanLimit();
  let rate: Awaited<ReturnType<typeof checkRateLimit>>;
  try {
    rate = await checkRateLimit(ip, { limit });
  } catch {
    // A limiter failure must not take the API down; treat as allowed
    // and let the extraction proceed (the in-memory fallback in
    // checkRateLimit already covers Upstash outages).
    rate = { success: true, limit, remaining: limit - 1, reset: Date.now() + 24 * 60 * 60 * 1000 };
  }
  const rateHeaders = {
    "X-RateLimit-Limit": String(rate.limit),
    "X-RateLimit-Remaining": String(rate.remaining),
    "X-RateLimit-Reset": String(Math.floor(rate.reset / 1000)),
  };
  if (!rate.success) {
    const retryAfterSeconds = Math.max(1, Math.ceil((rate.reset - Date.now()) / 1000));
    return NextResponse.json(
      {
        error: "rate_limited",
        message: `You have used your ${rate.limit} free scans for today. Please try again tomorrow.`,
        retryAfterSeconds,
      },
      { status: 429, headers: { ...rateHeaders, "Retry-After": String(retryAfterSeconds) } },
    );
  }

  // 2. Validate the text.
  const text = input.text;
  if (typeof text !== "string" || text.trim().length === 0) {
    return errorResponse(400, "invalid_request", "Please paste your routine as text first.", {
      ...rateHeaders,
    });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return errorResponse(
      400,
      "invalid_request",
      `That text is too long (over ${MAX_TEXT_LENGTH.toLocaleString()} characters). Please paste a shorter routine.`,
      { ...rateHeaders },
    );
  }

  const category = categoryInputSchema.safeParse(
    typeof input.category === "string" ? input.category : "auto",
  );
  if (!category.success) {
    return errorResponse(400, "invalid_request", "That category is not recognised. Please pick a category and try again.", {
      ...rateHeaders,
    });
  }
  const locale = typeof input.locale === "string" && LOCALES.has(input.locale) ? (input.locale as "en" | "bn" | "ja") : "en";
  const timezone = typeof input.timezone === "string" && input.timezone.trim() ? input.timezone.trim() : "Asia/Dhaka";
  const referenceDate =
    typeof input.referenceDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.referenceDate)
      ? input.referenceDate
      : new Date().toISOString().slice(0, 10);

  // 3. Extract in memory. The text is never written to disk, never
  // logged, and dropped as soon as this handler returns.
  try {
    const result = await getServerTextExtractor().extractText({
      text,
      category: category.data,
      locale,
      timezone,
      referenceDate,
    });
    return NextResponse.json(result, { headers: rateHeaders });
  } catch (err) {
    // Classify the failure so the response (and the Vercel log line)
    // says what actually happened. The log line carries only the
    // failure kind and a content-free detail — no pasted text, no
    // extracted text, no stack traces.
    const failure = classifyExtractionError(err);
    console.error(`[extract-text] ${failure.code}: ${failure.logDetail}`);
    return errorResponse(failure.httpStatus, failure.code, extractionErrorMessage(failure.code));
  }
}

/** Friendly, content-free message per failure kind. */
function extractionErrorMessage(code: ExtractionErrorCode): string {
  switch (code) {
    case "ai_unavailable":
      return "Our AI service is busy right now. Please try again in a minute.";
    case "invalid_output":
      return "We couldn't make sense of that text. Please check it and try again.";
    case "extraction_failed":
    default:
      return "We couldn't read that text. Please check it and try again.";
  }
}
