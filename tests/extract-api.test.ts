import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import { GET as healthGET } from "@/app/api/health/route";
import {
  classifyExtractionError,
  extractJsonFromText,
  ExtractionError,
  getAnthropicExtraHeaders,
  getAnthropicModel,
  getAnthropicWorkspaceId,
  getServerExtractor,
  hasAnthropicKey,
  MAX_OUTPUT_TOKENS,
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

  it("rejects an unknown category but accepts an empty events list", () => {
    expect(() => extractResultSchema.parse({ ...validResult, detectedCategory: "other" })).toThrow();
    // Empty is valid: the prompt tells the model to return events: []
    // when the image holds no readable schedule, and the scan UI
    // already renders that as a friendly "nothing found" state.
    expect(extractResultSchema.parse({ ...validResult, events: [] }).events).toHaveLength(0);
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

  it("parses fenced JSON with a preamble and trailing text", () => {
    expect(
      extractJsonFromText(
        'Here is the extracted schedule:\n```json\n{"a": 1, "b": {"c": [1, 2]}}\n```\nLet me know if you need anything else.',
      ),
    ).toEqual({ a: 1, b: { c: [1, 2] } });
  });

  it("throws on truncated JSON (unclosed object) so the retry path runs", () => {
    // A reply cut off by the output limit has no closing brace.
    expect(() => extractJsonFromText('{"events": [{"title": "Physics", "confidence": 0.9')).toThrow();
    expect(() =>
      extractJsonFromText('```json\n{"events": [{"title": "Physics"'),
    ).toThrow();
  });

  it("finds the JSON object inside surrounding prose", () => {
    expect(extractJsonFromText('Sure! {"a": {"b": 2}} done.')).toEqual({ a: { b: 2 } });
  });
});

describe("extraction failure classification", () => {
  it("uses a large output budget so full weekly tables are not truncated", () => {
    expect(MAX_OUTPUT_TOKENS).toBe(8192);
  });

  it("maps Anthropic server errors and overload to ai_unavailable (503)", () => {
    for (const status of [500, 502, 529]) {
      const err = new Error(`Anthropic ${status}`) as Error & { status: number };
      err.status = status;
      const classified = classifyExtractionError(err);
      expect(classified).toBeInstanceOf(ExtractionError);
      expect(classified.code).toBe("ai_unavailable");
      expect(classified.httpStatus).toBe(503);
    }
  });

  it("maps Anthropic rate limiting to ai_unavailable (503)", () => {
    const err = new Error("rate limited") as Error & { status: number };
    err.status = 429;
    const classified = classifyExtractionError(err);
    expect(classified.code).toBe("ai_unavailable");
    expect(classified.httpStatus).toBe(503);
  });

  it("keeps auth failures on the generic code (key problem, not a photo problem)", () => {
    for (const status of [401, 403]) {
      const err = new Error("auth") as Error & { status: number };
      err.status = status;
      const classified = classifyExtractionError(err);
      expect(classified.code).toBe("extraction_failed");
      expect(classified.httpStatus).toBe(502);
      expect(classified.logDetail).toContain("anthropic_auth");
    }
  });

  it("passes ExtractionErrors through unchanged", () => {
    const original = new ExtractionError("invalid_output", 502, "model_output_invalid_after_retry");
    expect(classifyExtractionError(original)).toBe(original);
  });

  it("falls back to the generic code for unknown errors, logged by name only", () => {
    const classified = classifyExtractionError(new TypeError("boom"));
    expect(classified.code).toBe("extraction_failed");
    expect(classified.httpStatus).toBe(502);
    expect(classified.logDetail).toBe("TypeError");
    expect(classified.logDetail).not.toContain("boom");
  });

  it("base rules tell the model to return events: [] when nothing is readable", async () => {
    const prompt = await getSystemPrompt("class-routine", {
      locale: "en",
      timezone: "Asia/Dhaka",
      referenceDate: "2026-11-17",
    });
    expect(prompt).toContain("events: []");
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

describe("Anthropic workspace id header (personal/user keys)", () => {
  const originalWorkspace = process.env.ANTHROPIC_WORKSPACE_ID;

  afterEach(() => {
    if (originalWorkspace === undefined) delete process.env.ANTHROPIC_WORKSPACE_ID;
    else process.env.ANTHROPIC_WORKSPACE_ID = originalWorkspace;
  });

  it("sends no workspace header when ANTHROPIC_WORKSPACE_ID is unset", () => {
    delete process.env.ANTHROPIC_WORKSPACE_ID;
    expect(getAnthropicWorkspaceId()).toBe("");
    expect(getAnthropicExtraHeaders()).toEqual({});
  });

  it("sends anthropic-workspace-id when the workspace id is set", () => {
    process.env.ANTHROPIC_WORKSPACE_ID = "wrkspc_01Test";
    expect(getAnthropicWorkspaceId()).toBe("wrkspc_01Test");
    expect(getAnthropicExtraHeaders()).toEqual({
      "anthropic-workspace-id": "wrkspc_01Test",
    });
  });

  it("trims whitespace around the workspace id", () => {
    process.env.ANTHROPIC_WORKSPACE_ID = "  wrkspc_01Test  ";
    expect(getAnthropicExtraHeaders()).toEqual({
      "anthropic-workspace-id": "wrkspc_01Test",
    });
  });
});

describe("deep health check (?deep=1)", () => {
  /** Minimal stand-in for a NextRequest — only nextUrl is read. */
  const requestFor = (url: string) =>
    ({ nextUrl: new URL(url) }) as unknown as NextRequest;
  const deepRequest = () => requestFor("http://localhost/api/health?deep=1");

  const originalFetch = globalThis.fetch;
  const originalKey = process.env.ANTHROPIC_API_KEY;
  const originalModel = process.env.ANTHROPIC_MODEL;

  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.ANTHROPIC_MODEL;
    else process.env.ANTHROPIC_MODEL = originalModel;
  });

  it("plain response stays exactly {status, extractor} — no extra fields", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await healthGET(requestFor("http://localhost/api/health"));
    const body = await res.json();
    expect(body).toEqual({ status: "ok", extractor: "mock" });
    expect(Object.keys(body).sort()).toEqual(["extractor", "status"]);
  });

  it("deep without a key: keyConfigured/keyValid false and no Anthropic call", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await healthGET(deepRequest());
    const body = await res.json();
    expect(body).toEqual({
      status: "ok",
      extractor: "mock",
      model: DEFAULT_ANTHROPIC_MODEL,
      keyConfigured: false,
      keyValid: false,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("deep with a valid key: GETs /v1/models with the key header, keyValid true", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-123";
    const fetchSpy = vi.fn().mockResolvedValue({ status: 200 });
    vi.stubGlobal("fetch", fetchSpy);
    const body = await (await healthGET(deepRequest())).json();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("https://api.anthropic.com/v1/models");
    expect(init.headers["x-api-key"]).toBe("sk-ant-test-123");
    expect(init.headers["anthropic-version"]).toBe("2023-06-01");
    expect(init.signal).toBeInstanceOf(AbortSignal);

    expect(body).toEqual({
      status: "ok",
      extractor: "anthropic",
      model: DEFAULT_ANTHROPIC_MODEL,
      keyConfigured: true,
      keyValid: true,
    });
    // The key itself is never returned.
    expect(JSON.stringify(body)).not.toContain("sk-ant-test-123");
  });

  it("deep with a rejected key (401) reports keyValid false", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-bad";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 401 }));
    const body = await (await healthGET(deepRequest())).json();
    expect(body.keyConfigured).toBe(true);
    expect(body.keyValid).toBe(false);
    expect(JSON.stringify(body)).not.toContain("sk-ant-bad");
  });

  it("deep never throws on a network error — keyValid false", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-123";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const body = await (await healthGET(deepRequest())).json();
    expect(body.keyValid).toBe(false);
  });

  it("deep reports the configured model name via getAnthropicModel()", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-123";
    process.env.ANTHROPIC_MODEL = "claude-opus-4-1";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200 }));
    const body = await (await healthGET(deepRequest())).json();
    expect(body.model).toBe("claude-opus-4-1");
  });
});
