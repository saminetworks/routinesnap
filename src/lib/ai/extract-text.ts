import type Anthropic from "@anthropic-ai/sdk";
import {
  classifyExtractionError,
  extractJsonFromText,
  ExtractionError,
  getAnthropicModel,
  hasAnthropicKey,
  MAX_OUTPUT_TOKENS,
  MockExtractor,
} from "@/lib/ai/extractor";
import {
  categoryInputSchema,
  extractResultSchema,
  type CategoryInput,
  type ExtractResult,
} from "@/lib/ai/schema";

/**
 * Text extraction (Part C): pasted routine text -> structured events
 * JSON, via the same per-category prompts, schema and Anthropic call
 * pattern as the photo extractor (src/lib/ai/extractor.ts).
 *
 * The only difference is the user message: pasted text instead of an
 * image block. The system prompt is photo-worded ("visible in the
 * image"), so the user message states explicitly that the schedule
 * arrives as plain text and the same rules apply to it.
 *
 * No key configured -> the mock extractor (same demo fallback as
 * /api/extract), so the paste flow works offline / without a key.
 *
 * NOTE: `responseText` and `validationHints` are NOT exported by
 * extractor.ts, so the minimal equivalents live here (same behaviour,
 * content-free hints only) instead of editing extractor.ts.
 */

/** Pasted text longer than this is rejected (route returns 400). */
export const MAX_TEXT_LENGTH = 20000;

export interface ExtractTextInput {
  /** Pasted routine text. */
  text: string;
  category: CategoryInput;
  locale: "en" | "bn" | "ja";
  timezone: string;
  /** ISO date used to resolve relative dates / missing years. */
  referenceDate: string;
}

export interface TextExtractor {
  extractText(input: ExtractTextInput): Promise<ExtractResult>;
}

/** Defensive validation: the route validates first (400s); this guards direct callers. */
export function validateExtractTextInput(input: ExtractTextInput): void {
  if (typeof input.text !== "string" || input.text.trim().length === 0) {
    throw new Error("Text is empty.");
  }
  if (input.text.length > MAX_TEXT_LENGTH) {
    throw new Error("Text is too long.");
  }
  categoryInputSchema.parse(input.category);
}

/** Join the text blocks of a Claude response into one string. */
function responseText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n");
}

/**
 * Turn a Zod validation failure into a short, content-free hint for
 * the retry prompt: field paths and issue codes only, never values.
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

/**
 * Real text extractor (server only). Calls Claude with the
 * per-category system prompt, validates with Zod, and retries once
 * with a "fix your JSON" message on validation failure — the same
 * pattern as AnthropicExtractor, minus the image block.
 * The Anthropic SDK is imported dynamically so the browser bundle
 * never includes it.
 */
export async function extractText(input: ExtractTextInput): Promise<ExtractResult> {
  validateExtractTextInput(input);
  const { getSystemPrompt } = await import("@/lib/ai/prompts/index");
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
      type: "text",
      text:
        `Extract the schedule from the following text. This is plain pasted text, not a photo — ` +
        `apply the same rules to this text: extract only what is written here, never invent anything. ` +
        `Category hint: ${input.category}. User timezone: ${input.timezone}. ` +
        `Reference date: ${input.referenceDate}. Return JSON only, matching the schema in the system prompt.\n\n` +
        `SCHEDULE TEXT:\n${input.text}`,
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
      // An API failure (bad key, rate limit, overload) is not a text
      // problem and a retry of the same call will not fix it.
      throw classifyExtractionError(err);
    }
  };

  const first = await call([{ role: "user", content: userContent }]);
  const firstText = responseText(first.content);
  try {
    return extractResultSchema.parse(extractJsonFromText(firstText));
  } catch (err) {
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
      return extractResultSchema.parse(extractJsonFromText(secondText));
    } catch {
      // Both attempts failed to produce valid output — say so
      // distinctly instead of the generic "couldn't read it".
      throw new ExtractionError("invalid_output", 502, "model_output_invalid_after_retry");
    }
  }
}

/**
 * Mock-backed text extractor (no key): reuses the photo mock, which
 * ignores its input and returns realistic per-category demo events.
 * The dummy data URL is never sent anywhere.
 */
class MockTextExtractor implements TextExtractor {
  async extractText(input: ExtractTextInput): Promise<ExtractResult> {
    const mock = new MockExtractor();
    return mock.extract({
      imageDataUrl: "data:image/png;base64,xxxx",
      category: input.category,
      locale: input.locale,
      timezone: input.timezone,
      referenceDate: input.referenceDate,
    });
  }
}

/** Server-side text extractor choice: real Claude when a key is configured, otherwise the mock. */
export function getServerTextExtractor(): TextExtractor {
  return hasAnthropicKey() ? { extractText } : new MockTextExtractor();
}
