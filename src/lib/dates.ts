import { addDays, addWeeks, format, nextMonday as dfNextMonday, startOfDay } from "date-fns";
import type { ExtractedEvent, Weekday } from "@/lib/ai/schema";

export const WEEKDAY_TO_INDEX: Record<Weekday, number> = {
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
  SU: 0,
};

/** The Monday of next week (or today if today is Monday? No — strictly next). */
export function nextMonday(from: Date = new Date()): Date {
  return startOfDay(dfNextMonday(from));
}

export function defaultRepeatUntil(from: Date = new Date()): Date {
  return addWeeks(nextMonday(from), 12);
}

export function formatDateInput(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function parseDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Resolve an event to a concrete calendar date.
 * One-off events use `date`; weekly events use the first matching
 * weekday on/after `weekStart`.
 */
export function resolveEventDate(
  event: Pick<ExtractedEvent, "date" | "weekday" | "recurrence">,
  weekStart: Date,
): Date | null {
  if (event.date) return parseDateInput(event.date);
  if (event.weekday) {
    const target = WEEKDAY_TO_INDEX[event.weekday];
    const start = startOfDay(weekStart);
    for (let i = 0; i < 7; i += 1) {
      const candidate = addDays(start, i);
      if (candidate.getDay() === target) return candidate;
    }
  }
  // Daily-recurring events (e.g. medicine) start on the week start date.
  if (event.recurrence?.freq === "DAILY") return startOfDay(weekStart);
  return null;
}

/** "09:00" -> { hours: 9, minutes: 0 } */
export function parseTime(time: string | undefined): { hours: number; minutes: number } | null {
  if (!time) return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) return null;
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

/** Combine a date with an HH:mm time (local time, no timezone shift). */
export function combineDateTime(date: Date, time: string | undefined, fallbackHour = 9): Date {
  const parsed = parseTime(time);
  const d = new Date(date);
  d.setHours(parsed?.hours ?? fallbackHour, parsed?.minutes ?? 0, 0, 0);
  return d;
}

/** True when the end time is earlier than (or equal to) the start — a night shift crossing midnight. */
export function crossesMidnight(startTime?: string, endTime?: string): boolean {
  const start = parseTime(startTime);
  const end = parseTime(endTime);
  if (!start || !end) return false;
  return end.hours * 60 + end.minutes <= start.hours * 60 + start.minutes;
}
