"use client";

import { CalendarPlus, Check, Copy, Download, MessageCircle, PartyPopper } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { CategorySlug } from "@/config/categories";
import { generateIcs, downloadIcs } from "@/lib/ics";
import { eventsToText, googleCalendarUrl, whatsappShareUrl } from "@/lib/calendar-links";
import { formatDateInput } from "@/lib/dates";
import { saveScan } from "@/lib/history";
import type { EditableEvent } from "@/lib/ai/schema";

interface ExportBarProps {
  events: EditableEvent[];
  weekStart: Date;
  timezone: string;
  repeatUntil: Date;
  /** Category the events were extracted as — stored with the history entry. */
  category: CategorySlug;
  isMedicine: boolean;
  medicineVerified: boolean;
  onExported: () => void;
  onScanAnother: () => void;
  exported: boolean;
}

/**
 * Export UI. Google Calendar links, Copy as text and WhatsApp work from
 * the edited events; Download .ics (Step 4) generates a real RFC 5545
 * file via src/lib/ics.ts. "Save to local history" (Step 6) stores the
 * edited events in this browser's IndexedDB only — never on the server.
 */
export function ExportBar({
  events,
  weekStart,
  timezone,
  repeatUntil,
  category,
  isMedicine,
  medicineVerified,
  onExported,
  onScanAnother,
  exported,
}: ExportBarProps) {
  const t = useTranslations("scan");
  const [copied, setCopied] = useState(false);
  const [saveHistory, setSaveHistory] = useState(false);
  const [historySaved, setHistorySaved] = useState(false);
  const [icsError, setIcsError] = useState(false);
  const gated = isMedicine && !medicineVerified;
  const selected = events.filter((e) => e.selected);

  /** Store the edited events in this browser's history when the toggle is on. */
  const maybeSaveHistory = async () => {
    if (!saveHistory || selected.length === 0) return;
    try {
      await saveScan({
        category,
        timezone,
        weekStart: formatDateInput(weekStart),
        repeatUntil: formatDateInput(repeatUntil),
        events: selected,
      });
      setHistorySaved(true);
    } catch {
      // History is a best-effort local feature (e.g. private mode may
      // block IndexedDB) — the export itself must still succeed.
    }
  };

  const downloadAll = () => {
    setIcsError(false);
    try {
      const ics = generateIcs(selected, { weekStart, timezone, repeatUntil });
      downloadIcs(ics);
      void maybeSaveHistory();
      onExported();
    } catch {
      setIcsError(true);
    }
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(eventsToText(selected, { weekStart, timezone, repeatUntil }));
      setCopied(true);
      void maybeSaveHistory();
      onExported();
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard unavailable — fall back to opening WhatsApp with the text.
      window.open(whatsappShareUrl(eventsToText(selected, { weekStart, timezone, repeatUntil })), "_blank", "noopener");
      void maybeSaveHistory();
      onExported();
    }
  };

  if (exported) {
    return (
      <section aria-live="polite" className="rounded-[16px] border border-success/40 bg-success/10 p-6 text-center">
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-gradient-primary text-white motion-safe:animate-bounce" aria-hidden>
          <PartyPopper className="size-6" />
        </div>
        <h2 className="text-xl font-bold">{t("successTitle")}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{t("successText")}</p>
        {historySaved && (
          <p className="mx-auto mt-2 max-w-md text-sm font-medium text-success">
            {t("saveHistorySaved")}
          </p>
        )}
        <Button type="button" size="lg" className="mt-5" onClick={onScanAnother}>
          {t("scanAnother")}
        </Button>
      </section>
    );
  }

  return (
    <section aria-label={t("exportTitle")} className="rounded-[16px] border border-border bg-card p-4 sm:p-5">
      <h2 className="text-lg font-bold">{t("exportTitle")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("exportSubtitle")}</p>
      {gated && (
        <p role="alert" className="mt-3 rounded-[10px] bg-warning/10 px-3 py-2 text-sm font-medium text-warning">
          {t("medicineRequired")}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" disabled={gated || selected.length === 0} onClick={downloadAll}>
          <Download aria-hidden />
          {t("downloadIcs")}
        </Button>
        <Button type="button" variant="secondary" disabled={gated || selected.length === 0} onClick={copyText}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? t("copied") : t("copyText")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={gated || selected.length === 0}
          onClick={() => {
            window.open(whatsappShareUrl(eventsToText(selected, { weekStart, timezone, repeatUntil })), "_blank", "noopener");
            void maybeSaveHistory();
            onExported();
          }}
        >
          <MessageCircle aria-hidden />
          {t("shareWhatsapp")}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t("downloadIcsNote")}</p>
      {icsError && (
        <p role="alert" className="mt-2 rounded-[10px] bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
          {t("icsError")}
        </p>
      )}

      <div className="mt-4">
        <p className="mb-2 text-sm font-medium">{t("googleCalendar")}</p>
        {selected.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noEvents")}</p>
        ) : (
          <ul className="space-y-2">
            {selected.map((event) => {
              const url = googleCalendarUrl(event, { weekStart, timezone, repeatUntil });
              if (!url) return null;
              return (
                <li key={event.id}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={onExported}
                    aria-disabled={gated}
                    onClickCapture={(e) => {
                      if (gated) e.preventDefault();
                      else void maybeSaveHistory();
                    }}
                    className="flex min-h-11 items-center gap-2 rounded-[10px] border border-border px-3 py-2 text-sm font-medium hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                  >
                    <CalendarPlus className="size-4 shrink-0 text-primary" aria-hidden />
                    <span className="truncate">
                      {event.title} — {event.date ?? event.weekday} {event.startTime ?? ""}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={saveHistory} disabled={gated} onChange={(e) => setSaveHistory(e.target.checked)} className="size-5 accent-[#6366F1]" />
        {t("saveHistory")}
      </label>
      <p className="text-xs text-muted-foreground">{t("saveHistoryNote")}</p>

      <details className="mt-4 rounded-[10px] border border-border p-3">
        <summary className="min-h-11 cursor-pointer text-sm font-medium">{t("importHelpTitle")}</summary>
        <div className="mt-2 space-y-3 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">{t("importHelpGoogleTitle")}: </span>
            {t("importHelpGoogleBody")}
          </p>
          <p>
            <span className="font-medium text-foreground">{t("importHelpIphoneTitle")}: </span>
            {t("importHelpIphoneBody")}
          </p>
          <p>
            <span className="font-medium text-foreground">{t("importHelpAndroidTitle")}: </span>
            {t("importHelpAndroidBody")}
          </p>
        </div>
      </details>
    </section>
  );
}
