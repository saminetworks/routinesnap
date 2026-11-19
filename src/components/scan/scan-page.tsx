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
import { ScanDebugPanel, type LastExtractInfo } from "@/components/scan/debug-panel";
import { SnapHelper } from "@/components/scan/snap-helper";
import type { CategoryLocale } from "@/config/categories";
import { getCategory } from "@/config/categories";
import { createExtractor, ApiExtractError } from "@/lib/ai/extractor";
import {
  extractResultSchema,
  toEditableEvents,
  type CategoryInput,
  type EditableEvent,
  type ExtractResult,
} from "@/lib/ai/schema";
import { defaultRepeatUntil, formatDateInput, nextMonday } from "@/lib/dates";
import { rotateDataUrl, type ProcessedImage } from "@/lib/image";
import { enhanceImageForReading, shouldEnhance } from "@/lib/image-enhance";
import { analyzePhotoQuality, type PhotoQuality } from "@/lib/photo-quality";
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
  // Part B: quality signals for the current photo (never blocks extraction).
  const [quality, setQuality] = useState<PhotoQuality | null>(null);
  // Guards the async quality check against a fast image replace.
  const qualityFor = useRef<string | null>(null);
  // Reading enhancement: the original photo (to revert to) and whether
  // the current image is the enhanced copy.
  const [enhancing, setEnhancing] = useState(false);
  const [enhanced, setEnhanced] = useState(false);
  const [originalImage, setOriginalImage] = useState<ProcessedImage | null>(null);
  // Part D: last /api/extract response (status + error code) for the debug panel.
  // NOTE: the photo path goes through ApiExtractor, which carries the
  // error code but not the HTTP status, so status is null on photo
  // failures (the text path sets it from the fetch response).
  const [lastExtract, setLastExtract] = useState<LastExtractInfo | null>(null);
  // Part D: /api/health?deep=1, fetched once on load in debug mode only.
  const [health, setHealth] = useState<{ model?: string; extractor?: string } | null>(null);
  // Part C: snap helper state.
  const [helperOpen, setHelperOpen] = useState(false);
  const [helperErrorCode, setHelperErrorCode] = useState<string | null>(null);
  const [helperTipsOpen, setHelperTipsOpen] = useState(false);
  // Part C: paste-as-text tab.
  const [inputTab, setInputTab] = useState<"photo" | "text">("photo");
  const [pasteText, setPasteText] = useState("");
  const [lastMode, setLastMode] = useState<"photo" | "text">("photo");

  // ?category=slug deep link (e.g. from /templates/[slug] in Step 6).
  useEffect(() => {
    const slug = searchParams.get("category");
    if (slug && getCategory(slug)) setCategory(slug as CategoryInput);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debug mode only: fetch /api/health?deep=1 once on load for the
  // debug panel's model + extractor rows. Tolerates missing fields.
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEBUG !== "1") return;
    let cancelled = false;
    fetch("/api/health?deep=1")
      .then((res) => res.json())
      .then((body: { model?: unknown; extractor?: unknown }) => {
        if (cancelled) return;
        setHealth({
          model: typeof body.model === "string" ? body.model : undefined,
          extractor: typeof body.extractor === "string" ? body.extractor : undefined,
        });
      })
      .catch(() => {
        // Health is debug-only decoration; a failed fetch changes nothing.
      });
    return () => {
      cancelled = true;
    };
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

  /** Shared success path for photo and text extraction: same confirm/edit flow. */
  const applyExtractResult = (extracted: ExtractResult) => {
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
  };

  const extract = async (imageOverride?: ProcessedImage) => {
    const img = imageOverride ?? image;
    if (!img) {
      setError(t("noImage"));
      return;
    }
    setError(null);
    setHelperOpen(false);
    setLastMode("photo");
    setStep("extracting");
    setExtractMsg(0);
    try {
      const extracted = await createExtractor().extract({
        imageDataUrl: img.dataUrl,
        category,
        locale,
        timezone,
        referenceDate: new Date().toISOString().slice(0, 10),
      });
      setLastExtract({ status: 200, code: null });
      applyExtractResult(extracted);
    } catch (err) {
      // The API returns machine-readable codes; show a friendly,
      // translated message for each instead of the raw error.
      let code: string | null = null;
      if (err instanceof ApiExtractError) {
        code = err.code;
        if (err.code === "rate_limited") setError(t("rateLimited"));
        else if (err.code === "invalid_image") setError(t("invalidImage"));
        else if (err.code === "ai_unavailable") setError(t("aiUnavailable"));
        else if (err.code === "invalid_output") setError(t("invalidOutput"));
        else setError(t("serverError"));
      } else {
        code = "extractError";
        setError(t("extractError"));
      }
      setLastExtract({ status: null, code });
      // The snap helper opens automatically on failure, with the real
      // error code + the photo-quality signals for its explanation.
      setHelperErrorCode(code);
      setHelperOpen(true);
      setStep("upload");
    }
  };

  /** Paste-as-text submit: POSTs to /api/extract-text and feeds the
   * result into the SAME confirm/edit flow as photo extraction. */
  const submitText = async () => {
    if (pasteText.trim().length === 0) {
      setError(t("pasteEmpty"));
      return;
    }
    setError(null);
    setHelperOpen(false);
    setLastMode("text");
    setStep("extracting");
    setExtractMsg(0);
    try {
      const res = await fetch("/api/extract-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: pasteText,
          category,
          locale,
          timezone,
          referenceDate: new Date().toISOString().slice(0, 10),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        retryAfterSeconds?: number;
      } & Partial<ExtractResult>;
      if (!res.ok) {
        const code = body.error ?? "extraction_failed";
        setLastExtract({ status: res.status, code });
        if (code === "rate_limited") setError(t("rateLimited"));
        else if (code === "ai_unavailable") setError(t("aiUnavailable"));
        else if (code === "invalid_output") setError(t("invalidOutput"));
        else setError(t("serverError"));
        setHelperErrorCode(code);
        setHelperOpen(true);
        setStep("upload");
        return;
      }
      setLastExtract({ status: res.status, code: null });
      applyExtractResult(extractResultSchema.parse(body));
    } catch {
      setLastExtract({ status: null, code: "extractError" });
      setError(t("extractError"));
      setHelperErrorCode("extractError");
      setHelperOpen(true);
      setStep("upload");
    }
  };

  /** "Try again" from the snap helper re-runs whichever mode failed last. */
  const retryLast = () => {
    setHelperOpen(false);
    if (lastMode === "text") void submitText();
    else void extract();
  };

  /** One blank editable event row (same shape as EventsEditor's Add event). */
  const blankManualEvent = (): EditableEvent => ({
    id: `evt-manual-${Date.now().toString(36)}`,
    title: "",
    date: startDate,
    startTime: "09:00",
    endTime: "10:00",
    reminderMinutesBefore: [30],
    confidence: 1,
    selected: true,
  });

  /**
   * "Add events manually" from the snap helper. The confirm step's
   * editor already has its own Add event button, so when a result
   * exists we just go there. When extraction failed and there is no
   * result yet, seed a blank result + one blank editable event so
   * the user can type events in instead of being stuck.
   */
  const handleManualAdd = () => {
    setHelperOpen(false);
    setHelperTipsOpen(false);
    if (result) {
      setStep("confirm");
      return;
    }
    setResult({
      detectedCategory: category === "auto" ? "class-routine" : category,
      language: "mixed",
      assumptions: [],
      warnings: [],
      events: [],
    });
    setEvents([blankManualEvent()]);
    setMedicineVerified(false);
    setExported(false);
    setStep("confirm");
  };

  /** Retake: clear the photo (and its quality signals) back to upload. */
  const clearImage = () => {
    setImage(null);
    setQuality(null);
    qualityFor.current = null;
    setEnhanced(false);
    setOriginalImage(null);
  };

  /** Photo picked: store it, then check quality async — never blocks the extract button. */
  const handleImage = (img: ProcessedImage) => {
    setImage(img);
    setError(null);
    setQuality(null);
    setEnhanced(false);
    setOriginalImage(null);
    qualityFor.current = img.dataUrl;
    void analyzePhotoQuality(img.dataUrl).then((q) => {
      if (qualityFor.current === img.dataUrl) setQuality(q);
    });
  };

  const handleRotate = async (degrees: 90 | -90) => {
    if (!image) return;
    try {
      // Rotate the pixels only. The preview shows image.dataUrl as-is,
      // so the preview and the bytes sent to /api/extract always match.
      // (Previously this also incremented a CSS rotation, so one click
      // turned the preview 180° while the upload was only rotated 90°.)
      const dataUrl = await rotateDataUrl(image.dataUrl, degrees);
      setImage({ ...image, dataUrl });
    } catch {
      setError(t("couldNotRead"));
    }
  };

  /**
   * Reading enhancement: brighten / sharpen / add contrast to a dark,
   * blurry or washed-out photo so the AI can read it. Only offered
   * when the quality check flags the photo; a clean photo is always
   * sent as-is. Returns the enhanced image (or null) so a caller can
   * scan it right away instead of reading stale state.
   */
  const handleEnhance = async (): Promise<ProcessedImage | null> => {
    if (!image || enhancing || !quality || !shouldEnhance(quality)) return null;
    setEnhancing(true);
    try {
      const result = await enhanceImageForReading(image.dataUrl, quality);
      const enhancedImage: ProcessedImage = {
        ...image,
        dataUrl: result.dataUrl,
        blob: result.blob,
        width: result.width,
        height: result.height,
        sentAsIs: false,
        processing: "enhanced",
      };
      if (!originalImage) setOriginalImage(image);
      setImage(enhancedImage);
      setEnhanced(true);
      setError(null);
      // Re-check quality on the enhanced copy: the warning should
      // clear (or shrink) when the enhancement worked.
      qualityFor.current = result.dataUrl;
      void analyzePhotoQuality(result.dataUrl).then((q) => {
        if (qualityFor.current === result.dataUrl) setQuality(q);
      });
      return enhancedImage;
    } catch {
      setError(t("couldNotRead"));
      return null;
    } finally {
      setEnhancing(false);
    }
  };

  /** Go back to the original photo (before enhancement). */
  const handleUseOriginal = () => {
    if (!originalImage) return;
    setImage(originalImage);
    setEnhanced(false);
    setOriginalImage(null);
    qualityFor.current = originalImage.dataUrl;
    void analyzePhotoQuality(originalImage.dataUrl).then((q) => {
      if (qualityFor.current === originalImage.dataUrl) setQuality(q);
    });
  };

  /** Snap Helper action: enhance a hard-to-read photo, then scan it. */
  const handleEnhanceAndRetry = async () => {
    setHelperOpen(false);
    const enhancedImage = await handleEnhance();
    if (enhancedImage) void extract(enhancedImage);
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
    setQuality(null);
    qualityFor.current = null;
    setResult(null);
    setEvents([]);
    setMedicineVerified(false);
    setExported(false);
    setError(null);
    setHelperOpen(false);
    setHelperErrorCode(null);
    setHelperTipsOpen(false);
    setPasteText("");
    setInputTab("photo");
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
          <div className="flex gap-2" role="tablist" aria-label="Input type">
            {(["photo", "text"] as const).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={inputTab === tab}
                onClick={() => setInputTab(tab)}
                className={cn(
                  "min-h-11 flex-1 rounded-[12px] border px-3 text-sm font-medium sm:flex-none sm:px-5",
                  inputTab === tab ? "border-primary bg-primary/10" : "border-border bg-card text-muted-foreground",
                )}
              >
                {tab === "photo" ? t("pasteTabPhoto") : t("pasteTabText")}
              </button>
            ))}
          </div>

          {inputTab === "photo" && (
            <>
              <Dropzone onImage={handleImage} onError={setError} />
              {image && (
                <ImageViewer dataUrl={image.dataUrl} onRotate={handleRotate} onReplace={clearImage} />
              )}
              {image && quality && !quality.unknown && (quality.dark || quality.blurry || quality.glare) && (
                <div role="status" className="flex flex-wrap items-start gap-3 rounded-[16px] border border-warning/50 bg-warning/10 p-4">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-warning">{t("qualityTitle")}</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                      {quality.dark && <li>{t("qualityDark")}</li>}
                      {quality.blurry && <li>{t("qualityBlurry")}</li>}
                      {quality.glare && <li>{t("qualityGlare")}</li>}
                    </ul>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" size="sm" disabled={enhancing} onClick={() => void handleEnhance()}>
                      {enhancing ? t("enhancingPhoto") : t("enhancePhoto")}
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={clearImage}>
                      {t("qualityRetake")}
                    </Button>
                  </div>
                </div>
              )}
              {image && enhanced && (
                <div role="status" className="flex flex-wrap items-center gap-3 rounded-[16px] border border-success/50 bg-success/10 p-4">
                  <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden />
                  <p className="min-w-0 flex-1 text-sm font-medium">{t("enhancedPhoto")}</p>
                  <Button type="button" variant="secondary" size="sm" onClick={handleUseOriginal}>
                    {t("useOriginal")}
                  </Button>
                </div>
              )}
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden />
                {t("privacy")}
              </p>
              <Button type="button" size="lg" className="w-full sm:w-auto" disabled={!image} onClick={() => void extract()}>
                {t("extract")}
              </Button>
            </>
          )}

          {inputTab === "text" && (
            <div className="space-y-3">
              <label htmlFor="paste-text" className="block text-sm font-medium">
                {t("pasteLabel")}
              </label>
              <textarea
                id="paste-text"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={t("pastePlaceholder")}
                rows={8}
                className="w-full rounded-[12px] border border-input bg-background px-3 py-2 text-sm"
              />
              <Button type="button" size="lg" className="w-full sm:w-auto" onClick={submitText}>
                {t("pasteSubmit")}
              </Button>
            </div>
          )}

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

          <div>
            <Button type="button" variant="secondary" onClick={() => setHelperOpen(true)}>
              {t("needHelp")}
            </Button>
          </div>
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

      {step === "confirm" && result && (
        <section className="mt-6 space-y-6">
          <Button type="button" variant="ghost" onClick={() => setStep("upload")}>
            <ArrowLeft aria-hidden />
            {t("backToUpload")}
          </Button>

          {image && (
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
          )}

          <div className={cn("grid gap-6 lg:items-start", image && "lg:grid-cols-2")}>
            {image && (
              <div className={cn(mobileTab === "photo" ? "block" : "hidden", "lg:block")}>
                <ImageViewer dataUrl={image.dataUrl} onRotate={handleRotate} onReplace={() => { clearImage(); setStep("upload"); }} />
              </div>
            )}
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

      <SnapHelper
        open={helperOpen}
        errorCode={helperErrorCode}
        quality={quality}
        tipsOpen={helperTipsOpen}
        onRetake={() => {
          clearImage();
          setHelperOpen(false);
          setHelperTipsOpen(false);
          setStep("upload");
        }}
        onShowTips={() => setHelperTipsOpen((v) => !v)}
        onRetry={retryLast}
        onEnhanceAndRetry={handleEnhanceAndRetry}
        onManualAdd={handleManualAdd}
        onClose={() => setHelperOpen(false)}
        labels={{
          title: t("helper.title"),
          close: t("helper.close"),
          reasonRateLimited: t("helper.reasonRateLimited"),
          reasonInvalidImage: t("helper.reasonInvalidImage"),
          reasonAiUnavailable: t("helper.reasonAiUnavailable"),
          reasonInvalidOutput: t("helper.reasonInvalidOutput"),
          reasonPhotoQuality: t("helper.reasonPhotoQuality"),
          reasonUnknown: t("helper.reasonUnknown"),
          qualityNoteDark: t("qualityDark"),
          qualityNoteBlurry: t("qualityBlurry"),
          qualityNoteGlare: t("qualityGlare"),
          tipsTitle: t("helper.tipsTitle"),
          tips: [
            t("helper.tip1"),
            t("helper.tip2"),
            t("helper.tip3"),
            t("helper.tip4"),
            t("helper.tip5"),
          ],
          retake: t("helper.retake"),
          showTips: t("helper.showTips"),
          hideTips: t("helper.hideTips"),
          retry: t("helper.retry"),
          enhanceAndRetry: t("helper.enhanceAndRetry"),
          manualAdd: t("helper.manualAdd"),
        }}
      />

      <ScanDebugPanel
        image={image}
        processing={image ? (image.sentAsIs ? "sent-as-is" : "processed") : undefined}
        lastExtract={lastExtract}
        model={health?.model}
        extractor={health?.extractor}
        labels={{
          title: t("debug.title"),
          imageSize: t("debug.imageSize"),
          fileType: t("debug.fileType"),
          processing: t("debug.processing"),
          lastExtract: t("debug.lastExtract"),
          model: t("debug.model"),
          extractor: t("debug.extractor"),
          sentAsIs: t("debug.sentAsIs"),
          processed: t("debug.processed"),
        }}
      />

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
