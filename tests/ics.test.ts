import { describe, expect, it } from "vitest";
import type { EditableEvent } from "@/lib/ai/schema";
import { generateIcs } from "@/lib/ics";

/** 2026-11-16 is a Monday — the week start used by the mock extractor. */
const MONDAY = new Date("2026-11-16T00:00:00");
const REPEAT_UNTIL = new Date("2027-02-08T00:00:00");

function evt(partial: Partial<EditableEvent> & { title: string }): EditableEvent {
  return {
    id: `evt-test-${partial.title.replace(/\W+/g, "-")}`,
    title: partial.title,
    confidence: 0.9,
    selected: true,
    ...partial,
  } as EditableEvent;
}

/** Unfold physical lines back to logical lines. */
function unfolded(ics: string): string[] {
  return ics.replace(/\r\n /g, "").split("\r\n").filter(Boolean);
}

describe("generateIcs", () => {
  it("emits a valid calendar envelope with UID, DTSTAMP and CRLF endings", () => {
    const ics = generateIcs(
      [evt({ title: "Physics", weekday: "MO", startTime: "09:00", endTime: "10:00" })],
      { weekStart: MONDAY, timezone: "Asia/Dhaka" },
    );
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("VERSION:2.0\r\n");
    expect(ics).toContain("PRODID:-//RoutineSnap//RoutineSnap//EN\r\n");
    expect(ics).toContain("METHOD:PUBLISH\r\n");
    expect(ics).toContain("END:VCALENDAR\r\n");
    expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
    expect(ics).toMatch(/UID:evt-test-Physics@routinesnap/);
    // No bare LF: every line break is CRLF.
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("weekly recurrence in Asia/Dhaka: TZID wall time, VTIMEZONE +0600, inclusive UNTIL", () => {
    const ics = generateIcs(
      [
        evt({
          title: "Physics",
          weekday: "MO",
          startTime: "09:00",
          endTime: "10:00",
          location: "Room 204",
          recurrence: { freq: "WEEKLY", until: "2027-02-08" },
          reminderMinutesBefore: [30],
        }),
      ],
      { weekStart: MONDAY, timezone: "Asia/Dhaka", repeatUntil: REPEAT_UNTIL },
    );
    const lines = unfolded(ics);
    expect(lines).toContain("DTSTART;TZID=Asia/Dhaka:20261116T090000");
    expect(lines).toContain("DTEND;TZID=Asia/Dhaka:20261116T100000");
    // Until date 2027-02-08 at 23:59:59 Dhaka (+06:00) = 17:59:59 UTC.
    expect(lines).toContain("RRULE:FREQ=WEEKLY;UNTIL=20270208T175959Z");
    expect(lines).toContain("LOCATION:Room 204");
    expect(lines).toContain("TRIGGER:-PT30M");
    expect(lines).toContain("ACTION:DISPLAY");
    expect(ics).toContain("BEGIN:VTIMEZONE");
    expect(ics).toContain("TZID:Asia/Dhaka");
    expect(ics).toContain("TZOFFSETTO:+0600");
  });

  it("uses the right fixed offsets for Asia/Tokyo (+0900) and Asia/Kolkata (+0530)", () => {
    for (const [tz, offset, dtstart] of [
      ["Asia/Tokyo", "+0900", "DTSTART;TZID=Asia/Tokyo:20261116T090000"],
      ["Asia/Kolkata", "+0530", "DTSTART;TZID=Asia/Kolkata:20261116T090000"],
    ] as const) {
      const ics = generateIcs(
        [evt({ title: "Shift", weekday: "MO", startTime: "09:00", endTime: "10:00" })],
        { weekStart: MONDAY, timezone: tz },
      );
      const lines = unfolded(ics);
      expect(lines).toContain(dtstart);
      expect(ics).toContain(`TZOFFSETTO:${offset}`);
    }
  });

  it("midnight-crossing night shifts end the next day", () => {
    const ics = generateIcs(
      [
        evt({
          title: "Baito shift — Night (N)",
          date: "2026-11-18",
          startTime: "22:00",
          endTime: "06:00",
          reminderMinutesBefore: [60],
        }),
      ],
      { weekStart: MONDAY, timezone: "Asia/Tokyo" },
    );
    const lines = unfolded(ics);
    expect(lines).toContain("DTSTART;TZID=Asia/Tokyo:20261118T220000");
    expect(lines).toContain("DTEND;TZID=Asia/Tokyo:20261119T060000");
  });

  it("emits one VALARM per reminder offset, longest first in the file", () => {
    const ics = generateIcs(
      [
        evt({
          title: "Mathematics — Final Exam",
          date: "2026-11-18",
          startTime: "09:00",
          endTime: "12:00",
          reminderMinutesBefore: [1440, 120, 30],
        }),
      ],
      { weekStart: MONDAY, timezone: "Asia/Dhaka" },
    );
    const alarms = ics.match(/BEGIN:VALARM/g) ?? [];
    expect(alarms).toHaveLength(3);
    expect(ics).toContain("TRIGGER:-P1D");
    expect(ics).toContain("TRIGGER:-PT2H");
    expect(ics).toContain("TRIGGER:-PT30M");
  });

  it("DAILY recurrence uses COUNT when present and no UNTIL", () => {
    const ics = generateIcs(
      [
        evt({
          title: "Amoxicillin 500mg",
          date: "2026-11-16",
          startTime: "08:00",
          endTime: "08:05",
          recurrence: { freq: "DAILY", count: 14 },
          reminderMinutesBefore: [10],
        }),
      ],
      { weekStart: MONDAY, timezone: "Asia/Dhaka" },
    );
    const lines = unfolded(ics);
    expect(lines).toContain("RRULE:FREQ=DAILY;COUNT=14");
    expect(ics).not.toContain("UNTIL=");
  });

  it("all-day events use DATE values with an exclusive next-day DTEND", () => {
    const ics = generateIcs(
      [evt({ title: "Eid Holiday", date: "2026-11-20", allDay: true })],
      { weekStart: MONDAY, timezone: "Asia/Dhaka" },
    );
    const lines = unfolded(ics);
    expect(lines).toContain("DTSTART;VALUE=DATE:20261120");
    expect(lines).toContain("DTEND;VALUE=DATE:20261121");
    expect(lines.some((l) => l.startsWith("DTSTART;TZID="))).toBe(false);
  });

  it("escapes commas, semicolons, backslashes and newlines, keeping Bangla/Japanese text", () => {
    const ics = generateIcs(
      [
        evt({
          title: "Physics, Lab; Section A",
          date: "2026-11-18",
          startTime: "09:00",
          endTime: "10:00",
          location: "Room 204, 2nd floor",
          notes: "Bring বই\\notebook\nPhysics 物理",
        }),
      ],
      { weekStart: MONDAY, timezone: "Asia/Dhaka" },
    );
    const lines = unfolded(ics);
    expect(lines).toContain("SUMMARY:Physics\\, Lab\\; Section A");
    expect(lines).toContain("LOCATION:Room 204\\, 2nd floor");
    expect(lines).toContain("DESCRIPTION:Bring বই\\\\notebook\\nPhysics 物理");
  });

  it("folds long lines at 75 octets without splitting multi-byte characters", () => {
    const longTitle = "物理の授業".repeat(20); // 6 chars × 20 = 120 chars, 360 bytes
    const ics = generateIcs(
      [
        evt({
          title: longTitle,
          date: "2026-11-18",
          startTime: "09:00",
          endTime: "10:00",
          notes: "x".repeat(200),
        }),
      ],
      { weekStart: MONDAY, timezone: "Asia/Dhaka" },
    );
    const encoder = new TextEncoder();
    for (const physical of ics.split("\r\n")) {
      expect(encoder.encode(physical).length).toBeLessThanOrEqual(75);
    }
    // Unfolding restores the exact original text.
    const lines = unfolded(ics);
    const summary = lines.find((l) => l.startsWith("SUMMARY:"))!;
    expect(summary).toBe(`SUMMARY:${longTitle}`);
    const description = lines.find((l) => l.startsWith("DESCRIPTION:"))!;
    expect(description).toBe(`DESCRIPTION:${"x".repeat(200)}`);
  });

  it("skips events that cannot be placed on a date", () => {
    const ics = generateIcs(
      [
        evt({ title: "No date at all" }),
        evt({ title: "Physics", weekday: "MO", startTime: "09:00", endTime: "10:00" }),
      ],
      { weekStart: MONDAY, timezone: "Asia/Dhaka" },
    );
    expect(ics).not.toContain("No date at all");
    expect(ics).toContain("Physics");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  it("defaults a missing end time to one hour after the start", () => {
    const ics = generateIcs(
      [evt({ title: "Meeting", date: "2026-11-18", startTime: "21:00" })],
      { weekStart: MONDAY, timezone: "Asia/Dhaka" },
    );
    const lines = unfolded(ics);
    expect(lines).toContain("DTSTART;TZID=Asia/Dhaka:20261118T210000");
    expect(lines).toContain("DTEND;TZID=Asia/Dhaka:20261118T220000");
  });
});
