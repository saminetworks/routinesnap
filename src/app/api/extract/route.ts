import { NextResponse, type NextRequest } from "next/server";
import { categoryInputSchema } from "@/lib/ai/schema";
import { getServerExtractor } from "@/lib/ai/extractor";
import { MAX_IMAGE_BYTES } from "@/lib/image";
import { checkRateLimit, getClientIp, getDailyScanLimit } from "@/lib/rate-limit";

/**
 * POST /api/extract — image -> structured events JSON (spec §9, §11).
 *
 * - multipart/form-data: image, category, locale, timezone, referenceDate.
 * - Rate limiting runs FIRST (before any AI call), keyed by IP.
 * - Stateless: the image is processed in memory and discarded. Nothing
 *   is stored, nothing is logged — no image data, no extracted content.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-side MIME allow-list. HEIC is converted client-side, so the
// API only ever sees JPEG/PNG/WEBP.
const ACCEPTED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
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
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse(400, "invalid_request", "Could not read the uploaded form. Please try again.");
  }

  // Honeypot: a real user never fills this field; bots often do.
  if (typeof form.get("website") === "string" && (form.get("website") as string).trim() !== "") {
    return errorResponse(400, "invalid_request", "That request looked automated. Please try again.");
  }

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

  // 2. Validate the upload.
  const image = form.get("image");
  if (!(image instanceof File)) {
    return errorResponse(400, "invalid_image", "Please upload a photo of a schedule.", { ...rateHeaders });
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return errorResponse(400, "invalid_image", "That image is larger than 8 MB. Please use a smaller image.");
  }
  if (!ACCEPTED_MIME.has(image.type)) {
    return errorResponse(
      400,
      "invalid_image",
      "Please use a JPG, PNG or WEBP image. HEIC photos are converted in your browser before upload.",
    );
  }

  const categoryRaw = form.get("category");
  const category = categoryInputSchema.safeParse(
    typeof categoryRaw === "string" ? categoryRaw : "auto",
  );
  if (!category.success) {
    return errorResponse(400, "invalid_request", "That category is not recognised. Please pick a category and try again.");
  }
  const localeRaw = form.get("locale");
  const locale = typeof localeRaw === "string" && LOCALES.has(localeRaw) ? (localeRaw as "en" | "bn" | "ja") : "en";
  const timezoneRaw = form.get("timezone");
  const timezone = typeof timezoneRaw === "string" && timezoneRaw.trim() ? timezoneRaw.trim() : "Asia/Dhaka";
  const referenceRaw = form.get("referenceDate");
  const referenceDate =
    typeof referenceRaw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(referenceRaw)
      ? referenceRaw
      : new Date().toISOString().slice(0, 10);

  // 3. Extract in memory. The image bytes are never written to disk,
  // never logged, and dropped as soon as this handler returns.
  try {
    const bytes = new Uint8Array(await image.arrayBuffer());
    const base64 = Buffer.from(bytes).toString("base64");
    const dataUrl = `data:${image.type};base64,${base64}`;
    const result = await getServerExtractor().extract({
      imageDataUrl: dataUrl,
      category: category.data,
      locale,
      timezone,
      referenceDate,
    });
    return NextResponse.json(result, { headers: rateHeaders });
  } catch (err) {
    // Friendly error only — no stack traces, no image data, no content.
    console.error("[extract] extraction failed:", err instanceof Error ? err.name : "unknown");
    return errorResponse(
      502,
      "extraction_failed",
      "We couldn't read that photo. Please try a clearer photo and try again.",
    );
  }
}
