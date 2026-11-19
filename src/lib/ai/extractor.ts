import { addDays, format } from "date-fns";
import type Anthropic from "@anthropic-ai/sdk";
import type { CategorySlug } from "@/config/categories";
import { extractResultSchema, type CategoryInput, type ExtractResult } from "@/lib/ai/schema";
import { nextMonday } from "@/lib/dates";
import { addMinutes, containsTimeOfDayWord, parseTimeInput } from "@/lib/time-input";

/**
 * Extractor interface (spec §9). The scan UI only ever talks to this
 * interface. Step 5 replaces `createExtractor()`'s server branch with a
 * call to /api/extract — the UI does not change.
 */
export interface ExtractInput {
  /** Processed image as a data URL (already resized + EXIF-stripped). */
  imageDataUrl: string;
  /**
   * The same image as a Blob. When provided, the extractor uploads it
   * directly instead of re-fetching the data URL to make a Blob — that
   * round-trip is a needless failure point (a data-URL fetch that throws
   * fails the whole scan before any request reaches the server).
   */
  imageBlob?: Blob;
  category: CategoryInput;
  locale: "en" | "bn" | "ja";
  timezone: string;
  /** ISO date used to resolve relative dates / missing years. */
  referenceDate: string;
}

export interface ScheduleExtractor {
  extract(input: ExtractInput): Promise<ExtractResult>;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function iso(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/**
 * Mock extractor — used when ANTHROPIC_API_KEY is missing (Step 3).
 * Returns realistic sample events per category, with varied confidence,
 * assumptions and warnings, so the whole scan UI can be developed and
 * demoed without a key. Dates are anchored to the next Monday so the
 * demo always looks current.
 */
export class MockExtractor implements ScheduleExtractor {
  async extract(input: ExtractInput): Promise<ExtractResult> {
    await delay(1400); // Feels like a real extraction; UI shows progress.
    const monday = nextMonday(new Date(input.referenceDate));
    const slug: CategorySlug =
      input.category === "auto" ? "class-routine" : (input.category as CategorySlug);
    const until = iso(addDays(monday, 12 * 7 - 1));

    switch (slug) {
      case "exam-routine":
        return validate({
          detectedCategory: slug,
          language: "mixed",
          assumptions: ["Year assumed 2026"],
          warnings: ["One exam time was partly cut off in the photo — please check the end time."],
          events: [
            { title: "Mathematics — Final Exam", date: iso(addDays(monday, 2)), startTime: "09:00", endTime: "12:00", location: "Hall A", notes: "Bring admit card", reminderMinutesBefore: [1440, 120], confidence: 0.96 },
            { title: "Physics — Final Exam", date: iso(addDays(monday, 4)), startTime: "09:00", endTime: "12:00", location: "Hall B", reminderMinutesBefore: [1440, 120], confidence: 0.9 },
            { title: "English — Final Exam", date: iso(addDays(monday, 7)), startTime: "10:00", endTime: "12:00", location: "Hall A", reminderMinutesBefore: [1440, 120], confidence: 0.58 },
          ],
        });
      case "duty-roster":
        return validate({
          detectedCategory: slug,
          language: "mixed",
          assumptions: ["Shift code “N” read as night shift 22:00–06:00 from the legend."],
          warnings: ["Night shifts cross midnight — the end time is the next day."],
          events: [
            { title: "Baito shift — Evening", date: iso(addDays(monday, 0)), startTime: "18:00", endTime: "22:00", location: "Convenience store", reminderMinutesBefore: [30], confidence: 0.93 },
            { title: "Baito shift — Night (N)", date: iso(addDays(monday, 2)), startTime: "22:00", endTime: "06:00", location: "Warehouse", notes: "Night shift crosses midnight", reminderMinutesBefore: [60], confidence: 0.71 },
            { title: "Baito shift — Morning", weekday: "SA", startTime: "08:00", endTime: "13:00", location: "Convenience store", recurrence: { freq: "WEEKLY", until }, reminderMinutesBefore: [30], confidence: 0.88 },
          ],
        });
      case "invitation-card":
        return validate({
          detectedCategory: slug,
          language: "mixed",
          assumptions: ["Year assumed 2026", "Bangla date converted to the Gregorian calendar — please confirm."],
          warnings: ["The invitation mentions a Bengali calendar date; double-check the day."],
          events: [
            { title: "Wedding Reception — Afnan & Partner", date: iso(addDays(monday, 5)), startTime: "19:00", endTime: "23:00", location: "Community Centre, Dhaka", notes: "Dinner at 20:00", reminderMinutesBefore: [1440, 60], confidence: 0.82 },
          ],
        });
      case "medicine-schedule":
        return validate({
          detectedCategory: slug,
          language: "en",
          assumptions: ["“1+0+1” read as morning and night doses.", "Duration read as 14 days."],
          warnings: ["One dose time was hard to read — verify every dose against your prescription."],
          events: [
            { title: "Amoxicillin 500mg — 1 tablet", date: iso(monday), startTime: "08:00", endTime: "08:05", notes: "After breakfast", recurrence: { freq: "DAILY", count: 14 }, reminderMinutesBefore: [10], confidence: 0.9 },
            { title: "Amoxicillin 500mg — 1 tablet", date: iso(monday), startTime: "21:00", endTime: "21:05", notes: "After dinner", recurrence: { freq: "DAILY", count: 14 }, reminderMinutesBefore: [10], confidence: 0.9 },
            { title: "Vitamin D — 1 tablet", date: iso(monday), startTime: "13:00", endTime: "13:05", notes: "After lunch", recurrence: { freq: "DAILY", count: 14 }, reminderMinutesBefore: [10], confidence: 0.61 },
          ],
        });
      case "match-fixture":
        return validate({
          detectedCategory: slug,
          language: "en",
          assumptions: ["Times converted to your timezone."],
          warnings: [],
          events: [
            { title: "Bangladesh vs India — T20", date: iso(addDays(monday, 1)), startTime: "19:00", endTime: "22:30", location: "Sher-e-Bangla Stadium, Dhaka", reminderMinutesBefore: [60], confidence: 0.95 },
            { title: "Bangladesh vs Sri Lanka — ODI", date: iso(addDays(monday, 4)), startTime: "14:00", endTime: "21:00", location: "Sher-e-Bangla Stadium, Dhaka", reminderMinutesBefore: [60], confidence: 0.87 },
          ],
        });
      case "class-routine":
      default:
        return validate({
          detectedCategory: "class-routine",
          language: "mixed",
          assumptions: ["Year assumed 2026", "Weekly routine — events repeat every week."],
          warnings: ["The teacher's name on Wednesday was partly unreadable."],
          events: [
            { title: "Physics", weekday: "MO", startTime: "09:00", endTime: "10:00", location: "Room 204", notes: "Mr. Rahman", recurrence: { freq: "WEEKLY", until }, reminderMinutesBefore: [30], confidence: 0.95 },
            { title: "Mathematics", weekday: "TU", startTime: "10:00", endTime: "11:00", location: "Room 201", recurrence: { freq: "WEEKLY", until }, reminderMinutesBefore: [30], confidence: 0.88 },
            { title: "Chemistry", weekday: "WE", startTime: "09:00", endTime: "10:00", location: "Lab 2", notes: "Teacher name unclear", recurrence: { freq: "WEEKLY", until }, reminderMinutesBefore: [30], confidence: 0.58 },
            { title: "English", weekday: "TH", startTime: "11:00", endTime: "12:00", location: "Room 205", recurrence: { freq: "WEEKLY", until }, reminderMinutesBefore: [30], confidence: 0.91 },
            { title: "Biology", weekday: "FR", startTime: "09:00", endTime: "10:00", location: "Lab 1", recurrence: { freq: "WEEKLY", until }, reminderMinutesBefore: [30], confidence: 0.84 },
          ],
        });
    }
  }
}

function validate(result: ExtractResult): ExtractResult {
  return extractResultSchema.parse(result);
}

/** Join the text blocks of a Claude response into one string. */
function responseText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n");
}
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";

/** Output budget for a single model reply. Raised from 4096: a full
 * weekly table (11+ events with long titles, rooms and notes) plus
 * warnings/assumptions can run past 4096 tokens, which truncated the
 * JSON mid-object — unparseable on both the first call and the retry,
 * so every such photo failed with a 502. */
export const MAX_OUTPUT_TOKENS = 8192;

/** Machine-readable failure kinds for extraction. The API route maps
 * these to distinct error codes so the user (and the logs) can tell
 * an Anthropic outage from a bad model reply from anything else. */
export type ExtractionErrorCode = "ai_unavailable" | "invalid_output" | "extraction_failed";

export class ExtractionError extends Error {
  readonly code: ExtractionErrorCode;
  readonly httpStatus: number;
  /** Short, content-free detail for server logs — never image data,
   * never extracted text, never raw error messages (Zod/JSON errors
   * can echo model output). */
  readonly logDetail: string;
  constructor(code: ExtractionErrorCode, httpStatus: number, logDetail: string) {
    super(`Extraction failed (${code})`);
    this.name = "ExtractionError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.logDetail = logDetail;
  }
}

/**
 * Classify any failure escaping the extractor for the API route.
 * ExtractionErrors pass through. Anthropic SDK failures carry a
 * numeric `status` (401 auth, 429 rate limit, 500/529 overload) —
 * read it duck-typed so this module never needs the SDK at import
 * time. Auth problems are the caller's key, not a photo problem, so
 * they stay on the generic code (friendly UI message) while the log
 * line still names them. Anything else is the generic fallback,
 * logged by error name only — never the message, which can echo
 * model output (Zod/JSON errors) or image-adjacent text.
 */
export function classifyExtractionError(err: unknown): ExtractionError {
  if (err instanceof ExtractionError) return err;
  const status =
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
      ? (err as { status: number }).status
      : undefined;
  if (status === 401 || status === 403) {
    return new ExtractionError("extraction_failed", 502, `anthropic_auth status=${status}`);
  }
  if (status === 429) {
    return new ExtractionError("ai_unavailable", 503, "anthropic_rate_limited status=429");
  }
  if (status !== undefined && status >= 500) {
    return new ExtractionError("ai_unavailable", 503, `anthropic_server_error status=${status}`);
  }
  return new ExtractionError(
    "extraction_failed",
    502,
    err instanceof Error ? err.name : "unknown_error",
  );
}

/**
 * Turn a Zod validation failure into a short, content-free hint for
 * the retry prompt: field paths and issue codes only, never values —
 * values could be text copied from the photo.
 */
function validationHints(err: unknown): string | null {
  if (
    typeof err === "object" &&
    err !== null &&
    "issues" in err &&
    Array.isArray((err as { issues: unknown }).issues)
  ) {
    const hints = (
      err as { issues: { path: (string | number)[]; code: string }[] }
    ).issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".") || "result"}: ${issue.code}`);
    return hints.length > 0 ? hints.join("; ") : null;
  }
  return null;
}

export function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
}

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/**
 * Workspace id for personal/user API keys (sk-ant-usr-...). Anthropic
 * rejects those keys unless every request also sends the workspace id
 * as an `anthropic-workspace-id` header (400 otherwise). Workspace keys
 * (sk-ant-api03-...) are already scoped and do not need it, so the
 * header is only sent when this env var is set.
 */
export function getAnthropicWorkspaceId(): string {
  return process.env.ANTHROPIC_WORKSPACE_ID?.trim() || "";
}

/** Extra headers for Anthropic requests: workspace id when configured. */
export function getAnthropicExtraHeaders(): Record<string, string> {
  const workspaceId = getAnthropicWorkspaceId();
  return workspaceId ? { "anthropic-workspace-id": workspaceId } : {};
}

/**
 * Pull a JSON object out of model text. The model is told to return
 * JSON only, but it sometimes wraps it in ```json fences or adds a
 * short preamble — tolerate that, never log the content.
 */
export function extractJsonFromText(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in model output.");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

const WEEKDAY_BY_NAME: Record<string, string> = {
  mo: "MO", monday: "MO", mon: "MO",
  tu: "TU", tuesday: "TU", tue: "TU", tues: "TU",
  we: "WE", wednesday: "WE", wed: "WE",
  th: "TH", thursday: "TH", thu: "TH", thur: "TH", thurs: "TH",
  fr: "FR", friday: "FR", fri: "FR",
  sa: "SA", saturday: "SA", sat: "SA",
  su: "SU", sunday: "SU", sun: "SU",
};

const LANGUAGE_BY_NAME: Record<string, string> = {
  en: "en", english: "en",
  bn: "bn", bangla: "bn", bengali: "bn",
  ja: "ja", japanese: "ja",
  mixed: "mixed",
};

const CATEGORY_SLUGS = new Set([
  "class-routine",
  "exam-routine",
  "duty-roster",
  "invitation-card",
  "medicine-schedule",
  "match-fixture",
]);

/**
 * Forgiving pre-validation pass over the model's JSON. The model
 * usually reads the schedule right but slips on formatting — an
 * unpadded hour ("8:30"), a 12-hour time ("1:00 PM"), a time written
 * as a word ("morning", "sokal", "বিকাল"), a weekday name
 * ("Saturday"), a language name ("English") or a confidence as a
 * string ("0.9") — and any one of those fails the strict schema and
 * forces a second, slow AI call. Normalizing here keeps the first
 * attempt valid, so most scans finish in one call (~25s) instead of
 * two (~60s). Times go through the same parseTimeInput the manual
 * editor uses. A start time that was only a word gets a default
 * 1-hour end time when the model gave none. Anything still
 * unparsable is left untouched so validation (and the retry) still
 * catches it.
 */
export function normalizeExtractedJson(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = { ...obj };
  if (typeof out.detectedCategory === "string") {
    const slug = out.detectedCategory.trim().toLowerCase().replace(/[\s_]+/g, "-");
    if (CATEGORY_SLUGS.has(slug)) out.detectedCategory = slug;
  }
  if (typeof out.language === "string") {
    const lang = LANGUAGE_BY_NAME[out.language.trim().toLowerCase()];
    if (lang) out.language = lang;
  }
  if (!Array.isArray(out.events)) return out;
  out.events = out.events.map((event) => {
    if (typeof event !== "object" || event === null || Array.isArray(event)) return event;
    const e: Record<string, unknown> = { ...(event as Record<string, unknown>) };
    for (const key of ["startTime", "endTime"] as const) {
      const raw = e[key];
      if (typeof raw !== "string") continue;
      const normalized = parseTimeInput(raw);
      if (normalized === null) continue;
      e[key] = normalized;
      // Only a word was given ("morning", "bekal", "9 in the evening")
      // — the model gave no end time, so assume the event lasts 1 hour.
      if (key === "startTime" && containsTimeOfDayWord(raw) && typeof e.endTime !== "string") {
        e.endTime = addMinutes(normalized, 60);
      }
    }
    if (typeof e.weekday === "string") {
      const code = WEEKDAY_BY_NAME[e.weekday.trim().toLowerCase()];
      if (code) e.weekday = code;
    }
    if (typeof e.confidence === "string") {
      const n = Number(e.confidence);
      if (Number.isFinite(n)) e.confidence = n;
    }
    if (typeof e.date === "string") {
      const parts = e.date.trim().replace(/\//g, "-").split("-");
      if (parts.length === 3 && parts[0].length === 4) {
        e.date = `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
      }
    }
    return e;
  });
  return out;
}

type SupportedMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

function parseDataUrl(dataUrl: string): { mediaType: SupportedMediaType; base64: string } {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Image is not a valid data URL.");
  const mediaType = match[1].toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mediaType)) {
    throw new Error(`Unsupported image type: ${mediaType}`);
  }
  return { mediaType: mediaType as SupportedMediaType, base64: match[2] };
}

/**
 * Real vision extractor (Step 5, server only). Calls Claude with the
 * per-category system prompt, validates with Zod, and retries once
 * with a "fix your JSON" message on validation failure.
 * The Anthropic SDK is imported dynamically so the browser bundle
 * never includes it — this class is only ever run on the server.
 */
export class AnthropicExtractor implements ScheduleExtractor {
  async extract(input: ExtractInput): Promise<ExtractResult> {
    const { getSystemPrompt } = await import("@/lib/ai/prompts/index");
    const { mediaType, base64 } = parseDataUrl(input.imageDataUrl);
    const slug = input.category === "auto" ? "class-routine" : input.category;
    const system = await getSystemPrompt(slug, {
      locale: input.locale,
      timezone: input.timezone,
      referenceDate: input.referenceDate,
    });
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      defaultHeaders: getAnthropicExtraHeaders(),
    });
    const userContent: Anthropic.MessageParam["content"] = [
      {
        type: "image",
        source: { type: "base64", media_type: mediaType, data: base64 },
      },
      {
        type: "text",
        text: `Extract the schedule from this photo. Category hint: ${input.category}. User timezone: ${input.timezone}. Reference date: ${input.referenceDate}. Return JSON only, matching the schema in the system prompt.`,
      },
    ];

    const call = async (messages: Anthropic.MessageParam[]) => {
      try {
        return await client.messages.create({
          model: getAnthropicModel(),
          max_tokens: MAX_OUTPUT_TOKENS,
          system,
          messages,
        });
      } catch (err) {
        // An API failure (bad key, rate limit, overload) is not a
        // photo problem and a retry of the same call will not fix it.
        throw classifyExtractionError(err);
      }
    };

    const first = await call([{ role: "user", content: userContent }]);
    const firstText = responseText(first.content);
    try {
      return validate(
        extractResultSchema.parse(normalizeExtractedJson(extractJsonFromText(firstText))),
      );
    } catch (err) {
      // Log the (content-free) validation problems so a slow scan
      // can be diagnosed from the server log without logging any
      // extracted content: e.g. "events.2.startTime: invalid_format".
      const firstHints = validationHints(err);
      if (firstHints) console.warn(`[extract] first_attempt_invalid: ${firstHints}`);
      // Retry once: show the model its bad output and ask it to fix
      // it — compactly, so a reply that was truncated for length has
      // room, and with the exact validation problems so it does not
      // repeat the same mistake. An empty first reply cannot be
      // echoed back as an assistant message (the API rejects empty
      // text blocks), so in that case retry from scratch.
      const hints = validationHints(err);
      const fixInstruction =
        "Your previous reply was not valid JSON matching the required schema. " +
        "Reply again with ONLY the corrected JSON object, exactly matching the schema. " +
        "Keep every notes and warnings entry to one short sentence. Do not add any explanation." +
        (hints ? ` Validation problems: ${hints}.` : "");
      const second = firstText.trim()
        ? await call([
            { role: "user", content: userContent },
            { role: "assistant", content: firstText },
            { role: "user", content: fixInstruction },
          ])
        : await call([
            {
              role: "user",
              content: [
                ...userContent,
                {
                  type: "text",
                  text: "Your previous reply was empty. Reply with ONLY the JSON object, exactly matching the schema. Keep every notes and warnings entry to one short sentence.",
                },
              ],
            },
          ]);
      const secondText = responseText(second.content);
      try {
        return validate(
          extractResultSchema.parse(normalizeExtractedJson(extractJsonFromText(secondText))),
        );
      } catch {
        // Both attempts failed to produce valid output — say so
        // distinctly instead of the generic "couldn't read it".
        throw new ExtractionError(
          "invalid_output",
          502,
          "model_output_invalid_after_retry",
        );
      }
    }
  }
}

/**
 * Server-side extractor choice (Step 5): real Claude when a key is
 * configured, otherwise the mock so the UI still works with no key.
 */
export function getServerExtractor(): ScheduleExtractor {
  return hasAnthropicKey() ? new AnthropicExtractor() : new MockExtractor();
}

/** Error thrown by the API-backed extractor, with a machine-readable code. */
export class ApiExtractError extends Error {
  code: string;
  retryAfterSeconds?: number;
  constructor(code: string, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "ApiExtractError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Client-side extractor (Step 5): POSTs the processed image to
 * /api/extract. The server decides between Claude and the mock, so
 * the UI works identically with or without an API key.
 */
export class ApiExtractor implements ScheduleExtractor {
  async extract(input: ExtractInput): Promise<ExtractResult> {
    // Prefer the Blob the caller already has: re-fetching the data URL
    // to make one is a needless failure point (see ExtractInput).
    const blob =
      input.imageBlob ?? (await (await fetch(input.imageDataUrl)).blob());
    const form = new FormData();
    form.append("image", blob, "routine.jpg");
    form.append("category", input.category);
    form.append("locale", input.locale);
    form.append("timezone", input.timezone);
    form.append("referenceDate", input.referenceDate);
    const res = await fetch("/api/extract", { method: "POST", body: form });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
      retryAfterSeconds?: number;
    } & Partial<ExtractResult>;
    if (!res.ok) {
      throw new ApiExtractError(
        body.error ?? "extraction_failed",
        body.message ?? "Extraction failed.",
        body.retryAfterSeconds,
      );
    }
    return validate(extractResultSchema.parse(body));
  }
}

/**
 * Step 5: the browser always talks to /api/extract (which falls back
 * to the mock server-side when no key is set). The mock is still
 * available directly for tests and offline demos via MockExtractor.
 */
export function createExtractor(): ScheduleExtractor {
  return new ApiExtractor();
}
