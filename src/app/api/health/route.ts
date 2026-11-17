import { NextResponse } from "next/server";
import { hasAnthropicKey } from "@/lib/ai/extractor";

/** Simple health check: { status: "ok" }. No secrets, no image data. */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    extractor: hasAnthropicKey() ? "anthropic" : "mock",
  });
}
