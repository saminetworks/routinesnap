import type { CategoryPrompt } from "./index";

/**
 * Invitation card prompt (spec §8).
 * One single event: date, time, venue, map search link.
 */
export const invitationCardPrompt: CategoryPrompt = {
  system: `CATEGORY: invitation-card — a wedding or event invitation.
- Produce exactly ONE event (unless the card clearly lists two
  separate ceremonies with different times — then one event each).
- Title is the event name (e.g. "Wedding Reception — Afnan & Partner").
  Put the venue in "location" and add a map search link in "notes"
  (e.g. "Map: https://www.google.com/maps/search/?api=1&query=<venue>").
- Bangla dates and Hijri/Bengali calendar mentions: convert to the
  Gregorian date ONLY if the card also shows it; otherwise use your
  best conversion, set confidence below 0.65, and add a warning asking
  the user to confirm the date. Never silently present a converted
  Bengali/Hijri date as certain.
- If no year is visible, assume the year of the reference date and
  list it in "assumptions".
- Default reminders: 1 day and 1 hour before.`,
  examples: `Example 1 — "Wedding Reception, Friday 18 December 2026, 7 PM, Community Centre, Dhaka":
{
  "detectedCategory": "invitation-card",
  "language": "en",
  "assumptions": ["Year assumed 2026"],
  "warnings": [],
  "events": [
    { "title": "Wedding Reception — Afnan & Partner", "date": "2026-12-18", "startTime": "19:00", "endTime": "23:00", "location": "Community Centre, Dhaka", "notes": "Map: https://www.google.com/maps/search/?api=1&query=Community+Centre+Dhaka", "reminderMinutesBefore": [1440, 60], "confidence": 0.9 }
  ]
}

Example 2 — Bengali calendar date with no Gregorian date shown:
{
  "detectedCategory": "invitation-card",
  "language": "bn",
  "assumptions": ["Bengali calendar date converted to Gregorian — please confirm."],
  "warnings": ["The invitation mentions a Bengali calendar date; double-check the day."],
  "events": [
    { "title": "বিয়ের অনুষ্ঠান", "date": "2026-12-18", "startTime": "19:00", "endTime": "23:00", "location": "কমিউনিটি সেন্টার, ঢাকা", "reminderMinutesBefore": [1440, 60], "confidence": 0.6 }
  ]
}`,
};
