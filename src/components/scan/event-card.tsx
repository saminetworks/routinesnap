"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CheckCircle2, Plus, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { confidenceBand, type EditableEvent, type Weekday } from "@/lib/ai/schema";
import {
  nextReminderPreset,
  normalizeReminders,
  REMINDER_PRESETS,
  reminderPresetKey,
  reminderStrings,
  remindersFromStrings,
} from "@/lib/reminders";
import { parseTimeInput } from "@/lib/time-input";
import { cn } from "@/lib/utils";

const eventFormSchema = z.object({
  title: z.string().min(1),
  date: z.string().optional(),
  weekday: z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]).optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().or(z.literal("")),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().or(z.literal("")),
  location: z.string().optional(),
  notes: z.string().optional(),
  repeatsWeekly: z.boolean(),
  allDay: z.boolean(),
});
type EventFormValues = z.infer<typeof eventFormSchema>;

const WEEKDAYS: Weekday[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

function toForm(event: EditableEvent): EventFormValues {
  return {
    title: event.title,
    date: event.date ?? "",
    weekday: event.weekday ?? "MO",
    startTime: event.startTime ?? "",
    endTime: event.endTime ?? "",
    location: event.location ?? "",
    notes: event.notes ?? "",
    repeatsWeekly: Boolean(event.recurrence?.freq === "WEEKLY"),
    allDay: Boolean(event.allDay),
  };
}

function toEvent(values: EventFormValues, base: EditableEvent, reminders: readonly string[]): EditableEvent {
  return {
    ...base,
    title: values.title,
    date: values.repeatsWeekly ? undefined : values.date || undefined,
    weekday: values.repeatsWeekly ? values.weekday : undefined,
    startTime: values.startTime || undefined,
    endTime: values.endTime || undefined,
    location: values.location || undefined,
    notes: values.notes || undefined,
    reminderMinutesBefore: remindersFromStrings(reminders),
    allDay: values.allDay || undefined,
    recurrence: values.repeatsWeekly
      ? { freq: "WEEKLY", until: base.recurrence?.until }
      : base.recurrence?.freq === "DAILY"
        ? base.recurrence
        : undefined,
  };
}

interface EventCardProps {
  event: EditableEvent;
  weekStart: Date;
  onChange: (event: EditableEvent) => void;
  onDelete: (event: EditableEvent) => void;
}

/**
 * One editable event. react-hook-form + Zod validate inline; every
 * change is pushed to the parent immediately so the export bar always
 * sees the edited values. The card is keyed by event id in the list,
 * so edits never reset the form or steal focus.
 */
export function EventCard({ event, weekStart, onChange, onDelete }: EventCardProps) {
  const t = useTranslations("scan");
  const band = confidenceBand(event.confidence);
  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: toForm(event),
    mode: "onBlur",
  });
  const repeatsWeekly = form.watch("repeatsWeekly");
  const allDay = form.watch("allDay");

  // Reminders live outside react-hook-form: a dynamic list of selects.
  // Step 9 fix — the old single dropdown collapsed [1440, 120] to [1440].
  const [reminders, setReminders] = useState<string[]>(() =>
    reminderStrings(event.reminderMinutesBefore),
  );
  // Keep in step when the parent replaces the event (e.g. bulk
  // "Set reminder for all" or undo). Only the serialised value drives it.
  const remindersKey = (event.reminderMinutesBefore ?? []).join(",");
  useEffect(() => {
    setReminders(reminderStrings(event.reminderMinutesBefore));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remindersKey]);

  // When the weekday/date mode flips, keep a sensible value on the other side.
  useEffect(() => {
    if (repeatsWeekly && !form.getValues("weekday")) {
      form.setValue("weekday", "MO");
    }
    if (!repeatsWeekly && !form.getValues("date")) {
      const d = new Date(weekStart);
      form.setValue("date", d.toISOString().slice(0, 10));
    }
    // Only the toggle drives this; values are read inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repeatsWeekly]);

  const sync = () => {
    const values = form.getValues();
    onChange(toEvent(values, event, reminders));
  };

  /**
   * Times accept AM/PM text ("1:00 PM", "8:30am") as well as 24-hour
   * ("13:00"): on blur, normalize to HH:mm so the Zod schema and the
   * export bar always see a valid 24-hour time. An unreadable value
   * is left alone so validation flags it instead of guessing.
   */
  const normalizeTimeField = (field: "startTime" | "endTime") => {
    const raw = form.getValues(field) ?? "";
    if (!raw) return;
    const normalized = parseTimeInput(raw);
    if (normalized && normalized !== raw) {
      form.setValue(field, normalized, { shouldValidate: true });
      sync();
    }
  };

  const updateReminders = (next: string[]) => {
    setReminders(next);
    onChange(toEvent(form.getValues(), event, next));
  };

  const reminderLabel = (minutes: number) => {
    const key = reminderPresetKey(minutes);
    return key ? t(key) : t("reminderCustom", { minutes });
  };

  /** Options for one row: unused presets plus the row's own value. */
  const reminderOptions = (rowIndex: number): number[] => {
    const usedByOthers = new Set(
      reminders.filter((_, j) => j !== rowIndex).map(Number),
    );
    const options: number[] = REMINDER_PRESETS.filter((p) => !usedByOthers.has(p));
    const current = Number(reminders[rowIndex]);
    if (Number.isFinite(current) && !options.includes(current)) options.push(current);
    return options.sort((a, b) => a - b);
  };

  const addReminder = () => {
    const next = nextReminderPreset(normalizeReminders(reminders.map(Number)));
    if (next === null) return;
    updateReminders([...reminders, String(next)]);
  };

  const inputCls =
    "h-11 w-full rounded-[10px] border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";
  const labelCls = "mb-1 block text-xs font-medium text-muted-foreground";

  return (
    <article
      aria-label={event.title}
      className={cn(
        "rounded-[16px] border bg-card p-4 shadow-soft",
        band === "low" ? "border-warning ring-1 ring-warning/50" : "border-border",
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              band === "high" && "bg-success/15 text-success",
              band === "medium" && "bg-warning/15 text-warning",
              band === "low" && "bg-warning/20 text-warning",
            )}
          >
            {band === "high" ? <CheckCircle2 className="size-3.5" aria-hidden /> : <AlertTriangle className="size-3.5" aria-hidden />}
            {band === "high" ? t("confidenceHigh") : band === "medium" ? t("confidenceMedium") : t("confidenceLow")}
          </span>
          {band === "low" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/20 px-2 py-0.5 text-xs font-semibold text-warning">
              <AlertTriangle className="size-3.5" aria-hidden />
              {t("pleaseCheck")}
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-danger hover:bg-danger/10"
          aria-label={`${t("removeEvent")}: ${event.title}`}
          onClick={() => onDelete(event)}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor={`title-${event.id}`} className={labelCls}>{t("fieldTitle")}</label>
          <input
            id={`title-${event.id}`}
            className={cn(inputCls, form.formState.errors.title && "border-danger")}
            {...form.register("title", { onChange: sync, onBlur: () => void form.trigger("title") })}
          />
          {form.formState.errors.title && <p className="mt-1 text-xs text-danger">{t("titleRequired")}</p>}
        </div>

        {repeatsWeekly ? (
          <div>
            <label htmlFor={`weekday-${event.id}`} className={labelCls}>{t("fieldWeekday")}</label>
            <select
              id={`weekday-${event.id}`}
              className={inputCls}
              {...form.register("weekday", { onChange: sync })}
            >
              {WEEKDAYS.map((day) => (
                <option key={day} value={day}>
                  {t(`weekdays.${day}`)}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label htmlFor={`date-${event.id}`} className={labelCls}>{t("fieldDate")}</label>
            <input
              id={`date-${event.id}`}
              type="date"
              className={inputCls}
              {...form.register("date", { onChange: sync })}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor={`start-${event.id}`} className={labelCls}>{t("fieldStart")}</label>
            <input
              id={`start-${event.id}`}
              type="text"
              inputMode="numeric"
              placeholder={t("timePlaceholder")}
              disabled={allDay}
              className={inputCls}
              {...form.register("startTime", { onChange: sync, onBlur: () => normalizeTimeField("startTime") })}
            />
          </div>
          <div>
            <label htmlFor={`end-${event.id}`} className={labelCls}>{t("fieldEnd")}</label>
            <input
              id={`end-${event.id}`}
              type="text"
              inputMode="numeric"
              placeholder={t("timePlaceholder")}
              disabled={allDay}
              className={inputCls}
              {...form.register("endTime", { onChange: sync, onBlur: () => normalizeTimeField("endTime") })}
            />
          </div>
        </div>

        <div>
          <label htmlFor={`loc-${event.id}`} className={labelCls}>{t("fieldLocation")}</label>
          <input
            id={`loc-${event.id}`}
            className={inputCls}
            {...form.register("location", { onChange: sync })}
          />
        </div>
        <div>
          <span id={`rem-label-${event.id}`} className={labelCls}>{t("fieldReminders")}</span>
          <div className="space-y-2" role="group" aria-labelledby={`rem-label-${event.id}`}>
            {reminders.map((value, i) => (
              <div key={`${i}-${value}`} className="flex gap-2">
                <select
                  value={value}
                  aria-label={`${t("fieldReminders")} ${i + 1}`}
                  onChange={(e) =>
                    updateReminders(reminders.map((v, j) => (j === i ? e.target.value : v)))
                  }
                  className={inputCls}
                >
                  {reminderOptions(i).map((minutes) => (
                    <option key={minutes} value={String(minutes)}>
                      {reminderLabel(minutes)}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 shrink-0 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                  aria-label={`${t("removeReminder")} ${i + 1}`}
                  onClick={() => updateReminders(reminders.filter((_, j) => j !== i))}
                >
                  <X aria-hidden />
                </Button>
              </div>
            ))}
            {reminders.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("reminderNone")}</p>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={nextReminderPreset(normalizeReminders(reminders.map(Number))) === null}
              onClick={addReminder}
            >
              <Plus aria-hidden />
              {t("addReminder")}
            </Button>
          </div>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor={`notes-${event.id}`} className={labelCls}>{t("fieldNotes")}</label>
          <input
            id={`notes-${event.id}`}
            className={inputCls}
            {...form.register("notes", { onChange: sync })}
          />
        </div>

        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="size-5 accent-[#6366F1]" {...form.register("repeatsWeekly", { onChange: sync })} />
          {t("fieldRepeats")}
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="size-5 accent-[#6366F1]" {...form.register("allDay", { onChange: sync })} />
          {t("fieldAllDay")}
        </label>
      </div>
    </article>
  );
}
