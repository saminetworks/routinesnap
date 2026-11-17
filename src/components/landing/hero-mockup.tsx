"use client";

import { ArrowRight, Bell, CalendarDays, ImageIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";

/**
 * Animated hero mockup, pure CSS + Framer Motion (no external images):
 * a routine "photo" on the left turns into calendar events on the right.
 * Gentle floating animation; static when prefers-reduced-motion.
 */
export function HeroMockup() {
  const t = useTranslations("home.heroMockup");
  const reduceMotion = useReducedMotion();

  const float = reduceMotion
    ? {}
    : { animate: { y: [0, -6, 0] }, transition: { duration: 5, repeat: Infinity, ease: "easeInOut" as const } };

  const events = [
    { title: t("event1Title"), meta: t("event1Meta"), dot: "bg-primary" },
    { title: t("event2Title"), meta: t("event2Meta"), dot: "bg-warning" },
    { title: t("event3Title"), meta: t("event3Meta"), dot: "bg-success" },
  ];

  return (
    <motion.div
      {...float}
      className="mx-auto mt-12 grid w-full max-w-3xl items-center gap-3 sm:grid-cols-[1fr_auto_1fr] sm:gap-4"
      aria-hidden="true"
    >
      {/* The "photo" — a routine table, as it arrives in a chat. */}
      <div className="rounded-2xl border border-border bg-card p-4 text-left shadow-soft">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <ImageIcon className="size-4" />
          {t("photoCaption")}
        </div>
        <p className="mt-3 font-mono text-xs font-semibold uppercase tracking-wider text-primary">
          {t("photoLabel")}
        </p>
        <ul className="mt-2 space-y-1.5 font-mono text-sm">
          <li>{t("photoRow1")}</li>
          <li>{t("photoRow2")}</li>
          <li>{t("photoRow3")}</li>
        </ul>
      </div>

      <div className="flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground">
        <span className="sr-only">{t("arrowLabel")}</span>
        <ArrowRight className="size-5 rotate-90 text-primary sm:rotate-0" />
      </div>

      {/* The result — calendar events with reminders. */}
      <div className="rounded-2xl border border-border bg-card p-4 text-left shadow-soft">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <CalendarDays className="size-4" />
          {t("eventsLabel")}
        </div>
        <ul className="mt-3 space-y-2">
          {events.map((event) => (
            <li
              key={event.title}
              className="flex items-start gap-2.5 rounded-[10px] border border-border bg-background px-3 py-2"
            >
              <span
                className={`mt-1.5 size-2 shrink-0 rounded-full ${event.dot}`}
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
                  {event.title}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {event.meta}
                </span>
              </span>
              <Bell className="ml-auto size-4 shrink-0 text-muted-foreground" />
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}
