import { describe, expect, it } from "vitest";
import {
  nextReminderPreset,
  normalizeReminders,
  reminderPresetKey,
  reminderStrings,
  remindersFromStrings,
} from "@/lib/reminders";

/**
 * Step 9 regression tests for the multi-reminder editor. The Step 4 bug:
 * the editor only kept the first reminder, so editing an exam event
 * collapsed [1440, 120] to [1440] and the 2-hour alarm was lost on export.
 */
describe("reminders", () => {
  it("normalizeReminders keeps every offset, deduped and ascending", () => {
    expect(normalizeReminders([1440, 120])).toEqual([120, 1440]);
    expect(normalizeReminders([30, 30, 10])).toEqual([10, 30]);
    expect(normalizeReminders(undefined)).toEqual([]);
    expect(normalizeReminders([])).toEqual([]);
  });

  it("normalizeReminders drops non-integers and negatives", () => {
    expect(normalizeReminders([30, -5, 12.5, Number.NaN, 0])).toEqual([0, 30]);
  });

  it("remindersFromStrings parses form values and returns undefined when empty", () => {
    expect(remindersFromStrings(["1440", "120"])).toEqual([120, 1440]);
    expect(remindersFromStrings(["", "abc"])).toBeUndefined();
    expect(remindersFromStrings([])).toBeUndefined();
  });

  it("reminderStrings round-trips event offsets to form values", () => {
    expect(reminderStrings([1440, 120])).toEqual(["120", "1440"]);
    expect(reminderStrings(undefined)).toEqual([]);
  });

  it("nextReminderPreset picks the first unused preset, null when all are used", () => {
    expect(nextReminderPreset([])).toBe(10);
    expect(nextReminderPreset([10, 30, 60])).toBe(120);
    expect(nextReminderPreset([10, 30, 60, 120, 1440])).toBeNull();
  });

  it("reminderPresetKey maps presets to i18n keys and rejects the rest", () => {
    expect(reminderPresetKey(120)).toBe("reminder120");
    expect(reminderPresetKey(1440)).toBe("reminder1440");
    expect(reminderPresetKey(5)).toBeNull();
    expect(reminderPresetKey(90)).toBeNull();
  });

  it("an exam event keeps both reminders through an edit round-trip", () => {
    // What the editor used to do: keep only the first offset.
    const before = [1440, 120];
    const edited = remindersFromStrings(reminderStrings(before));
    expect(edited).toEqual([120, 1440]);
    expect(edited).toHaveLength(2);
  });
});
