import { addDays, format } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { EditableEvent } from "@/lib/ai/schema";
import { combineDateTime, crossesMidnight, resolveEventDate } from "@/lib/dates";

export interface CalendarLinkOptions {
  weekStart: Date;
  timezone: string;
  repeatUntil?: Date;
}

/**
 * Format a Date as UTC `YYYYMMDDTHHMMSSZ` for Google Calendar URLs.
 * Must format in UTC explicitly: date-fns `format` uses the server's
 * local timezone, so on a non-UTC machine (e.g. a self-hosted server
 * in Asia/Dhaka or JST) the times would be hours off despite the `Z`.
 */
function toGoogleDate(date: Date): string {
  return formatInTimeZone(date, "UTC", "yyyyMMdd'T'HHmmss'Z'");
}

function eventStartEnd(
  event: EditableEvent,
  opts: CalendarLinkOptions,
): { start: Date; end: Date } | null {
  const date = resolveEventDate(event, opts.weekStart);
  if (!date) return null;
  const startLocal = combineDateTime(date, event.startTime, 9);
  let endLocal = combineDateTime(date, event.endTime, 10);
  // A night shift that crosses midnight ends the next day.
  if (crossesMidnight(event.startTime, event.endTime)) {
    endLocal = new Date(endLocal.getTime() + 24 * 60 * 60 * 1000);
  }
  // All-day events never reach here: googleCalendarUrl handles them
  // first with Google's date-only format.
  const start = fromZonedTime(startLocal, opts.timezone);
  const end = fromZonedTime(endLocal, opts.timezone);
  return { start, end };
}

/** The repeat end for an event: the scan page's repeat-until wins, else the event's own `until`. */
function recurrenceUntil(event: EditableEvent, opts: CalendarLinkOptions): Date | null {
  if (opts.repeatUntil) return opts.repeatUntil;
  if (event.recurrence?.until) {
    const d = new Date(`${event.recurrence.until}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * RRULE for a Google Calendar TEMPLATE link. UNTIL is the end of the
 * until day in UTC (23:59:59Z) — midnight UTC would wrongly exclude
 * events on the until day itself in +05:30/+06:00/+09:00 zones.
 * COUNT wins over UNTIL when both are present.
 */
function recurParam(event: EditableEvent, opts: CalendarLinkOptions): string | null {
  if (!event.recurrence) return null;
  if (event.recurrence.count) {
    return `RRULE:FREQ=${event.recurrence.freq};COUNT=${event.recurrence.count}`;
  }
  const until = recurrenceUntil(event, opts);
  const untilStr = until ? `;UNTIL=${format(until, "yyyyMMdd")}T235959Z` : "";
  return `RRULE:FREQ=${event.recurrence.freq}${untilStr}`;
}

/**
 * Per-event "Add to Google Calendar" link (TEMPLATE pattern, no OAuth).
 * Weekly/DAILY events include an RRULE recurrence. All-day events use
 * Google's date-only format (YYYYMMDD/YYYYMMDD, end exclusive).
 */
export function googleCalendarUrl(event: EditableEvent, opts: CalendarLinkOptions): string | null {
  if (event.allDay) {
    const date = resolveEventDate(event, opts.weekStart);
    if (!date) return null;
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: event.title,
      dates: `${format(date, "yyyyMMdd")}/${format(addDays(date, 1), "yyyyMMdd")}`,
    });
    if (event.location) params.set("location", event.location);
    const details = [event.notes, event.reminderMinutesBefore?.length ? `Reminder: ${event.reminderMinutesBefore.join(", ")} min before` : ""]
      .filter(Boolean)
      .join("\n");
    if (details) params.set("details", details);
    const recur = recurParam(event, opts);
    if (recur) params.set("recur", recur);
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }
  const range = eventStartEnd(event, opts);
  if (!range) return null;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${toGoogleDate(range.start)}/${toGoogleDate(range.end)}`,
  });
  if (event.location) params.set("location", event.location);
  const details = [event.notes, event.reminderMinutesBefore?.length ? `Reminder: ${event.reminderMinutesBefore.join(", ")} min before` : ""]
    .filter(Boolean)
    .join("\n");
  if (details) params.set("details", details);
  const recur = recurParam(event, opts);
  if (recur) params.set("recur", recur);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function eventLine(event: EditableEvent, opts: CalendarLinkOptions): string {
  const date = resolveEventDate(event, opts.weekStart);
  const dateLabel = date ? format(date, "EEE, MMM d, yyyy") : (event.weekday ?? "");
  const timeLabel = event.allDay
    ? "All day"
    : `${event.startTime ?? "?"}${event.endTime ? `–${event.endTime}` : ""}`;
  const parts = [`• ${event.title} — ${dateLabel} ${timeLabel}`.trim()];
  if (event.location) parts.push(`  ${event.location}`);
  if (event.notes) parts.push(`  ${event.notes}`);
  return parts.join("\n");
}

export function eventsToText(events: EditableEvent[], opts: CalendarLinkOptions): string {
  const lines = events.map((e) => eventLine(e, opts));
  return `${lines.join("\n")}\n\n— via RoutineSnap`;
}

export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
