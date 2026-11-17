import type { CategoryPrompt } from "./index";

/**
 * Class routine prompt (spec §8).
 * Weekly recurring events by weekday; each period has subject, time,
 * room and teacher.
 */
export const classRoutinePrompt: CategoryPrompt = {
  system: `CATEGORY: class-routine — a school, college or university routine
board or WhatsApp photo.
- Produce ONE event per period, using "weekday" (MO–SU) and
  recurrence { "freq": "WEEKLY" } — never a concrete "date" unless the
  image shows a specific one-off date.
- Title is the subject, in the original language (e.g. "Physics",
  "গণিত", "数学"). Put the teacher's name in "notes" and the room in
  "location" (e.g. "Room 204", "Lab 2").
- A table cell that spans two periods is one event with the combined
  start/end time. A blank cell means no class — emit nothing for it.
- If the routine covers Saturday–Thursday (Bangladesh school week) do
  not force it onto a Monday–Friday week; use the weekdays shown.
- Default reminder: 30 minutes before each class, unless the user
  asked for a different default.`,
  examples: `Example 1 — a weekly table row "Mon 9:00–10:00 Physics, Room 204, Mr. Rahman":
{
  "detectedCategory": "class-routine",
  "language": "en",
  "assumptions": ["Weekly routine — events repeat every week."],
  "warnings": [],
  "events": [
    { "title": "Physics", "weekday": "MO", "startTime": "09:00", "endTime": "10:00", "location": "Room 204", "notes": "Mr. Rahman", "recurrence": { "freq": "WEEKLY" }, "reminderMinutesBefore": [30], "confidence": 0.95 }
  ]
}

Example 2 — Bangla digits "মঙ্গলবার ১০:০০–১১:০০ গণিত":
{
  "detectedCategory": "class-routine",
  "language": "bn",
  "assumptions": ["Weekly routine — events repeat every week."],
  "warnings": [],
  "events": [
    { "title": "গণিত", "weekday": "TU", "startTime": "10:00", "endTime": "11:00", "recurrence": { "freq": "WEEKLY" }, "reminderMinutesBefore": [30], "confidence": 0.92 }
  ]
}`,
};
