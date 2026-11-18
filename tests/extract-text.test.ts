import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import { POST as extractTextPOST } from "@/app/api/extract-text/route";
import {
  extractText,
  getServerTextExtractor,
  MAX_TEXT_LENGTH,
  validateExtractTextInput,
  type ExtractTextInput,
} from "@/lib/ai/extract-text";
import { ExtractionError } from "@/lib/ai/extractor";
import {
  __resetRateLimitForTests,
  getDailyScanLimit,
} from "@/lib/rate-limit";

/**
 * Tests for pasted-text extraction (Part C) — no real API calls: the
 * Anthropic SDK is mocked, the route is exercised with a stub request
 * and the mock extractor when no key is set.
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

const baseInput: ExtractTextInput = {
  text: "Monday Physics 09:00-10:00 Room 204",
  category: "class-routine",
  locale: "en",
  timezone: "Asia/Dhaka",
  referenceDate: "2026-11-16",
};

// Mock the Anthropic SDK (dynamically imported by extractText).
const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

function anthropicReply(text: string) {
  return { content: [{ type: "text", text }] };
}

describe("validateExtractTextInput", () => {
  it("accepts a normal paste", () => {
    expect(() => validateExtractTextInput(baseInput)).not.toThrow();
  });

  it("rejects empty or whitespace-only text", () => {
    expect(() => validateExtractTextInput({ ...baseInput, text: "" })).toThrow();
    expect(() => validateExtractTextInput({ ...baseInput, text: "   \n " })).toThrow();
  });

  it("rejects text over MAX_TEXT_LENGTH", () => {
    expect(MAX_TEXT_LENGTH).toBe(20000);
    expect(() =>
      validateExtractTextInput({ ...baseInput, text: "x".repeat(MAX_TEXT_LENGTH + 1) }),
    ).toThrow();
  });

  it("rejects an unknown category", () => {
    expect(() =>
      validateExtractTextInput({ ...baseInput, category: "other" as never }),
    ).toThrow();
  });
});

describe("extractText (mocked Anthropic client)", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("sends the pasted text (not an image) and returns the ExtractResult shape", async () => {
    mockCreate.mockResolvedValue(anthropicReply(JSON.stringify(validResult)));
    const result = await extractText(baseInput);
    expect(result).toEqual(validResult);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const call = mockCreate.mock.calls[0][0] as {
      model: string;
      max_tokens: number;
      messages: { content: unknown[] }[];
    };
    expect(call.max_tokens).toBe(8192);
    expect(call.model).toMatch(/^claude-sonnet-/);
    const userContent = call.messages[0].content as { type: string; text?: string }[];
    expect(userContent).toHaveLength(1);
    expect(userContent[0].type).toBe("text");
    expect(userContent[0].text).toContain("Monday Physics 09:00-10:00 Room 204");
    expect(JSON.stringify(call)).not.toContain('"image"');
  });

  it("retries once after invalid JSON and returns the fixed reply", async () => {
    mockCreate
      .mockResolvedValueOnce(anthropicReply("not json at all"))
      .mockResolvedValueOnce(anthropicReply(JSON.stringify(validResult)));
    const result = await extractText(baseInput);
    expect(result).toEqual(validResult);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("throws invalid_output (502) when both attempts fail", async () => {
    mockCreate.mockResolvedValue(anthropicReply("still not json"));
    const err = await extractText(baseInput).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExtractionError);
    expect((err as ExtractionError).code).toBe("invalid_output");
    expect((err as ExtractionError).httpStatus).toBe(502);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("maps an Anthropic 429 to ai_unavailable (503) without retrying", async () => {
    const rateErr = new Error("rate limited") as Error & { status: number };
    rateErr.status = 429;
    mockCreate.mockRejectedValue(rateErr);
    const err = await extractText(baseInput).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExtractionError);
    expect((err as ExtractionError).code).toBe("ai_unavailable");
    expect((err as ExtractionError).httpStatus).toBe(503);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

describe("mock fallback when no Anthropic key is set", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it("returns the same demo events as the photo mock", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await getServerTextExtractor().extractText(baseInput);
    expect(result.detectedCategory).toBe("class-routine");
    expect(result.events).toHaveLength(5);
    expect(result.events[0].title).toBe("Physics");
  });
});

describe("POST /api/extract-text route", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  /** Minimal stand-in for a NextRequest — only json() + headers are read. */
  const requestFor = (body: unknown, ip = "203.0.113.10") =>
    ({
      json: async () => body,
      headers: new Headers({ "x-forwarded-for": ip }),
    }) as unknown as NextRequest;

  beforeEach(() => {
    __resetRateLimitForTests();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it("returns 400 invalid_request for empty text (and makes no AI call)", async () => {
    mockCreate.mockReset();
    const res = await extractTextPOST(requestFor({ text: "  ", category: "auto" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_request");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 400 for a missing text field and for an unreadable body", async () => {
    const missing = await extractTextPOST(requestFor({ category: "auto" }));
    expect(missing.status).toBe(400);
    expect(((await missing.json()) as { error: string }).error).toBe("invalid_request");
    const badJson = await extractTextPOST({
      json: async () => {
        throw new Error("bad json");
      },
      headers: new Headers(),
    } as unknown as NextRequest);
    expect(badJson.status).toBe(400);
  });

  it("returns 400 for text over the limit and for a bad category", async () => {
    const tooLong = await extractTextPOST(
      requestFor({ text: "x".repeat(MAX_TEXT_LENGTH + 1), category: "auto" }),
    );
    expect(tooLong.status).toBe(400);
    expect(((await tooLong.json()) as { error: string }).error).toBe("invalid_request");
    const badCategory = await extractTextPOST(
      requestFor({ text: "Monday Physics 09:00", category: "other" }),
    );
    expect(badCategory.status).toBe(400);
    expect(((await badCategory.json()) as { error: string }).error).toBe("invalid_request");
  });

  it("returns the ExtractResult shape (mock fallback, no key) with rate-limit headers", async () => {
    const res = await extractTextPOST(
      requestFor({
        text: "Monday Physics 09:00-10:00 Room 204",
        category: "class-routine",
        locale: "en",
        timezone: "Asia/Dhaka",
        referenceDate: "2026-11-16",
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: unknown[]; detectedCategory: string };
    expect(body.detectedCategory).toBe("class-routine");
    expect(body.events).toHaveLength(5);
    expect(res.headers.get("X-RateLimit-Limit")).toBe(String(getDailyScanLimit()));
  });

  it("shares the 5/day per-IP limit with /api/extract", async () => {
    const ip = "203.0.113.11";
    const payload = { text: "Monday Physics 09:00", category: "auto" };
    expect(getDailyScanLimit()).toBe(5);
    for (let i = 0; i < 5; i += 1) {
      const res = await extractTextPOST(requestFor(payload, ip));
      expect(res.status).toBe(200);
    }
    const blocked = await extractTextPOST(requestFor(payload, ip));
    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as { error: string; retryAfterSeconds: number };
    expect(body.error).toBe("rate_limited");
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
    // A different IP is unaffected.
    const other = await extractTextPOST(requestFor(payload, "203.0.113.12"));
    expect(other.status).toBe(200);
  }, 15000); // mock extraction delays 1.4s per successful call
});
