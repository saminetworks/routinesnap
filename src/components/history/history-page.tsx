"use client";

import { CalendarDays, Download, Eye, EyeOff, History as HistoryIcon, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { getCategory, type CategoryLocale } from "@/config/categories";
import { generateIcs, downloadIcs } from "@/lib/ics";
import {
  clearHistory,
  deleteScan,
  listSavedScans,
  type SavedScan,
} from "@/lib/history";

/**
 * Local-only history (Step 6): saved scans live in this browser's
 * IndexedDB only — never on the server. List, view events,
 * re-download .ics, delete one, delete all.
 */
export function HistoryPage() {
  const t = useTranslations("history");
  const tCommon = useTranslations("common");
  const locale = useLocale() as CategoryLocale;
  const [scans, setScans] = useState<SavedScan[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSavedScans()
      .then((list) => {
        if (!cancelled) setScans(list);
      })
      .catch(() => {
        if (!cancelled) setScans([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const removeOne = async (id: string) => {
    if (!window.confirm(t("deleteConfirm"))) return;
    await deleteScan(id);
    setScans((prev) => (prev ?? []).filter((s) => s.id !== id));
  };

  const removeAll = async () => {
    if (!window.confirm(t("deleteAllConfirm"))) return;
    await clearHistory();
    setScans([]);
  };

  const downloadScan = (scan: SavedScan) => {
    const ics = generateIcs(scan.events, {
      weekStart: new Date(`${scan.weekStart}T00:00:00`),
      timezone: scan.timezone,
      repeatUntil: new Date(`${scan.repeatUntil}T00:00:00`),
    });
    downloadIcs(ics, "routinesnap.ics");
  };

  if (scans === null) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12" aria-busy="true">
        <p className="text-muted-foreground">{tCommon("loading")}</p>
        <div className="mt-6 space-y-3" aria-hidden>
          {[0, 1].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-[16px] bg-muted/40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
        <p className="mt-3 flex items-start gap-2 rounded-[10px] bg-success/10 px-3 py-2 text-sm text-muted-foreground">
          <HistoryIcon className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          {t("privacyNote")}
        </p>
      </header>

      {scans.length === 0 ? (
        <section className="mt-8 rounded-[16px] border border-border bg-card p-8 text-center">
          <HistoryIcon className="mx-auto size-10 text-muted-foreground" aria-hidden />
          <h2 className="mt-3 text-xl font-bold">{t("emptyTitle")}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{t("emptyText")}</p>
          <Button asChild size="lg" className="mt-5">
            <Link href="/scan">{t("scanCta")}</Link>
          </Button>
        </section>
      ) : (
        <>
          <div className="mt-8 flex justify-end">
            <Button type="button" variant="destructive" size="sm" onClick={removeAll}>
              <Trash2 aria-hidden />
              {t("deleteAll")}
            </Button>
          </div>
          <ul className="mt-4 space-y-4">
            {scans.map((scan) => {
              const category = getCategory(scan.category);
              const open = openId === scan.id;
              const date = new Date(scan.savedAt).toLocaleDateString(locale, {
                year: "numeric",
                month: "short",
                day: "numeric",
              });
              return (
                <li key={scan.id} className="rounded-[16px] border border-border bg-card p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 font-bold">
                        <span aria-hidden>{category?.emoji ?? "📅"}</span>
                        {category?.name[locale] ?? scan.category}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <CalendarDays className="size-4" aria-hidden />
                        {t("savedOn", { date })} · {t("eventsCount", { count: scan.events.length })}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setOpenId(open ? null : scan.id)}
                        aria-expanded={open}
                      >
                        {open ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                        {open ? t("hideEvents") : t("viewEvents")}
                      </Button>
                      <Button type="button" variant="secondary" size="sm" onClick={() => downloadScan(scan)}>
                        <Download aria-hidden />
                        {t("downloadIcs")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeOne(scan.id)}
                        aria-label={`${t("delete")} — ${category?.name[locale] ?? scan.category}`}
                      >
                        <Trash2 aria-hidden />
                        {t("delete")}
                      </Button>
                    </div>
                  </div>
                  {open && (
                    <ul className="mt-4 space-y-2 border-t border-border pt-4">
                      {scan.events.map((event) => (
                        <li key={event.id} className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium">{event.title}</span>
                          <span className="text-muted-foreground">
                            {event.date ?? event.weekday} {event.startTime ?? ""}
                            {event.endTime ? `–${event.endTime}` : ""}
                            {event.location ? ` · ${event.location}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
