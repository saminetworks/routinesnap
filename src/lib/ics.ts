import { addDays, addMinutes } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import type { EditableEvent, ExtractedEvent } from "@/lib/ai/schema";
import {
  combineDateTime,
  crossesMidnight,
  formatDateInput,
  parseDateInput,
  resolveEventDate,
} from "@/lib/dates";

/**
 * Hand-written RFC 5545 (.ics) generator (spec §10).
 *
 * Why hand-written instead of the `ics` npm package: the package has no
 * VTIMEZONE support, no per-event TZID control, and cannot express our
 * RRULE UNTIL-in-UTC + VALARM combinations cleanly. Writing it ourselves
 * gives full control over escaping, 75-octet line folding, and timezone
 * handling — and it is fully unit-tested in tests/ics.test.ts.
 *
 * Timezone strategy: DTSTART/DTEND use `DTSTART;TZID=<tz>` (wall time in
 * the event's timezone) plus a VTIMEZONE block. Asia/Dhaka, Asia/Tokyo and
 * Asia/Kolkata have no daylight saving, so their VTIMEZONE is a single
 * STANDARD component with a fixed offset. For a zone that *does* observe
 * DST we fall back to UTC (`DTSTART:…Z`) for that event, which is always
 * correct — guessing DST rules would be worse.
 */

export interface IcsOptions {
  weekStart: Date;
  timezone: string;
  /** Weekly/DAILY repeats stop after this date (inclusive). Defaults to the event's own `until`. */
  repeatUntil?: Date;
  calendarName?: string;
}

type AnyEvent = EditableEvent | ExtractedEvent;

/** Escape TEXT values per RFC 5545 §3.3.11: backslash, semicolon, comma, newline. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n/g, "\\n")
    .replace(/\n/g, "\\n");
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

/** `Date` -> `YYYYMMDDTHHMMSSZ` (UTC). */
export function formatUtc(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** `Date` -> `YYYYMMDDTHHMMSS` in its *local* fields (a wall time, no Z). */
export function formatWall(date: Date): string {
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/** `Date` -> `YYYYMMDD` in its local fields. */
export function formatDateValue(date: Date): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

/**
 * Fold one logical line to max 75 octets per line (RFC 5545 §3.1).
 * Continuation lines start with a single space. Folding is byte-based
 * (UTF-8) so multi-byte Bangla/Japanese characters are never split, and
 * we never split right after a backslash (which would break an escape).
 */
export function foldLine(line: string): string[] {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  let current = "";
  let currentBytes = 0;
  const chars = [...line];
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const chBytes = encoder.encode(ch).length;
    const limit = lines.length === 0 ? 75 : 74; // continuation lines carry a leading space
    if (currentBytes + chBytes > limit && current !== "") {
      // Don't leave a lone backslash at the end of a folded line.
      if (current.endsWith("\\")) {
        current += ch;
        currentBytes += chBytes;
        lines.push(current);
        current = "";
        currentBytes = 0;
        continue;
      }
      lines.push(current);
      current = "";
      currentBytes = 0;
    }
    current += ch;
    currentBytes += chBytes;
  }
  if (current !== "" || lines.length === 0) lines.push(current);
  return lines.map((l, idx) => (idx === 0 ? l : ` ${l}`));
}

/** Offset of `timeZone` at `date`, in minutes east of UTC, or null if unknown. */
export function getTimezoneOffsetMinutes(timeZone: string, date: Date): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
    }).formatToParts(date);
    const offset = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    if (offset === "GMT") return 0;
    const m = /^GMT([+-])(\d{2}):(\d{2})$/.exec(offset);
    if (!m) return null;
    const sign = m[1] === "-" ? -1 : 1;
    return sign * (Number(m[2]) * 60 + Number(m[3]));
  } catch {
    return null;
  }
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`;
}

/** True when the zone's offset differs between January and July (i.e. it observes DST). */
function zoneHasDst(timeZone: string, year: number): boolean {
  const jan = getTimezoneOffsetMinutes(timeZone, new Date(Date.UTC(year, 0, 15)));
  const jul = getTimezoneOffsetMinutes(timeZone, new Date(Date.UTC(year, 6, 15)));
  return jan !== null && jul !== null && jan !== jul;
}

/** Minimal VTIMEZONE for a fixed-offset (no-DST) zone. */
function buildVTimezone(timeZone: string, offsetMinutes: number): string[] {
  const offset = formatOffset(offsetMinutes);
  return [
    "BEGIN:VTIMEZONE",
    `TZID:${timeZone}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    `TZOFFSETFROM:${offset}`,
    `TZOFFSETTO:${offset}`,
    `TZNAME:${timeZone}`,
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
}

function eventUid(event: AnyEvent): string {
  if ("id" in event && event.id) return `${event.id}@routinesnap`;
  const slug = `${event.title}-${event.date ?? event.weekday ?? ""}-${event.startTime ?? ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "event"}@routinesnap`;
}

/** Resolve the event's first occurrence date, or null when it cannot be placed. */
function firstDate(event: AnyEvent, weekStart: Date): Date | null {
  return resolveEventDate(event, weekStart);
}

/** The repeat end as a local-midnight Date, or null. */
function repeatUntilDate(event: AnyEvent, opts: IcsOptions): Date | null {
  if (opts.repeatUntil) return opts.repeatUntil;
  if (event.recurrence?.until) return parseDateInput(event.recurrence.until);
  return null;
}

/** UNTIL in UTC for a DATE-TIME DTSTART: the until date at 23:59:59 in the event timezone. */
function untilUtcString(until: Date, timezone: string): string {
  const wallEnd = new Date(until);
  wallEnd.setHours(23, 59, 59, 0);
  return formatUtc(fromZonedTime(wallEnd, timezone));
}

function triggerDuration(minutes: number): string {
  if (minutes % 1440 === 0) return `-P${minutes / 1440}D`;
  if (minutes % 60 === 0) return `-PT${minutes / 60}H`;
  return `-PT${minutes}M`;
}

interface ResolvedEvent {
  event: AnyEvent;
  startWall: Date;
  endWall: Date;
  useTzid: boolean;
}

function resolveEvent(event: AnyEvent, opts: IcsOptions): ResolvedEvent | null {
  const date = firstDate(event, opts.weekStart);
  if (!date) return null;
  const startWall = combineDateTime(date, event.startTime, 9);
  let endWall: Date;
  if (event.allDay) {
    endWall = addDays(startWall, 1);
  } else if (event.endTime) {
    endWall = combineDateTime(date, event.endTime, 10);
    if (crossesMidnight(event.startTime, event.endTime)) {
      endWall = addDays(endWall, 1);
    }
  } else {
    endWall = addMinutes(startWall, 60);
  }
  const useTzid = !zoneHasDst(opts.timezone, startWall.getFullYear());
  return { event, startWall, endWall, useTzid };
}

function eventToLines(r: ResolvedEvent, opts: IcsOptions, dtstamp: string): string[] {
  const { event, startWall, endWall, useTzid } = r;
  const lines: string[] = ["BEGIN:VEVENT", `UID:${eventUid(event)}`, `DTSTAMP:${dtstamp}`];

  if (event.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${formatDateValue(startWall)}`);
    lines.push(`DTEND;VALUE=DATE:${formatDateValue(endWall)}`);
  } else if (useTzid) {
    lines.push(`DTSTART;TZID=${opts.timezone}:${formatWall(startWall)}`);
    lines.push(`DTEND;TZID=${opts.timezone}:${formatWall(endWall)}`);
  } else {
    lines.push(`DTSTART:${formatUtc(fromZonedTime(startWall, opts.timezone))}`);
    lines.push(`DTEND:${formatUtc(fromZonedTime(endWall, opts.timezone))}`);
  }

  if (event.recurrence) {
    const freq = event.recurrence.freq;
    let rrule = `RRULE:FREQ=${freq}`;
    if (event.recurrence.count) {
      rrule += `;COUNT=${event.recurrence.count}`;
    } else {
      const until = repeatUntilDate(event, opts);
      if (until) {
        rrule += event.allDay
          ? `;UNTIL=${formatDateInput(until).replaceAll("-", "")}`
          : `;UNTIL=${untilUtcString(until, opts.timezone)}`;
      }
    }
    lines.push(rrule);
  }

  lines.push(`SUMMARY:${escapeText(event.title)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.notes) lines.push(`DESCRIPTION:${escapeText(event.notes)}`);

  const reminders = [...new Set(event.reminderMinutesBefore ?? [])].sort((a, b) => a - b);
  for (const minutes of reminders) {
    lines.push("BEGIN:VALARM");
    lines.push(`TRIGGER:${triggerDuration(minutes)}`);
    lines.push("ACTION:DISPLAY");
    lines.push(`DESCRIPTION:${escapeText(event.title)}`);
    lines.push("END:VALARM");
  }

  lines.push("END:VEVENT");
  return lines;
}

/**
 * Generate a complete .ics calendar (RFC 5545) for the given events.
 * Events that cannot be placed on a date are skipped. Returns the
 * calendar as a string with CRLF line endings.
 */
export function generateIcs(events: AnyEvent[], opts: IcsOptions): string {
  const dtstamp = formatUtc(new Date());
  const resolved = events
    .map((event) => resolveEvent(event, opts))
    .filter((r): r is ResolvedEvent => r !== null);
  const useTzid = resolved.some((r) => r.useTzid);
  const offset = useTzid ? getTimezoneOffsetMinutes(opts.timezone, new Date()) : null;

  const logical: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RoutineSnap//RoutineSnap//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(opts.calendarName ?? "RoutineSnap")}`,
  ];
  if (useTzid && offset !== null) {
    logical.push(...buildVTimezone(opts.timezone, offset));
  }
  for (const r of resolved) logical.push(...eventToLines(r, opts, dtstamp));
  logical.push("END:VCALENDAR");

  return logical.flatMap(foldLine).join("\r\n") + "\r\n";
}

/** Trigger a browser download of the given .ics text. */
export function downloadIcs(icsText: string, filename = "routinesnap.ics"): void {
  const blob = new Blob([icsText], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
