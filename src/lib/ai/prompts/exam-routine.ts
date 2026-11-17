import type { CategoryPrompt } from "./index";

/**
 * Exam routine prompt (spec §8).
 * One-off events with reminders well ahead of time.
 */
export const examRoutinePrompt: CategoryPrompt = {
  system: `CATEGORY: exam-routine — an exam timetable.
- Every exam is a ONE-OFF event with a concrete "date" (yyyy-mm-dd).
  Never use "weekday" or WEEKLY recurrence here.
- Title is the subject plus "Exam" if the image does not already say
  so (e.g. "Mathematics — Final Exam"). Put the hall/room in
  "location" and instructions such as "Bring admit card" in "notes".
- Default reminders: 1 day (1440 minutes) AND 2 hours (120 minutes)
  before each exam, unless the user asked for a different default.
- If an exam's date is visible but its time is not, set allDay: true,
  confidence below 0.65, and warn that the time is missing.`,
  examples: `Example 1 — "12 Dec 2026, 9:00 AM – 12:00 PM, Mathematics, Hall A":
{
  "detectedCategory": "exam-routine",
  "language": "en",
  "assumptions": ["Year assumed 2026"],
  "warnings": [],
  "events": [
    { "title": "Mathematics — Final Exam", "date": "2026-12-12", "startTime": "09:00", "endTime": "12:00", "location": "Hall A", "reminderMinutesBefore": [1440, 120], "confidence": 0.96 }
  ]
}

Example 2 — time partly cut off:
{
  "detectedCategory": "exam-routine",
  "language": "en",
  "assumptions": ["Year assumed 2026"],
  "warnings": ["One exam time was partly cut off in the photo — please check the end time."],
  "events": [
    { "title": "English — Final Exam", "date": "2026-12-15", "startTime": "10:00", "endTime": "12:00", "location": "Hall A", "reminderMinutesBefore": [1440, 120], "confidence": 0.58 }
  ]
}`,
};
