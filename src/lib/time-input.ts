/**
 * Human time input — accepts 24-hour ("13:00", "08:30"), 12-hour
 * ("1:00 PM", "1:00PM", "1pm", "8:30am"), written forms ("9 o'clock",
 * "9h30", "0900") and time-of-day words ("morning", "evening",
 * "সকাল", "sokal", "বিকাল", "bekal") and normalizes them to HH:mm.
 * Used by the manual event editor so a user can type a time the way
 * it appears on their routine photo; the AI side normalizes model
 * output the same way (see normalizeExtractedJson in
 * src/lib/ai/extractor.ts), so a handwritten note that says "morning"
 * or "sokal" becomes a real event time there too.
 *
 * A bare hour without AM/PM ("8:30", "1:00") is taken literally and
 * only padded ("08:30", "01:00") — the app never guesses AM vs PM.
 * Returns null when the text is not a readable time.
 */

/**
 * Time-of-day words and the default clock time each one means. A word
 * alone has no exact time, so the app uses these documented defaults
 * and the event is flagged with low confidence and a warning so the
 * user can check it. The AI prompt uses the same defaults.
 */
export const TIME_OF_DAY_DEFAULTS: Readonly<Record<string, string>> = {
  // English
  dawn: "06:00",
  morning: "09:00",
  noon: "12:00",
  midday: "12:00",
  afternoon: "14:00",
  evening: "17:00",
  night: "20:00",
  midnight: "00:00",
  // Bangla (Bangla script)
  "ভোর": "06:00",
  "সকাল": "09:00",
  "দুপুর": "12:00",
  "বিকাল": "16:00",
  "সন্ধ্যা": "18:00",
  "রাত": "20:00",
  // Bangla in Latin letters (Banglish) — several common spellings.
  bhor: "06:00",
  vor: "06:00",
  sokal: "09:00",
  shokal: "09:00",
  dupur: "12:00",
  bikal: "16:00",
  bekal: "16:00",
  bikel: "16:00",
  sondha: "18:00",
  shondha: "18:00",
  shonda: "18:00",
  raat: "20:00",
  rat: "20:00",
};

/**
 * Which half of the day a time-of-day word belongs to, for times
 * written as a number plus a word ("9 in the evening", "9 bekal").
 */
export const TIME_WORD_MERIDIEM: Readonly<Record<string, "am" | "pm">> = {
  dawn: "am",
  morning: "am",
  noon: "pm",
  midday: "pm",
  afternoon: "pm",
  evening: "pm",
  night: "pm",
  midnight: "am",
  "ভোর": "am",
  "সকাল": "am",
  "দুপুর": "pm",
  "বিকাল": "pm",
  "সন্ধ্যা": "pm",
  "রাত": "pm",
  bhor: "am",
  vor: "am",
  sokal: "am",
  shokal: "am",
  dupur: "pm",
  bikal: "pm",
  bekal: "pm",
  bikel: "pm",
  sondha: "pm",
  shondha: "pm",
  shonda: "pm",
  raat: "pm",
  rat: "pm",
};

/** "09:00" + 60 minutes -> "10:00". Used when only a time-of-day word was given. */
export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** True when the text contains a time-of-day word ("morning", "bekal", "সকাল", "9 in the evening") — i.e. the time was written in words, not numbers. */
export function containsTimeOfDayWord(value: string): boolean {
  const words = value.toLowerCase().split(/[^a-z\u0980-\u09ff]+/).filter(Boolean);
  return words.some((w) => TIME_OF_DAY_DEFAULTS[w] !== undefined);
}

function to24h(hour: number, minute: number, meridiem?: string): string | null {
  if (meridiem) {
    // A 12-hour clock only has 1-12; "13:00 PM" is not a real time.
    if (hour < 1 || hour > 12) return null;
    const pm = meridiem.toLowerCase().startsWith("p");
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function parseTimeInput(value: string): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // A time-of-day word on its own ("morning", "sokal", "বিকাল").
  const word = TIME_OF_DAY_DEFAULTS[trimmed.toLowerCase()];
  if (word) return word;

  // "13:00", "1:00 PM", "1pm", "8:30am" (colon or dot separator,
  // optional seconds — "09:00:00").
  const withMinutes =
    /^\s*(\d{1,2})[:.](\d{2})(?::\d{2})?\s*([AaPp])?\.?\s*[Mm]?\.?\s*$/.exec(trimmed);
  if (withMinutes) {
    return to24h(Number(withMinutes[1]), Number(withMinutes[2]), withMinutes[3]);
  }

  // "1 PM", "1pm" — a bare hour with AM/PM.
  const hourOnly = /^\s*(\d{1,2})\s*([AaPp])\.?\s*[Mm]?\.?\s*$/.exec(trimmed);
  if (hourOnly) {
    return to24h(Number(hourOnly[1]), 0, hourOnly[2]);
  }

  // "9 o'clock", "9 o'clock PM".
  const oclock = /^\s*(\d{1,2})\s*o'?clock\s*([AaPp])?\.?\s*[Mm]?\.?\s*$/.exec(trimmed);
  if (oclock) {
    return to24h(Number(oclock[1]), 0, oclock[2]);
  }

  // "9h", "9h30" — the French-style shorthand some routines use.
  const hStyle = /^\s*(\d{1,2})h(\d{2})?\s*$/i.exec(trimmed);
  if (hStyle) {
    return to24h(Number(hStyle[1]), Number(hStyle[2] ?? 0));
  }

  // "0900" — four digits, no separator.
  const compact = /^([01]\d|2[0-3])([0-5]\d)$/.exec(trimmed);
  if (compact) {
    return `${compact[1]}:${compact[2]}`;
  }

  // A number plus a time-of-day word: "9 in the evening", "9 bekal",
  // "9 sokal", "9 in the morning". The word decides AM vs PM.
  const hourWithWord =
    /^\s*(\d{1,2})\s*(?:o'?clock\s+)?(?:in\s+the\s+)?([A-Za-z\u0980-\u09FF]+)\s*$/i.exec(trimmed);
  if (hourWithWord) {
    const meridiem = TIME_WORD_MERIDIEM[hourWithWord[2].toLowerCase()];
    if (meridiem) {
      return to24h(Number(hourWithWord[1]), 0, meridiem);
    }
  }

  return null;
}
