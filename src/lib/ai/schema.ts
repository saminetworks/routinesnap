import { z } from "zod";

/**
 * AI extraction output schema (spec §9). This is the contract between
 * the extractor (mock in Step 3, real /api/extract in Step 5) and the
 * scan UI. Validation happens here, never in the components.
 */

export const weekdaySchema = z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]);
export type Weekday = z.infer<typeof weekdaySchema>;

export const recurrenceSchema = z.object({
  freq: z.enum(["WEEKLY", "DAILY"]),
  until: z.string().optional(),
  count: z.number().int().positive().optional(),
});
export type Recurrence = z.infer<typeof recurrenceSchema>;

export const extractedEventSchema = z.object({
  title: z.string().min(1, "Title is required"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be yyyy-mm-dd")
    .optional(),
  weekday: weekdaySchema.optional(),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:mm")
    .optional(),
  endTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:mm")
    .optional(),
  allDay: z.boolean().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
  recurrence: recurrenceSchema.optional(),
  reminderMinutesBefore: z.array(z.number().int().nonnegative()).optional(),
  confidence: z.number().min(0).max(1),
});
export type ExtractedEvent = z.infer<typeof extractedEventSchema>;

/** One extracted event as edited in the UI: stable id + selection state. */
export type EditableEvent = ExtractedEvent & { id: string; selected: boolean };

export const extractResultSchema = z.object({
  detectedCategory: z.enum([
    "class-routine",
    "exam-routine",
    "duty-roster",
    "invitation-card",
    "medicine-schedule",
    "match-fixture",
  ]),
  language: z.enum(["bn", "en", "ja", "mixed"]),
  assumptions: z.array(z.string()),
  warnings: z.array(z.string()),
  // An empty list is valid: the prompt tells the model to return
  // events: [] (with a warning) when the image holds no readable
  // schedule. The scan UI already handles zero events — EventsEditor
  // shows its "no events" state and ExportBar disables every export
  // button — so an empty result reaches the user as a friendly
  // "nothing found" instead of a 502.
  events: z.array(extractedEventSchema),
});
export type ExtractResult = z.infer<typeof extractResultSchema>;

export const categoryInputSchema = z.enum([
  "auto",
  "class-routine",
  "exam-routine",
  "duty-roster",
  "invitation-card",
  "medicine-schedule",
  "match-fixture",
]);
export type CategoryInput = z.infer<typeof categoryInputSchema>;

/** Confidence bands shown in the UI. */
export function confidenceBand(confidence: number): "high" | "medium" | "low" {
  if (confidence >= 0.85) return "high";
  if (confidence >= 0.65) return "medium";
  return "low";
}

let idCounter = 0;
/** Turn validated extracted events into editable rows. */
export function toEditableEvents(events: ExtractedEvent[]): EditableEvent[] {
  return events.map((event) => ({
    ...event,
    id: `evt-${Date.now().toString(36)}-${(idCounter += 1)}`,
    selected: true,
  }));
}
