import { describe, expect, it, beforeEach } from "vitest";
import {
  extractJsonFromText,
  getAnthropicModel,
  getServerExtractor,
  hasAnthropicKey,
  MockExtractor,
  DEFAULT_ANTHROPIC_MODEL,
} from "@/lib/ai/extractor";
import { getSystemPrompt, PROMPT_CATEGORIES } from "@/lib/ai/prompts/index";
import { extractResultSchema } from "@/lib/ai/schema";
import {
  __resetRateLimitForTests,
  checkRateLimit,
  getDailyScanLimit,
} from "@/lib/rate-limit";

/**
 * Step 5 tests — no real API calls: Zod validation, prompt files,
 * in-memory rate limiting, and the mock fallback when no key is set.
 */

const validResult = {
  detectedCategory: "class-routine",
  language: "mixed",
  assumptions: ["Year assumed 2026"],
  warnings: [],
  events: [
    {
      title: "Physics",
      weekday: "MO",
      startTime: "09:00",
      endTime: "10:00",
      location: "Room 204",
      recurrence: { freq: "WEEKLY" },
      reminderMinutesBefore: [30],
      confidence: 0.95,
    },
  ],
};

describe("ExtractResult Zod schema", () => {
  it("accepts a valid extraction result", () => {
    expect(extractResultSchema.parse(validResult).events).toHaveLength(1);
  });

  it("rejects an event with no title", () => {
    expect(() =>
      extractResultSchema.parse({ ...validResult, events: [{ ...validResult.events[0], title: "" }] }),
    ).toThrow();
  });

  it("rejects a 25-hour time and a confidence above 1", () => {
    expect(() =>
      extractResultSchema.parse({
        ...validResult,
        events: [{ ...validResult.events[0], startTime: "25:00" }],
      }),
    ).toThrow();
    expect(() =>
      extractResultSchema.parse({
        ...validResult,
        events: [{ ...validResult.events[0], confidence: 1.5 }],
      }),
    ).toThrow();
  });

  it("rejects an unknown category and an empty events list", () => {
    expect(() => extractResultSchema.parse({ ...validResult, detectedCategory: "other" })).toThrow();
    expect(() => extractResultSchema.parse({ ...validResult, events: [] })).toThrow();
  });

  it("rejects a bad date format", () => {
    expect(() =>
      extractResultSchema.parse({
        ...validResult,
        events: [{ ...validResult.events[0], date: "16/11/2026" }],
      }),
    ).toThrow();
  });
});

describe("extractJsonFromText", () => {
  it("parses plain JSON", () => {
    expect(extractJsonFromText('{"a": 1}')).toEqual({ a: 1 });
  });

  it("parses ```json fenced output", () => {
    expect(extractJsonFromText('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it("tolerates a short preamble before the JSON", () => {
    expect(extractJsonFromText('Here is the result:\n{"a": 1}')).toEqual({ a: 1 });
  });

  it("throws when there is no JSON object", () => {
    expect(() => extractJsonFromText("no json here")).toThrow();
  });
});

describe("per-category prompts", () => {
  it("has a prompt file for every category", () => {
    expect(PROMPT_CATEGORIES).toHaveLength(6);
    expect(PROMPT_CATEGORIES).toContain("medicine-schedule");
  });

  it.each(PROMPT_CATEGORIES)("prompt for %s contains the base rules and a JSON example", async (slug) => {
    const prompt = await getSystemPrompt(slug, {
      locale: "en",
      timezone: "Asia/Dhaka",
      referenceDate: "2026-11-16",
    });
    expect(prompt).toContain("Never invent");
    expect(prompt).toContain("JSON only");
    expect(prompt).toContain("detectedCategory");
    expect(prompt).toContain("2026-11-16");
    expect(prompt).toContain("Asia/Dhaka");
  });

  it("duty-roster prompt covers midnight shifts and shift codes", async () => {
    const prompt = await getSystemPrompt("duty-roster", {
      locale: "en",
      timezone: "Asia/Tokyo",
      referenceDate: "2026-11-16",
    });
    expect(prompt).toMatch(/midnight/i);
    expect(prompt).toContain("A/B/C");
  });

  it("medicine prompt covers 1+0+1 notation and never inventing a dose", async () => {
    const prompt = await getSystemPrompt("medicine-schedule", {
      locale: "en",
      timezone: "Asia/Dhaka",
      referenceDate: "2026-11-16",
    });
    expect(prompt).toContain("1+0+1");
    expect(prompt).toMatch(/NEVER invent/i);
  });

  it("invitation prompt flags Bengali/Hijri dates for confirmation", async () => {
    const prompt = await getSystemPrompt("invitation-card", {
      locale: "bn",
      timezone: "Asia/Dhaka",
      referenceDate: "2026-11-16",
    });
    expect(prompt).toMatch(/Bengali|Hijri/i);
  });
});

describe("rate limiting (in-memory fallback)", () => {
  beforeEach(() => {
    __resetRateLimitForTests();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("allows scans up to the limit, then blocks", async () => {
    const ip = "203.0.113.1";
    for (let i = 0; i < 3; i += 1) {
      const r = await checkRateLimit(ip, { limit: 3 });
      expect(r.success).toBe(true);
      expect(r.remaining).toBe(2 - i);
    }
    const blocked = await checkRateLimit(ip, { limit: 3 });
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.limit).toBe(3);
  });

  it("limits per IP independently", async () => {
    await checkRateLimit("203.0.113.2", { limit: 1 });
    expect((await checkRateLimit("203.0.113.2", { limit: 1 })).success).toBe(false);
    expect((await checkRateLimit("203.0.113.3", { limit: 1 })).success).toBe(true);
  });

  it("defaults to 5 scans per day, configurable via env", () => {
    delete process.env.DAILY_SCAN_LIMIT;
    expect(getDailyScanLimit()).toBe(5);
    process.env.DAILY_SCAN_LIMIT = "10";
    expect(getDailyScanLimit()).toBe(10);
    process.env.DAILY_SCAN_LIMIT = "not-a-number";
    expect(getDailyScanLimit()).toBe(5);
    delete process.env.DAILY_SCAN_LIMIT;
  });
});

describe("mock fallback when no Anthropic key is set", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_MODEL;
  });

  it("reports no key and uses the mock extractor", () => {
    expect(hasAnthropicKey()).toBe(false);
    expect(getServerExtractor()).toBeInstanceOf(MockExtractor);
  });

  it("defaults to a current Claude Sonnet model, overridable via env", () => {
    expect(getAnthropicModel()).toBe(DEFAULT_ANTHROPIC_MODEL);
    expect(DEFAULT_ANTHROPIC_MODEL).toMatch(/^claude-sonnet-/);
    process.env.ANTHROPIC_MODEL = "claude-opus-4-1";
    expect(getAnthropicModel()).toBe("claude-opus-4-1");
    delete process.env.ANTHROPIC_MODEL;
  });
});
