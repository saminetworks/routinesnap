"use client";

import { Bell } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/**
 * CSS phone mockup with a lock screen. Notification cards slide in one
 * after another and the sequence loops every 6 seconds (one card every
 * 2 s, then reset). With prefers-reduced-motion, all cards show static.
 */
export function NotificationPhone() {
  const t = useTranslations("home.how.notifications");
  const reduceMotion = useReducedMotion();
  const items = t.raw("items") as Array<{ title: string; body: string }>;
  const [visible, setVisible] = useState(reduceMotion ? items.length : 0);

  useEffect(() => {
    if (reduceMotion) {
      setVisible(items.length);
      return;
    }
    const id = setInterval(() => {
      setVisible((v) => (v + 1) % (items.length + 1));
    }, 2000);
    return () => clearInterval(id);
  }, [reduceMotion, items.length]);

  return (
    <div
      className="mx-auto w-full max-w-xs rounded-[2rem] border border-border bg-card p-3 shadow-soft"
      role="img"
      aria-label={t("lockDate")}
    >
      {/* Lock screen */}
      <div className="rounded-[1.6rem] bg-gradient-primary px-4 pb-4 pt-6 text-white">
        <p className="text-center text-xs font-medium opacity-90">
          {t("lockDate")}
        </p>
        <p className="text-center text-5xl font-extrabold tracking-tight">
          {t("lockTime")}
        </p>
        <div className="mt-5 min-h-56 space-y-2">
          <AnimatePresence>
            {items.slice(0, visible).map((item) => (
              <motion.div
                key={item.body}
                initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="flex items-start gap-3 rounded-2xl bg-white/95 p-3 text-gray-900 shadow-soft backdrop-blur"
              >
                <span
                  aria-hidden
                  className="bg-gradient-primary flex size-9 shrink-0 items-center justify-center rounded-[10px] text-sm font-extrabold text-white"
                >
                  R
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold">
                      {item.title}
                    </span>
                    <span className="shrink-0 text-xs text-gray-500">
                      {t("now")}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-sm leading-snug">
                    {item.body}
                  </span>
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs opacity-80">
          <Bell className="size-3.5" aria-hidden />
          RoutineSnap
        </p>
      </div>
    </div>
  );
}
