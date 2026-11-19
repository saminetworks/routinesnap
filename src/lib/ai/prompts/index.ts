/**
 * Base extraction rules (spec §9) — shared by every category prompt.
 * Written into the code so the model always sees them, whatever the
 * category. Category files add their own rules on top.
 */

export const BASE_RULES = `You extract calendar events from a photo of a schedule. Return JSON only — no markdown, no explanation, no extra text.

RULES — follow all of them:
- Extract ONLY what is visible in the image. Never invent a title, date, time, room, teacher, dose or venue.
- If a field is unsure, unreadable or missing, set a low confidence (below 0.65) for that event and add a clear warning. Do not guess a value to fill the gap.
- If the photo is blurry, dark or low quality, read the table structure carefully — use row and column positions, course codes and room numbers to work out each cell. Never invent a value to fill a gap; mark low confidence instead.
- The schedule may be HANDWRITTEN. Read handwriting carefully and use the surrounding layout, repeated words and known names to work out unclear text. A handwritten word you cannot read goes in "warnings" — never invent it.
- Times may be written as words, not numbers: morning, afternoon, evening, night, and Bangla সকাল (sokal), দুপুর (dupur), বিকাল (bekal), সন্ধ্যা (sondha), রাত (raat). Convert them to 24-hour times using these defaults and list the assumption: dawn 06:00, morning 09:00, noon 12:00, afternoon 14:00, evening 17:00, night 20:00, midnight 00:00. If only a time of day is given, the event lasts 1 hour. A number with a word ("9 in the evening", "9 bekal") means that hour in that part of the day — 9 in the evening is 21:00, 9 in the morning is 09:00.
- Convert Bangla digits (০১২৩৪৫৬৭৮৯) and Japanese numerals (０-９, 一二三四五六七八九十, 午前/午後) to standard Western digits. Normalise 12-hour times to 24-hour HH:mm.
- Keep event titles in the original language of the image.
- Use the provided reference date to resolve relative dates ("tomorrow", "next Monday") and missing years. If the year is not visible, assume the year of the reference date and list it in "assumptions".
- Treat the Bangladesh weekend as Friday–Saturday ONLY if the user timezone is Asia/Dhaka AND the image does not specify weekend days. Otherwise use the weekend implied by the image.
- Confidence is a number from 0 to 1 per event: 0.9+ only when every field is clearly legible; 0.65–0.89 when one field is uncertain; below 0.65 when anything important is guessed or unreadable.
- "language" is the language of the image text: "bn", "en", "ja", or "mixed" when more than one is present.
- If the image contains no readable schedule at all, return events: [] with a warning explaining that — do not invent events.

OUTPUT SHAPE — exactly this JSON object, no other keys:
{
  "detectedCategory": "<one of: class-routine | exam-routine | duty-roster | invitation-card | medicine-schedule | match-fixture>",
  "language": "bn" | "en" | "ja" | "mixed",
  "assumptions": ["..."],
  "warnings": ["..."],
  "events": [
    {
      "title": "string",
      "date": "yyyy-mm-dd (one-off events only)",
      "weekday": "MO | TU | WE | TH | FR | SA | SU (weekly events only)",
      "startTime": "HH:mm 24h",
      "endTime": "HH:mm 24h",
      "allDay": false,
      "location": "string",
      "notes": "string",
      "recurrence": { "freq": "WEEKLY" | "DAILY", "until": "yyyy-mm-dd", "count": 12 },
      "reminderMinutesBefore": [30],
      "confidence": 0.95
    }
  ]
}
Omit optional fields instead of inventing them. "date" and "weekday" are mutually exclusive: one-off events use "date", weekly recurring events use "weekday".`;

export interface PromptContext {
  locale: "en" | "bn" | "ja";
  timezone: string;
  referenceDate: string;
}

function contextBlock(ctx: PromptContext): string {
  return `CONTEXT FOR THIS PHOTO:
- User locale: ${ctx.locale}
- User timezone: ${ctx.timezone}
- Reference date (today, for resolving relative dates and missing years): ${ctx.referenceDate}`;
}

export type CategorySlug =
  | "class-routine"
  | "exam-routine"
  | "duty-roster"
  | "invitation-card"
  | "medicine-schedule"
  | "match-fixture";

export interface CategoryPrompt {
  system: string;
  examples: string;
}

// Category prompt modules are imported lazily so the API route only
// loads the one it needs.
const promptModules: Record<CategorySlug, () => Promise<CategoryPrompt>> = {
  "class-routine": () => import("./class-routine").then((m) => m.classRoutinePrompt),
  "exam-routine": () => import("./exam-routine").then((m) => m.examRoutinePrompt),
  "duty-roster": () => import("./duty-roster").then((m) => m.dutyRosterPrompt),
  "invitation-card": () => import("./invitation-card").then((m) => m.invitationCardPrompt),
  "medicine-schedule": () => import("./medicine-schedule").then((m) => m.medicineSchedulePrompt),
  "match-fixture": () => import("./match-fixture").then((m) => m.matchFixturePrompt),
};

/** Full system prompt for a category: base rules + category rules + few-shot examples. */
export async function getSystemPrompt(category: CategorySlug, ctx: PromptContext): Promise<string> {
  const { system, examples } = await promptModules[category]();
  return `${BASE_RULES}\n\n${contextBlock(ctx)}\n\nCATEGORY RULES:\n${system}\n\nEXAMPLES (text-only, showing the expected JSON shape):\n${examples}`;
}

/** Synchronous list of categories that have a prompt file. */
export const PROMPT_CATEGORIES: CategorySlug[] = [
  "class-routine",
  "exam-routine",
  "duty-roster",
  "invitation-card",
  "medicine-schedule",
  "match-fixture",
];
