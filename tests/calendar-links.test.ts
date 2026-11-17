import { describe, expect, it } from "vitest";
import type { EditableEvent } from "@/lib/ai/schema";
import { googleCalendarUrl } from "@/lib/calendar-links";

/** 2026-11-16 is a Monday — the week start used by the mock extractor. */
const MONDAY = new Date("2026-11-16T00:00:00");
const REPEAT_UNTIL = new Date("2027-02-08T00:00:00");
const OPTS = { weekStart: MONDAY, timezone: "Asia/Dhaka", repeatUntil: REPEAT_UNTIL };

function evt(partial: Partial<EditableEvent> & { title: string }): EditableEvent {
  return {
    id: `evt-test-${partial.title.replace(/\W+/g, "-")}`,
    title: partial.title,
    confidence: 0.9,
    selected: true,
    ...partial,
  } as EditableEvent;
}

function params(url: string | null): URLSearchParams {
  expect(url).not.toBeNull();
  return new URL(url!).searchParams;
}

describe("googleCalendarUrl", () => {
  it("one-off event: UTC dates converted from Asia/Dhaka (+06:00)", () => {
    const p = params(
      googleCalendarUrl(
        evt({ title: "Mathematics — Final Exam", date: "2026-11-18", startTime: "09:00", endTime: "12:00", location: "Hall A" }),
        OPTS,
      ),
    );
    expect(p.get("action")).toBe("TEMPLATE");
    expect(p.get("text")).toBe("Mathematics — Final Exam");
    // 09:00 Dhaka = 03:00 UTC; 12:00 Dhaka = 06:00 UTC.
    expect(p.get("dates")).toBe("20261118T030000Z/20261118T060000Z");
    expect(p.get("location")).toBe("Hall A");
    expect(p.get("recur")).toBeNull();
  });

  it("weekly event: first occurrence + RRULE with inclusive UNTIL (23:59:59Z)", () => {
    const p = params(
      googleCalendarUrl(
        evt({
          title: "Physics",
          weekday: "MO",
          startTime: "09:00",
          endTime: "10:00",
          recurrence: { freq: "WEEKLY", until: "2027-02-08" },
        }),
        OPTS,
      ),
    );
    expect(p.get("dates")).toBe("20261116T030000Z/20261116T040000Z");
    expect(p.get("recur")).toBe("RRULE:FREQ=WEEKLY;UNTIL=20270208T235959Z");
  });

  it("DAILY event with COUNT uses COUNT and no UNTIL", () => {
    const p = params(
      googleCalendarUrl(
        evt({
          title: "Amoxicillin 500mg",
          date: "2026-11-16",
          startTime: "08:00",
          endTime: "08:05",
          recurrence: { freq: "DAILY", count: 14 },
        }),
        OPTS,
      ),
    );
    expect(p.get("recur")).toBe("RRULE:FREQ=DAILY;COUNT=14");
  });

  it("DAILY event without COUNT uses the repeat-until date", () => {
    const p = params(
      googleCalendarUrl(
        evt({
          title: "Vitamin D",
          date: "2026-11-16",
          startTime: "13:00",
          endTime: "13:05",
          recurrence: { freq: "DAILY" },
        }),
        OPTS,
      ),
    );
    expect(p.get("recur")).toBe("RRULE:FREQ=DAILY;UNTIL=20270208T235959Z");
  });

  it("all-day event uses Google's date-only format with an exclusive end date", () => {
    const p = params(
      googleCalendarUrl(evt({ title: "Eid Holiday", date: "2026-11-20", allDay: true }), OPTS),
    );
    expect(p.get("dates")).toBe("20261120/20261121");
  });

  it("midnight-crossing night shift ends the next day", () => {
    const p = params(
      googleCalendarUrl(
        evt({
          title: "Baito shift — Night (N)",
          date: "2026-11-18",
          startTime: "22:00",
          endTime: "06:00",
          location: "Warehouse",
        }),
        { weekStart: MONDAY, timezone: "Asia/Tokyo", repeatUntil: REPEAT_UNTIL },
      ),
    );
    // 22:00 Tokyo (+09:00) = 13:00 UTC; 06:00 next day = 21:00 UTC.
    expect(p.get("dates")).toBe("20261118T130000Z/20261118T210000Z");
  });

  it("returns null when the event cannot be placed on a date", () => {
    expect(googleCalendarUrl(evt({ title: "No date at all" }), OPTS)).toBeNull();
  });
});
