"use client";

import { ArrowRight, Bell, CalendarDays, Camera } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";

/**
 * Animated hero mockup, pure CSS + Framer Motion (no external images):
 * a CAMERA viewfinder on the left snaps a routine "photo" and turns it
 * into CALENDAR events on the right — the whole app theme in one picture.
 * Purple + white: white cards, purple accents, gradient calendar header.
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
      {/* The camera — a viewfinder framing the routine photo. */}
      <div className="rounded-2xl border-2 border-primary/30 bg-card p-4 text-left shadow-soft">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Camera className="size-4 text-primary" />
          {t("photoCaption")}
        </div>
        {/* Viewfinder frame with purple corner brackets. */}
        <div className="relative mt-3 rounded-xl border border-primary/20 bg-primary/[0.03] p-3">
          <span
            aria-hidden
            className="absolute -left-1 -top-1 size-4 rounded-tl-lg border-l-2 border-t-2 border-primary"
          />
          <span
            aria-hidden
            className="absolute -right-1 -top-1 size-4 rounded-tr-lg border-r-2 border-t-2 border-primary"
          />
          <span
            aria-hidden
            className="absolute -bottom-1 -left-1 size-4 rounded-bl-lg border-b-2 border-l-2 border-primary"
          />
          <span
            aria-hidden
            className="absolute -bottom-1 -right-1 size-4 rounded-br-lg border-b-2 border-r-2 border-primary"
          />
          <p className="font-mono text-xs font-semibold uppercase tracking-wider text-primary">
            {t("photoLabel")}
          </p>
          <ul className="mt-2 space-y-1.5 font-mono text-sm">
            <li>{t("photoRow1")}</li>
            <li>{t("photoRow2")}</li>
            <li>{t("photoRow3")}</li>
          </ul>
        </div>
        {/* Shutter button. */}
        <div className="mt-4 flex justify-center">
          <span
            aria-hidden
            className="flex size-9 items-center justify-center rounded-full border-4 border-primary bg-white shadow-sm"
          >
            <span className="size-3 rounded-full bg-primary" />
          </span>
        </div>
      </div>

      {/* The snap — shutter flash travelling to the calendar. */}
      <div className="flex flex-col items-center justify-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="sr-only">{t("arrowLabel")}</span>
        <span className="relative flex size-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex size-3 rounded-full bg-primary" />
        </span>
        <ArrowRight className="size-5 rotate-90 text-primary sm:rotate-0" />
      </div>

      {/* The result — a calendar page with the events on it. */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card text-left shadow-soft">
        <div className="bg-gradient-primary flex items-center gap-2 px-4 py-3 text-white">
          <CalendarDays className="size-4" />
          <span className="text-xs font-semibold">{t("eventsLabel")}</span>
          <span className="ml-auto flex gap-1.5" aria-hidden>
            <span className="size-2 rounded-full bg-white/70" />
            <span className="size-2 rounded-full bg-white/70" />
          </span>
        </div>
        <ul className="space-y-2 p-4">
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
