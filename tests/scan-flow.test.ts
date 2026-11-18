import { describe, expect, it, afterEach } from "vitest";
import { MockExtractor } from "@/lib/ai/extractor";
import { getServerTextExtractor } from "@/lib/ai/extract-text";
import { generateIcs } from "@/lib/ics";

/**
 * End-to-end smoke test of the Step 3 mock flow into Step 4 export:
 * mock extract -> edited events -> .ics file. No API key needed.
 */
describe("mock extract -> .ics", () => {
  const extractor = new MockExtractor();
  const weekStart = new Date("2026-11-16T00:00:00");
  const repeatUntil = new Date("2027-02-08T00:00:00");

  it("class routine mock produces 5 weekly VEVENTs with RRULEs and VALARMs", async () => {
    const result = await extractor.extract({
      imageDataUrl: "data:image/png;base64,xxxx",
      category: "class-routine",
      locale: "en",
      timezone: "Asia/Dhaka",
      referenceDate: "2026-11-16",
    });
    const ics = generateIcs(result.events, {
      weekStart,
      timezone: "Asia/Dhaka",
      repeatUntil,
    });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(5);
    expect(ics).toContain("RRULE:FREQ=WEEKLY;UNTIL=20270208T175959Z");
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER:-PT30M");
    expect(ics).toContain("SUMMARY:Physics");
    expect(ics).toContain("LOCATION:Room 204");
  });

  it("duty roster mock keeps the night shift crossing midnight", async () => {
    const result = await extractor.extract({
      imageDataUrl: "data:image/png;base64,xxxx",
      category: "duty-roster",
      locale: "en",
      timezone: "Asia/Tokyo",
      referenceDate: "2026-11-16",
    });
    const ics = generateIcs(result.events, {
      weekStart,
      timezone: "Asia/Tokyo",
      repeatUntil,
    });
    // Mock anchors to nextMonday(2026-11-16) = 2026-11-23; night shift is +2 days.
    expect(ics).toContain("DTSTART;TZID=Asia/Tokyo:20261125T220000");
    expect(ics).toContain("DTEND;TZID=Asia/Tokyo:20261126T060000");
  });

  it("exam mock keeps multiple reminders per event", async () => {
    const result = await extractor.extract({
      imageDataUrl: "data:image/png;base64,xxxx",
      category: "exam-routine",
      locale: "en",
      timezone: "Asia/Dhaka",
      referenceDate: "2026-11-16",
    });
    const ics = generateIcs(result.events, {
      weekStart,
      timezone: "Asia/Dhaka",
      repeatUntil,
    });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    // Each exam has [1440, 120] -> 6 VALARMs total.
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(6);
    expect(ics).toContain("TRIGGER:-P1D");
    expect(ics).toContain("TRIGGER:-PT2H");
  });
});

describe("pasted text -> .ics (same confirm/export flow as photo)", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it("mock text extraction feeds the same .ics export", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const result = await getServerTextExtractor().extractText({
      text: "Monday Physics 09:00-10:00 Room 204",
      category: "class-routine",
      locale: "en",
      timezone: "Asia/Dhaka",
      referenceDate: "2026-11-16",
    });
    const ics = generateIcs(result.events, {
      weekStart: new Date("2026-11-16T00:00:00"),
      timezone: "Asia/Dhaka",
      repeatUntil: new Date("2027-02-08T00:00:00"),
    });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(5);
    expect(ics).toContain("SUMMARY:Physics");
  });
});
