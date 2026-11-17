/**
 * Reminder helpers for the scan editor (Step 9).
 *
 * The ICS generator (src/lib/ics.ts) has always supported several VALARMs
 * per event, but the Step 3/4 editor only exposed the first reminder, so
 * editing an event silently collapsed e.g. [1440, 120] to [1440]. These
 * pure helpers power the multi-reminder editor in
 * src/components/scan/event-card.tsx and are unit-tested in
 * tests/reminders.test.ts.
 */

/** Preset reminder offsets (minutes before the event) offered in the editor. */
export const REMINDER_PRESETS = [10, 30, 60, 120, 1440] as const;

/** The i18n key for a preset offset (e.g. 30 -> "reminder30"), or null. */
export function reminderPresetKey(minutes: number): string | null {
  return (REMINDER_PRESETS as readonly number[]).includes(minutes)
    ? `reminder${minutes}`
    : null;
}

/**
 * Clean a list of reminder offsets: drop non-integers/negatives, dedupe,
 * sort ascending. The order the AI returned ([1440, 120]) is not kept —
 * ascending order reads better in the editor and the ICS generator sorts
 * its VALARMs the same way.
 */
export function normalizeReminders(values: readonly number[] | undefined): number[] {
  if (!values) return [];
  return [...new Set(values.filter((n) => Number.isInteger(n) && n >= 0))].sort((a, b) => a - b);
}

/** Form string values ("30", "") -> event offsets, or undefined when empty. */
export function remindersFromStrings(values: readonly string[]): number[] | undefined {
  const parsed = normalizeReminders(
    values
      .map((v) => v.trim())
      .filter((v) => v !== "")
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n)),
  );
  return parsed.length > 0 ? parsed : undefined;
}

/** Event offsets -> form string values, normalised the same way. */
export function reminderStrings(values: readonly number[] | undefined): string[] {
  return normalizeReminders(values).map(String);
}

/** First preset not already used, for the editor's "Add reminder" button. */
export function nextReminderPreset(existing: readonly number[]): number | null {
  const used = new Set(existing);
  return REMINDER_PRESETS.find((p) => !used.has(p)) ?? null;
}
