import type { CategoryPrompt } from "./index";

/**
 * Medicine schedule prompt (spec §8).
 * Prescription → medicine, dose, timing, duration. Safety first:
 * extract only what the prescription says; the UI shows a safety
 * notice and requires verification before export.
 */
export const medicineSchedulePrompt: CategoryPrompt = {
  system: `CATEGORY: medicine-schedule — a medicine prescription photo.
- One event per dose time. Title is "<medicine> <strength> — <dose>"
  (e.g. "Amoxicillin 500mg — 1 tablet"). Keep the medicine name
  exactly as written on the prescription.
- Timing notation: "1+0+1" means morning + night (two events);
  "1+1+1" means morning + noon + night (three events);
  "0+0+1" means night only. Morning ≈ 08:00, noon ≈ 13:00,
  night ≈ 21:00 unless the prescription gives exact times.
  "Before meal" / "after meal" (খাবারের আগে/পরে, 食前/食後) goes in
  "notes" — never change the time because of it.
- Duration in days becomes recurrence { "freq": "DAILY", "count": N }.
  If no duration is visible, use a single day and warn about it.
- If a dose or time is unreadable, set confidence below 0.65 and warn
  the user to verify that dose against the prescription. NEVER invent
  a medicine, a dose, or a frequency.
- Default reminder: 10 minutes before each dose.`,
  examples: `Example 1 — "Amoxicillin 500mg, 1+0+1, after meal, 14 days":
{
  "detectedCategory": "medicine-schedule",
  "language": "en",
  "assumptions": ["“1+0+1” read as morning and night doses.", "Duration read as 14 days."],
  "warnings": [],
  "events": [
    { "title": "Amoxicillin 500mg — 1 tablet", "date": "2026-11-16", "startTime": "08:00", "endTime": "08:05", "notes": "After breakfast", "recurrence": { "freq": "DAILY", "count": 14 }, "reminderMinutesBefore": [10], "confidence": 0.9 },
    { "title": "Amoxicillin 500mg — 1 tablet", "date": "2026-11-16", "startTime": "21:00", "endTime": "21:05", "notes": "After dinner", "recurrence": { "freq": "DAILY", "count": 14 }, "reminderMinutesBefore": [10], "confidence": 0.9 }
  ]
}

Example 2 — unreadable dose:
{
  "detectedCategory": "medicine-schedule",
  "language": "en",
  "assumptions": ["Duration read as 7 days."],
  "warnings": ["One dose time was hard to read — verify every dose against your prescription."],
  "events": [
    { "title": "Vitamin D — 1 tablet", "date": "2026-11-16", "startTime": "13:00", "endTime": "13:05", "notes": "After lunch", "recurrence": { "freq": "DAILY", "count": 7 }, "reminderMinutesBefore": [10], "confidence": 0.61 }
  ]
}`,
};
