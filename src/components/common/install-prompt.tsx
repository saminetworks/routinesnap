"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Download, Share, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/**
 * Install prompt (Step 7, PWA).
 *
 * - Android/desktop Chrome: listens for `beforeinstallprompt` and shows a
 *   custom banner with an Install button. The event only fires when the
 *   app is installable (manifest + service worker + HTTPS/localhost).
 * - iOS Safari: no `beforeinstallprompt` exists, so an iOS device gets a
 *   short "Share → Add to Home Screen" instructions banner instead.
 * - Dismissing remembers the choice for 14 days (localStorage). A
 *   successful install hides the banner for good. Nothing shows when
 *   the app already runs standalone.
 */
const DISMISSED_KEY = "routinesnap:pwa-dismissed-at";
const INSTALLED_KEY = "routinesnap:pwa-installed";
const REMIND_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
}

function dismissedRecently(): boolean {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    if (!raw) return false;
    return Date.now() - new Date(raw).getTime() < REMIND_AFTER_MS;
  } catch {
    return false;
  }
}

type BannerKind = "install" | "ios";

export function InstallPrompt() {
  const t = useTranslations("pwa");
  const tCommon = useTranslations("common");
  const reduceMotion = useReducedMotion();
  const [kind, setKind] = useState<BannerKind | null>(null);
  const [promptEvent, setPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(INSTALLED_KEY) === "1") return;
    } catch {
      // Private mode etc. — fall through and show the banner.
    }
    if (isStandalone() || dismissedRecently()) return;

    if (isIosDevice()) {
      setKind("ios");
      return;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
      setKind("install");
    };
    const onAppInstalled = () => {
      try {
        window.localStorage.setItem(INSTALLED_KEY, "1");
      } catch {
        // Ignore storage failures.
      }
      setKind(null);
      setPromptEvent(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, new Date().toISOString());
    } catch {
      // Ignore storage failures.
    }
    setKind(null);
  };

  const install = async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") {
      try {
        window.localStorage.setItem(INSTALLED_KEY, "1");
      } catch {
        // Ignore storage failures.
      }
    }
    setKind(null);
    setPromptEvent(null);
  };

  return (
    <AnimatePresence>
      {kind && (
        <motion.aside
          key={kind}
          role="dialog"
          aria-label={t("installTitle")}
          initial={reduceMotion ? false : { y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { y: 24, opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="fixed inset-x-4 bottom-4 z-50 mx-auto w-full max-w-md rounded-[16px] border bg-card p-4 shadow-xl"
        >
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny local icon, no optimisation needed */}
            <img
              src="/icons/icon-192.png"
              alt=""
              width={48}
              height={48}
              className="h-12 w-12 shrink-0 rounded-[12px]"
            />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{t("installTitle")}</p>
              {kind === "install" ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("installText")}
                </p>
              ) : (
                <ol className="mt-1 space-y-1 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                      1
                    </span>
                    {t("iosStep1")}
                    <Share className="h-4 w-4 shrink-0" aria-hidden />
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                      2
                    </span>
                    {t("iosStep2")}
                  </li>
                </ol>
              )}
              {kind === "ios" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("iosNote")}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label={tCommon("close")}
              className="rounded-[10px] p-2 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          {kind === "install" && (
            <div className="mt-3 flex gap-2">
              <Button onClick={install} className="flex-1">
                <Download className="h-4 w-4" aria-hidden />
                {t("installButton")}
              </Button>
              <Button variant="ghost" onClick={dismiss}>
                {t("dismiss")}
              </Button>
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
