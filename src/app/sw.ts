import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  // The project tsconfig uses the "dom" lib only, so WorkerGlobalScope
  // is declared here instead of coming from lib.webworker.
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: WorkerGlobalScope;

/**
 * Service worker (Step 7, PWA) — built by @serwist/next from this file
 * (see next.config.ts: swSrc). The precache manifest (__SW_MANIFEST) is
 * injected at build time: app shell assets + the pages listed in
 * `additionalPrecacheEntries` (home, scan, history, offline per locale).
 *
 * Behaviour:
 * - App shell + static assets are precached, so the app opens offline.
 * - `defaultCache` (Serwist's Next.js preset): NetworkFirst for pages
 *   and RSC payloads (falls back to cache when offline), CacheFirst /
 *   StaleWhileRevalidate for static assets, NetworkOnly for /api/auth
 *   and NetworkFirst for other /api GETs. POST /api/extract is never
 *   cached — extraction always needs the network.
 * - When a navigation fails and nothing is cached for it, the matching
 *   locale's /offline page is served (fallbacks). The offline pages
 *   are precached, so this works on first install while online.
 * - History is IndexedDB-only, so once the shell is cached it works
 *   fully offline.
 */
const OFFLINE_PAGES = ["/en/offline", "/bn/offline", "/ja/offline"] as const;

function offlineUrlFor(request: Request): string {
  const pathname = new URL(request.url).pathname;
  // Locale is the first path segment; the bare root ("/") is English.
  const locale = pathname.split("/")[1] || "en";
  const match = OFFLINE_PAGES.find((page) => page.split("/")[1] === locale);
  return match ?? "/en/offline";
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: OFFLINE_PAGES.map((url) => ({
      url,
      matcher: ({ request }) =>
        request.mode === "navigate" && offlineUrlFor(request) === url,
    })),
  },
});

serwist.addEventListeners();
