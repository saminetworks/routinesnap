import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import type { NextConfig } from "next";
import withSerwist from "@serwist/next";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl v4: the plugin wires src/i18n/request.ts into the build.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * PWA (Step 7): @serwist/next builds the service worker from
 * src/app/sw.ts and writes it to public/sw.js (gitignored — generated).
 * The worker is disabled in development (service workers are a
 * production concern, and Serwist does not support Turbopack in dev).
 *
 * `additionalPrecacheEntries` caches the app shell pages so the app
 * opens offline: home, scan and history per locale, plus the offline
 * fallback pages (see src/app/sw.ts). The revision is a hash of the
 * offline page source + that locale's messages, so the worker refetches
 * a page when its content changes.
 */
const offlinePageSource = readFileSync(
  "src/app/[locale]/offline/page.tsx",
  "utf8",
);
const revisionFor = (locale: string) =>
  createHash("sha256")
    .update(offlinePageSource)
    .update(readFileSync(`messages/${locale}.json`, "utf8"))
    .digest("hex")
    .slice(0, 12);

/** Recursively lists files under public/ (relative paths, e.g. icons/icon-192.png). */
function publicFiles(dir: string, base = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return publicFiles(`${dir}/${entry.name}`, rel);
    return [rel];
  });
}

const withPwa = withSerwist({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // NOTE: passing additionalPrecacheEntries replaces @serwist/next's
  // default public-dir glob, so the public files are globbed here too
  // (icons, etc.) — otherwise only the shell pages would be precached.
  additionalPrecacheEntries: [
    ...publicFiles("public")
      .filter(
        (file) =>
          file !== "sw.js" &&
          file !== "sw.js.map" &&
          !file.startsWith("swe-worker-") &&
          statSync(`public/${file}`).isFile(),
      )
      .map((file) => ({
      url: `/${file}`,
      revision: createHash("sha256")
        .update(readFileSync(`public/${file}`))
        .digest("hex")
        .slice(0, 12),
    })),
    ...["en", "bn", "ja"].flatMap((locale) =>
      ["", "/scan", "/history", "/offline"].map((page) => ({
        url: `/${locale}${page}`,
        revision: revisionFor(locale),
      })),
    ),
  ],
});

/**
 * Security headers (Step 8, spec §11).
 *
 * CSP trade-off, stated plainly: `script-src` / `style-src` include
 * 'unsafe-inline' because Next.js itself (inline bootstrap scripts,
 * next-themes, RSC payloads) requires it without a nonce setup; a
 * nonce-based CSP is out of scope for v1. Everything else is locked
 * down: no plugins, no frames, no microphone/geolocation, camera only
 * on this origin (the scan page uses the camera via <input capture>).
 * `connect-src` / `script-src` gain https://plausible.io only when
 * NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set (see Analytics); with it unset
 * no third-party host is allowed at all.
 * `img-src` allows data:/blob: because scan previews are blob URLs
 * and HEIC conversion can produce data URLs.
 * HSTS is sent on every response; browsers ignore it over plain
 * http (e.g. localhost), and it takes effect once deployed on https.
 */
const plausibleEnabled = Boolean(process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN);
const plausibleHosts = plausibleEnabled ? " https://plausible.io" : "";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${plausibleHosts}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${plausibleHosts}`,
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
  },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withPwa(withNextIntl(nextConfig));
