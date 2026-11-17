import type { CategoryPrompt } from "./index";

/**
 * Duty roster prompt (spec §8).
 * Japan baito shift sheets, Bangladesh office / garments rosters.
 * Name-filtered rows, night shifts crossing midnight, shift codes.
 */
export const dutyRosterPrompt: CategoryPrompt = {
  system: `CATEGORY: duty-roster — a work shift / duty roster sheet.
- If the roster lists several people, extract ONLY the rows for the
  person named in the user's request (the name is passed in the user
  message when given). If no name was given, extract every row and say
  so in "assumptions". Never merge two people's shifts into one event.
- Night shifts CROSS MIDNIGHT: an end time earlier than the start time
  (e.g. 22:00–06:00) is correct — keep the times as shown, do not
  "fix" them, and note the crossing in "notes".
- Shift codes (A/B/C, 早/遅, デー/ナイト) mean nothing on their own:
  read the legend in the image and map each code to its times. If a
  code has no legend entry, use the code as the title, set confidence
  below 0.65, and warn that the shift time is unknown.
- Title is the shift (e.g. "Baito shift — Evening", "Night shift (N)").
  Put the workplace in "location".
- Use concrete "date" for dated rosters; use "weekday" + WEEKLY
  recurrence only when the roster is a repeating weekly pattern.`,
  examples: `Example 1 — legend "N = 22:00–06:00", row "Wed, Afnan, N, Warehouse":
{
  "detectedCategory": "duty-roster",
  "language": "mixed",
  "assumptions": ["Shift code “N” read as night shift 22:00–06:00 from the legend."],
  "warnings": ["Night shifts cross midnight — the end time is the next day."],
  "events": [
    { "title": "Baito shift — Night (N)", "date": "2026-11-25", "startTime": "22:00", "endTime": "06:00", "location": "Warehouse", "notes": "Night shift crosses midnight", "reminderMinutesBefore": [60], "confidence": 0.9 }
  ]
}

Example 2 — Japanese shift code with legend "早 8:00–13:00":
{
  "detectedCategory": "duty-roster",
  "language": "ja",
  "assumptions": ["Shift code “早” read as 08:00–13:00 from the legend."],
  "warnings": [],
  "events": [
    { "title": "バイト — 早番", "weekday": "SA", "startTime": "08:00", "endTime": "13:00", "location": "コンビニ", "recurrence": { "freq": "WEEKLY" }, "reminderMinutesBefore": [30], "confidence": 0.88 }
  ]
}`,
};
