import type { CategoryPrompt } from "./index";

/**
 * Match fixture prompt (spec §8).
 * Cricket (or any sport) fixture → match events with teams, venue,
 * local time.
 */
export const matchFixturePrompt: CategoryPrompt = {
  system: `CATEGORY: match-fixture — a cricket (or other sport) fixture list.
- One event per match. Title is "<Team A> vs <Team B> — <format>"
  (e.g. "Bangladesh vs India — T20"). Put the venue in "location".
- Convert the fixture time to the user's timezone and say so in
  "assumptions". If the fixture time's timezone is not shown, assume
  the venue's local time and warn about it.
- If the user asked to filter to only their team (passed in the user
  message when given), include ONLY matches involving that team and
  say so in "assumptions". Otherwise include every match.
- A match with no time shown is an all-day event (allDay: true) with
  confidence below 0.65 and a warning.
- Default reminder: 60 minutes before each match.`,
  examples: `Example 1 — "Bangladesh vs India, T20, 19 Nov, 7:00 PM, Sher-e-Bangla Stadium, Dhaka":
{
  "detectedCategory": "match-fixture",
  "language": "en",
  "assumptions": ["Times converted to your timezone."],
  "warnings": [],
  "events": [
    { "title": "Bangladesh vs India — T20", "date": "2026-11-19", "startTime": "19:00", "endTime": "22:30", "location": "Sher-e-Bangla Stadium, Dhaka", "reminderMinutesBefore": [60], "confidence": 0.95 }
  ]
}

Example 2 — no time shown:
{
  "detectedCategory": "match-fixture",
  "language": "en",
  "assumptions": [],
  "warnings": ["No start time was shown for this match."],
  "events": [
    { "title": "Bangladesh vs Sri Lanka — ODI", "date": "2026-11-20", "allDay": true, "location": "Sher-e-Bangla Stadium, Dhaka", "reminderMinutesBefore": [60], "confidence": 0.6 }
  ]
}`,
};
