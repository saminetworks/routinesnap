"use client";

import { AlertTriangle, ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CategoryPicker } from "@/components/scan/category-picker";
import { Dropzone } from "@/components/scan/dropzone";
import { EventsEditor } from "@/components/scan/events-editor";
import { ExportBar } from "@/components/scan/export-bar";
import { ImageViewer } from "@/components/scan/image-viewer";
import type { CategoryLocale } from "@/config/categories";
import { getCategory } from "@/config/categories";
import { createExtractor, ApiExtractError } from "@/lib/ai/extractor";
import { toEditableEvents, type CategoryInput, type EditableEvent, type ExtractResult } from "@/lib/ai/schema";
import { defaultRepeatUntil, formatDateInput, nextMonday } from "@/lib/dates";
import { rotateDataUrl, type ProcessedImage } from "@/lib/image";
import { cn } from "@/lib/utils";

type Step = "upload" | "extracting" | "confirm";

const TIMEZONE_PICKS = ["Asia/Dhaka", "Asia/Tokyo", "Asia/Kolkata"] as const;

interface DeletedSnapshot {
  removed: EditableEvent[];
  snapshot: EditableEvent[];
}

/** The /scan tool: upload → (mock) extract → confirm/edit → export. */
export function ScanPage() {
  const t = useTranslations("scan");
  const locale = useLocale() as CategoryLocale;
  const searchParams = useSearchParams();

  const [step, setStep] = useState<Step>("upload");
  const [image, setImage] = useState<ProcessedImage | null>(null);
  const [rotation, setRotation] = useState(0);
  const [category, setCategory] = useState<CategoryInput>("auto");
  const [timezone, setTimezone] = useState(() =>
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "Asia/Dhaka",
  );
  const [startDate, setStartDate] = useState(() => formatDateInput(nextMonday()));
  const [repeatUntil, setRepeatUntil] = useState(() => formatDateInput(defaultRepeatUntil()));
  const [defaultReminder, setDefaultReminder] = useState("30");
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [events, setEvents] = useState<EditableEvent[]>([]);
  const [medicineVerified, setMedicineVerified] = useState(false);
  const [exported, setExported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractMsg, setExtractMsg] = useState(0);
  const [mobileTab, setMobileTab] = useState<"photo" | "events">("events");
  const [toast, setToast] = useState<{ message: string; undo: boolean } | null>(null);
  const [lastDeleted, setLastDeleted] = useState<DeletedSnapshot | null>(null);
  const toastTimer = useRef<number | null>(null);

  // ?category=slug deep link (e.g. from /templates/[slug] in Step 6).
  useEffect(() => {
    const slug = searchParams.get("category");
    if (slug && getCategory(slug)) setCategory(slug as CategoryInput);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const extractingMessages = useMemo(() => {
    const count = 4;
    return Array.from({ length: count }, (_, i) => t(`extractingMessages.${i}`));
  }, [t]);

  useEffect(() => {
    if (step !== "extracting") return;
    const id = window.setInterval(() => setExtractMsg((m) => (m + 1) % extractingMessages.length), 1800);
    return () => window.clearInterval(id);
  }, [step, extractingMessages.length]);

  useEffect(() => {
    if (!toast) return;
    toastTimer.current = window.setTimeout(() => setToast(null), 5000);
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, [toast]);

  const showToast = (message: string, undo: boolean) => setToast({ message, undo });

  const isMedicine = result?.detectedCategory === "medicine-schedule";

  const extract = async () => {
    if (!image) {
      setError(t("noImage"));
      return;
    }
    setError(null);
    setStep("extracting");
    setExtractMsg(0);
    try {
      const extracted = await createExtractor().extract({
        imageDataUrl: image.dataUrl,
        category,
        locale,
        timezone,
        referenceDate: new Date().toISOString().slice(0, 10),
      });
      const reminder = defaultReminder === "" ? undefined : [Number(defaultReminder)];
      setResult(extracted);
      setEvents(
        toEditableEvents(extracted.events).map((e) => ({
          ...e,
          reminderMinutesBefore: e.reminderMinutesBefore ?? reminder,
        })),
      );
      setMedicineVerified(false);
      setExported(false);
      setStep("confirm");
    } catch (err) {
      // The API returns machine-readable codes; show a friendly,
      // translated message for each instead of the raw error.
      if (err instanceof ApiExtractError) {
        if (err.code === "rate_limited") setError(t("rateLimited"));
        else if (err.code === "invalid_image") setError(t("invalidImage"));
        else setError(t("serverError"));
      } else {
        setError(t("extractError"));
      }
      setStep("upload");
    }
  };

  const handleRotate = async (degrees: 90 | -90) => {
    if (!image) return;
    try {
      const dataUrl = await rotateDataUrl(image.dataUrl, degrees);
      setImage({ ...image, dataUrl });
      setRotation((r) => (r + degrees + 360) % 360);
    } catch {
      setError(t("couldNotRead"));
    }
  };

  const handleDelete = (event: EditableEvent) => {
    setLastDeleted({ removed: [event], snapshot: events });
    setEvents(events.filter((e) => e.id !== event.id));
    showToast(t("eventDeleted"), true);
  };

  const handleBulkDelete = (removed: EditableEvent[], remaining: EditableEvent[]) => {
    setLastDeleted({ removed, snapshot: events });
    setEvents(remaining);
    showToast(t("eventDeleted"), true);
  };

  const undoDelete = () => {
    if (!lastDeleted) return;
    setEvents(lastDeleted.snapshot);
    setLastDeleted(null);
    setToast(null);
  };

  const resetAll = () => {
    setStep("upload");
    setImage(null);
    setRotation(0);
    setResult(null);
    setEvents([]);
    setMedicineVerified(false);
    setExported(false);
    setError(null);
  };

  const weekStart = useMemo(() => new Date(`${startDate}T00:00:00`), [startDate]);
  const repeatUntilDate = useMemo(() => new Date(`${repeatUntil}T00:00:00`), [repeatUntil]);
  const timezoneOptions = Array.from(new Set([timezone, ...TIMEZONE_PICKS]));

  const steps: { id: Step | "export"; label: string; active: boolean }[] = [
    { id: "upload", label: t("stepUpload"), active: step === "upload" },
    { id: "confirm", label: t("stepConfirm"), active: step === "confirm" },
    { id: "export", label: t("stepExport"), active: step === "confirm" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
      </header>

      <ol className="mt-6 flex flex-wrap gap-2" aria-label="Steps">
        {steps.map((s, i) => (
          <li
            key={s.id}
            aria-current={s.active ? "step" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium",
              s.active ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground",
            )}
          >
            <span className="flex size-6 items-center justify-center rounded-full bg-gradient-primary font-mono text-xs text-white" aria-hidden>
              {i + 1}
            </span>
            {s.label}
          </li>
        ))}
      </ol>

      {error && (
        <div role="alert" className="mt-6 flex items-start gap-2 rounded-[16px] border border-danger/50 bg-danger/10 p-4 text-sm font-medium text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </div>
      )}

      {step === "upload" && (
        <section className="mt-6 space-y-6">
          <Dropzone
            onImage={(img) => {
              setImage(img);
              setRotation(0);
              setError(null);
            }}
            onError={setError}
          />
          {image && (
            <ImageViewer dataUrl={image.dataUrl} rotation={rotation} onRotate={handleRotate} onReplace={() => setImage(null)} />
          )}
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden />
            {t("privacy")}
          </p>

          <div className="rounded-[16px] border border-border bg-card p-4 sm:p-5">
            <CategoryPicker value={category} onChange={setCategory} locale={locale} />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="timezone" className="mb-1 block text-sm font-medium">{t("timezoneLabel")}</label>
                <select
                  id="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="h-11 w-full rounded-[10px] border border-input bg-background px-3 text-sm"
                >
                  {timezoneOptions.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="reminder" className="mb-1 block text-sm font-medium">{t("reminderLabel")}</label>
                <select
                  id="reminder"
                  value={defaultReminder}
                  onChange={(e) => setDefaultReminder(e.target.value)}
                  className="h-11 w-full rounded-[10px] border border-input bg-background px-3 text-sm"
                >
                  <option value="">{t("reminderNone")}</option>
                  <option value="10">{t("reminder10")}</option>
                  <option value="30">{t("reminder30")}</option>
                  <option value="60">{t("reminder60")}</option>
                  <option value="1440">{t("reminder1440")}</option>
                </select>
              </div>
              <div>
                <label htmlFor="start-date" className="mb-1 block text-sm font-medium">{t("startDateLabel")}</label>
                <input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-11 w-full rounded-[10px] border border-input bg-background px-3 text-sm"
                />
              </div>
              <div>
                <label htmlFor="repeat-until" className="mb-1 block text-sm font-medium">{t("repeatUntilLabel")}</label>
                <input
                  id="repeat-until"
                  type="date"
                  value={repeatUntil}
                  onChange={(e) => setRepeatUntil(e.target.value)}
                  className="h-11 w-full rounded-[10px] border border-input bg-background px-3 text-sm"
                />
              </div>
            </div>
          </div>

          <Button type="button" size="lg" className="w-full sm:w-auto" disabled={!image} onClick={extract}>
            {t("extract")}
          </Button>
        </section>
      )}

      {step === "extracting" && (
        <section className="mt-6" aria-live="polite" aria-busy="true">
          <div className="flex flex-col items-center gap-4 rounded-[16px] border border-border bg-card p-10 text-center">
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
            <p className="text-lg font-semibold">{extractingMessages[extractMsg]}</p>
            <p className="text-sm text-muted-foreground">{t("extracting")}</p>
            <div className="w-full max-w-md space-y-3" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-[16px] bg-muted/40" />
              ))}
            </div>
          </div>
        </section>
      )}

      {step === "confirm" && result && image && (
        <section className="mt-6 space-y-6">
          <Button type="button" variant="ghost" onClick={() => setStep("upload")}>
            <ArrowLeft aria-hidden />
            {t("backToUpload")}
          </Button>

          <div className="flex gap-2 lg:hidden" role="tablist" aria-label="Confirm view">
            {(["photo", "events"] as const).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={mobileTab === tab}
                onClick={() => setMobileTab(tab)}
                className={cn(
                  "min-h-11 flex-1 rounded-[12px] border px-3 text-sm font-medium",
                  mobileTab === tab ? "border-primary bg-primary/10" : "border-border bg-card text-muted-foreground",
                )}
              >
                {tab === "photo" ? t("photoTab") : t("eventsTab")}
              </button>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <div className={cn(mobileTab === "photo" ? "block" : "hidden", "lg:block")}>
              <ImageViewer dataUrl={image.dataUrl} rotation={rotation} onRotate={handleRotate} onReplace={() => { setImage(null); setStep("upload"); }} />
            </div>
            <div className={cn(mobileTab === "events" ? "block" : "hidden", "lg:block")}>
              <EventsEditor
                events={events}
                weekStart={weekStart}
                warnings={result.warnings}
                assumptions={result.assumptions}
                isMedicine={isMedicine}
                medicineVerified={medicineVerified}
                onMedicineVerifiedChange={setMedicineVerified}
                onEventsChange={setEvents}
                onDelete={handleDelete}
                onBulkDelete={handleBulkDelete}
              />
            </div>
          </div>

          <ExportBar
            events={events}
            weekStart={weekStart}
            timezone={timezone}
            repeatUntil={repeatUntilDate}
            category={result.detectedCategory}
            isMedicine={isMedicine}
            medicineVerified={medicineVerified}
            exported={exported}
            onExported={() => setExported(true)}
            onScanAnother={resetAll}
          />
        </section>
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-[12px] border border-border bg-card px-4 py-3 shadow-soft"
        >
          <span className="text-sm font-medium">{toast.message}</span>
          {toast.undo && (
            <Button type="button" variant="secondary" size="sm" onClick={undoDelete}>
              {t("undo")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
