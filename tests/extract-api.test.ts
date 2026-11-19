import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import { GET as healthGET } from "@/app/api/health/route";
import {
  ApiExtractor,
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
  normalizeExtractedJson,
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

describe("normalizeExtractedJson", () => {
  // A first attempt that reads the schedule right but writes times the
  // way they appear in the photo ("8:30", "1:00 PM") must still pass
  // the strict schema instead of forcing a second, slow AI call.
  it("pads unpadded hours and converts 12-hour times to 24-hour HH:mm", () => {
    const out = normalizeExtractedJson({
      ...validResult,
      events: [
        { ...validResult.events[0], startTime: "8:30", endTime: "10:00" },
        { ...validResult.events[0], startTime: "1:00 PM", endTime: "2:30 PM" },
        { ...validResult.events[0], startTime: "12:00 AM", endTime: "12:00 PM" },
      ],
    }) as typeof validResult;
    expect(out.events[0].startTime).toBe("08:30");
    expect(out.events[1].startTime).toBe("13:00");
    expect(out.events[1].endTime).toBe("14:30");
    expect(out.events[2].startTime).toBe("00:00");
    expect(out.events[2].endTime).toBe("12:00");
    expect(() => extractResultSchema.parse(out)).not.toThrow();
  });

  it("maps weekday and language names and string confidences to schema values", () => {
    const out = normalizeExtractedJson({
      detectedCategory: "class_routine",
      language: "English",
      assumptions: [],
      warnings: [],
      events: [
        { ...validResult.events[0], weekday: "Saturday", confidence: "0.9" },
        { ...validResult.events[0], weekday: "sa", confidence: "0.8" },
      ],
    }) as typeof validResult;
    expect(out.detectedCategory).toBe("class-routine");
    expect(out.language).toBe("en");
    expect(out.events[0].weekday).toBe("SA");
    expect(out.events[0].confidence).toBe(0.9);
    expect(out.events[1].weekday).toBe("SA");
    expect(() => extractResultSchema.parse(out)).not.toThrow();
  });

  it("leaves unparsable values untouched so validation still rejects them", () => {
    const out = normalizeExtractedJson({
      ...validResult,
      events: [{ ...validResult.events[0], startTime: "half past eight" }],
    });
    expect(() => extractResultSchema.parse(out)).toThrow();
  });

  it("turns time-of-day words into times and assumes a 1-hour event", () => {
    const out = normalizeExtractedJson({
      ...validResult,
      events: [
        { ...validResult.events[0], startTime: "morning", endTime: undefined },
        { ...validResult.events[0], startTime: "bekal", endTime: undefined },
        { ...validResult.events[0], startTime: "9 in the evening", endTime: undefined },
        { ...validResult.events[0], startTime: "সকাল", endTime: undefined },
      ],
    }) as typeof validResult;
    expect(out.events[0].startTime).toBe("09:00");
    expect(out.events[0].endTime).toBe("10:00");
    expect(out.events[1].startTime).toBe("16:00");
    expect(out.events[1].endTime).toBe("17:00");
    expect(out.events[2].startTime).toBe("21:00");
    expect(out.events[2].endTime).toBe("22:00");
    expect(out.events[3].startTime).toBe("09:00");
    expect(() => extractResultSchema.parse(out)).not.toThrow();
  });
});

describe("ApiExtractor (browser upload)", () => {
  const input = {
    imageDataUrl: "data:image/jpeg;base64,/9j/",
    category: "class-routine" as const,
    locale: "en" as const,
    timezone: "Asia/Dhaka",
    referenceDate: "2026-11-19",
  };

  it("uploads the provided blob directly without re-fetching the data URL", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("/api/extract");
      return {
        ok: true,
        json: async () => validResult,
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const out = await new ApiExtractor().extract({
        ...input,
        imageBlob: new Blob(["fake-jpeg"], { type: "image/jpeg" }),
      });
      expect(out.events).toHaveLength(1);
      // One fetch only — the /api/extract POST. A data-URL fetch here
      // would be a second call and a needless failure point.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const form = fetchMock.mock.calls[0][1].body as FormData;
      expect(form.get("image")).toBeInstanceOf(Blob);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("falls back to fetching the data URL when no blob is provided", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith("data:")) {
        return { blob: async () => new Blob(["fake-jpeg"], { type: "image/jpeg" }) } as Response;
      }
      return { ok: true, json: async () => validResult } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const out = await new ApiExtractor().extract(input);
      expect(out.events).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][0]).toBe(input.imageDataUrl);
      expect(fetchMock.mock.calls[1][0]).toBe("/api/extract");
    } finally {
      vi.unstubAllGlobals();
    }
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

  it("base rules tell the model how to read a blurry or dark photo", async () => {
    const prompt = await getSystemPrompt("class-routine", {
      locale: "en",
      timezone: "Asia/Dhaka",
      referenceDate: "2026-11-17",
    });
    expect(prompt).toContain("blurry, dark or low quality");
    expect(prompt).toContain("course codes and room numbers");
  });

  it("class-routine prompt converts AM/PM times to 24-hour", async () => {
    const prompt = await getSystemPrompt("class-routine", {
      locale: "en",
      timezone: "Asia/Dhaka",
      referenceDate: "2026-11-17",
    });
    expect(prompt).toContain('"1:00 PM"');
    expect(prompt).toContain('"13:00"');
  });

  it("base rules cover handwriting and time-of-day words", async () => {
    const prompt = await getSystemPrompt("class-routine", {
      locale: "en",
      timezone: "Asia/Dhaka",
      referenceDate: "2026-11-17",
    });
    expect(prompt).toContain("HANDWRITTEN");
    expect(prompt).toContain("sokal");
    expect(prompt).toContain("bekal");
    expect(prompt).toContain("9 in the evening");
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
  const originalWorkspace = process.env.ANTHROPIC_WORKSPACE_ID;

  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.ANTHROPIC_MODEL;
    else process.env.ANTHROPIC_MODEL = originalModel;
    if (originalWorkspace === undefined) delete process.env.ANTHROPIC_WORKSPACE_ID;
    else process.env.ANTHROPIC_WORKSPACE_ID = originalWorkspace;
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
    delete process.env.ANTHROPIC_WORKSPACE_ID;
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
      workspaceConfigured: false,
      keyCheckStatus: null,
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
      workspaceConfigured: false,
      keyCheckStatus: 200,
    });
    // The key itself is never returned.
    expect(JSON.stringify(body)).not.toContain("sk-ant-test-123");
  });

  it("deep with a workspace id sends the header and reports it (not the value)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-123";
    process.env.ANTHROPIC_WORKSPACE_ID = "wrkspc_01Test";
    const fetchSpy = vi.fn().mockResolvedValue({ status: 200 });
    vi.stubGlobal("fetch", fetchSpy);
    const body = await (await healthGET(deepRequest())).json();
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(init.headers["anthropic-workspace-id"]).toBe("wrkspc_01Test");
    expect(body.workspaceConfigured).toBe(true);
    expect(body.keyCheckStatus).toBe(200);
    // Neither secret is ever returned.
    expect(JSON.stringify(body)).not.toContain("sk-ant-test-123");
    expect(JSON.stringify(body)).not.toContain("wrkspc_01Test");
  });

  it("deep with a rejected key (401) reports keyValid false and the status", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-bad";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 401 }));
    const body = await (await healthGET(deepRequest())).json();
    expect(body.keyConfigured).toBe(true);
    expect(body.keyValid).toBe(false);
    expect(body.keyCheckStatus).toBe(401);
    expect(JSON.stringify(body)).not.toContain("sk-ant-bad");
  });

  it("deep never throws on a network error — keyValid false, status null", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-123";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const body = await (await healthGET(deepRequest())).json();
    expect(body.keyValid).toBe(false);
    expect(body.keyCheckStatus).toBeNull();
  });

  it("deep reports the configured model name via getAnthropicModel()", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-123";
    process.env.ANTHROPIC_MODEL = "claude-opus-4-1";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200 }));
    const body = await (await healthGET(deepRequest())).json();
    expect(body.model).toBe("claude-opus-4-1");
  });
});
