"use client";

import { AlertTriangle, Info, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { EditableEvent } from "@/lib/ai/schema";
import { EventCard } from "./event-card";

interface EventsEditorProps {
  events: EditableEvent[];
  weekStart: Date;
  warnings: string[];
  assumptions: string[];
  isMedicine: boolean;
  medicineVerified: boolean;
  onMedicineVerifiedChange: (value: boolean) => void;
  onEventsChange: (events: EditableEvent[]) => void;
  onDelete: (event: EditableEvent) => void;
  onBulkDelete: (removed: EditableEvent[], remaining: EditableEvent[]) => void;
}

function shiftTime(time: string | undefined, minutes: number): string | undefined {
  if (!time) return time;
  const [h, m] = time.split(":").map(Number);
  const total = (((h * 60 + m + minutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Confirm step: warnings, bulk actions, editable event cards, add event. */
export function EventsEditor({
  events,
  weekStart,
  warnings,
  assumptions,
  isMedicine,
  medicineVerified,
  onMedicineVerifiedChange,
  onEventsChange,
  onDelete,
  onBulkDelete,
}: EventsEditorProps) {
  const t = useTranslations("scan");
  const [shiftMinutes, setShiftMinutes] = useState("");
  const [bulkReminder, setBulkReminder] = useState("30");

  const selectedCount = events.filter((e) => e.selected).length;
  const allSelected = events.length > 0 && selectedCount === events.length;

  const updateOne = (updated: EditableEvent) =>
    onEventsChange(events.map((e) => (e.id === updated.id ? updated : e)));

  const toggleAll = () => onEventsChange(events.map((e) => ({ ...e, selected: !allSelected })));

  const deleteSelected = () => {
    const removed = events.filter((e) => e.selected);
    if (removed.length === 0) return;
    onBulkDelete(removed, events.filter((e) => !e.selected));
  };

  const applyShift = () => {
    const minutes = Number(shiftMinutes);
    if (!Number.isFinite(minutes) || minutes === 0) return;
    onEventsChange(
      events.map((e) => ({
        ...e,
        startTime: shiftTime(e.startTime, minutes),
        endTime: shiftTime(e.endTime, minutes),
      })),
    );
    setShiftMinutes("");
  };

  const applyReminderAll = () => {
    const value = bulkReminder === "" ? undefined : [Number(bulkReminder)];
    onEventsChange(events.map((e) => ({ ...e, reminderMinutesBefore: value })));
  };

  const addEvent = () => {
    const now = new Date(weekStart);
    onEventsChange([
      ...events,
      {
        id: `evt-manual-${Date.now().toString(36)}`,
        title: "",
        date: now.toISOString().slice(0, 10),
        startTime: "09:00",
        endTime: "10:00",
        reminderMinutesBefore: [30],
        confidence: 1,
        selected: true,
      },
    ]);
  };

  return (
    <div className="space-y-4">
      {warnings.length > 0 && (
        <div role="alert" className="rounded-[16px] border border-warning/50 bg-warning/10 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-warning">
            <AlertTriangle className="size-4" aria-hidden />
            {t("warningsTitle")}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {assumptions.length > 0 && (
        <div className="rounded-[16px] border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Info className="size-4 text-muted-foreground" aria-hidden />
            {t("assumptionsTitle")}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {isMedicine && (
        <div role="alert" className="rounded-[16px] border border-warning/60 bg-warning/10 p-4">
          <p className="flex items-start gap-2 text-sm font-semibold text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("medicineNotice")}
          </p>
          <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="mt-0.5 size-5 shrink-0 accent-[#6366F1]"
              checked={medicineVerified}
              onChange={(e) => onMedicineVerifiedChange(e.target.checked)}
            />
            {t("medicineCheckbox")}
          </label>
        </div>
      )}

      <p className="text-sm font-semibold" aria-live="polite">
        {t("eventsFound", { count: events.length })}
      </p>

      {events.length === 0 ? (
        <p className="rounded-[16px] border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("noEvents")}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-[16px] border border-border bg-card p-3">
            <Button type="button" variant="secondary" size="sm" onClick={toggleAll}>
              {allSelected ? t("deselectAll") : t("selectAll")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={selectedCount === 0}
              onClick={deleteSelected}
            >
              <Trash2 aria-hidden />
              {t("deleteSelected")} ({selectedCount})
            </Button>
            <label className="flex items-center gap-2 text-sm">
              <span className="sr-only">{t("shiftLabel")}</span>
              <input
                type="number"
                inputMode="numeric"
                value={shiftMinutes}
                onChange={(e) => setShiftMinutes(e.target.value)}
                placeholder="±30"
                aria-label={t("shiftLabel")}
                className="h-9 w-20 rounded-[10px] border border-input bg-background px-2 text-sm"
              />
              <Button type="button" variant="secondary" size="sm" onClick={applyShift}>
                {t("shiftApply")}
              </Button>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="sr-only">{t("setReminderAll")}</span>
              <select
                value={bulkReminder}
                onChange={(e) => setBulkReminder(e.target.value)}
                aria-label={t("setReminderAll")}
                className="h-9 rounded-[10px] border border-input bg-background px-2 text-sm"
              >
                <option value="">{t("reminderNone")}</option>
                <option value="10">{t("reminder10")}</option>
                <option value="30">{t("reminder30")}</option>
                <option value="60">{t("reminder60")}</option>
                <option value="1440">{t("reminder1440")}</option>
              </select>
              <Button type="button" variant="secondary" size="sm" onClick={applyReminderAll}>
                {t("setReminderAll")}
              </Button>
            </label>
          </div>

          <ul className="space-y-3">
            {events.map((event) => (
              <li key={event.id} className="flex gap-2">
                <input
                  type="checkbox"
                  aria-label={`${event.title || t("fieldTitle")} — ${t("selectAll")}`}
                  checked={event.selected}
                  onChange={(e) =>
                    onEventsChange(events.map((x) => (x.id === event.id ? { ...x, selected: e.target.checked } : x)))
                  }
                  className="mt-5 size-5 shrink-0 accent-[#6366F1]"
                />
                <div className="min-w-0 flex-1">
                  <EventCard event={event} weekStart={weekStart} onChange={updateOne} onDelete={onDelete} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <Button type="button" variant="secondary" onClick={addEvent} className="w-full sm:w-auto">
        <Plus aria-hidden />
        {t("addEvent")}
      </Button>
    </div>
  );
}
