import { addDays, format } from "date-fns";
import type Anthropic from "@anthropic-ai/sdk";
import type { CategorySlug } from "@/config/categories";
import { extractResultSchema, type CategoryInput, type ExtractResult } from "@/lib/ai/schema";
import { nextMonday } from "@/lib/dates";

/**
 * Extractor interface (spec §9). The scan UI only ever talks to this
 * interface. Step 5 replaces `createExtractor()`'s server branch with a
 * call to /api/extract — the UI does not change.
 */
export interface ExtractInput {
  /** Processed image as a data URL (already resized + EXIF-stripped). */
  imageDataUrl: string;
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
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5";

export function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
}

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
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
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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

    const call = async (messages: Anthropic.MessageParam[]) =>
      client.messages.create({
        model: getAnthropicModel(),
        max_tokens: 4096,
        system,
        messages,
      });

    const first = await call([{ role: "user", content: userContent }]);
    const firstText = responseText(first.content);
    try {
      return validate(extractResultSchema.parse(extractJsonFromText(firstText)));
    } catch {
      // Retry once: show the model its bad output and ask it to fix it.
      const second = await call([
        { role: "user", content: userContent },
        { role: "assistant", content: firstText },
        {
          role: "user",
          content:
            "Your previous reply was not valid JSON matching the required schema. Reply again with ONLY the corrected JSON object, exactly matching the schema. Do not add any explanation.",
        },
      ]);
      const secondText = responseText(second.content);
      return validate(extractResultSchema.parse(extractJsonFromText(secondText)));
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
    const blob = await (await fetch(input.imageDataUrl)).blob();
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
