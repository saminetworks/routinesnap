/**
 * RoutineSnap — single source of truth for the product name and site config.
 * The product name lives here on purpose: rename it once and it updates
 * everywhere (header, metadata, footer).
 */
export const siteConfig = {
  /** Product name (placeholder-friendly: change this one value to rename). */
  name: "RoutineSnap",
  tagline: "Snap your routine. Never miss a thing.",
  description:
    "Turn a photo or screenshot of any schedule into calendar events with reminders, in seconds. Free, privacy-first, and installable.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  locales: ["en", "bn", "ja"] as const,
  defaultLocale: "en",
  /** Free-tier daily scan limit (server-side, see DAILY_SCAN_LIMIT). */
  dailyScanLimit: Number(process.env.DAILY_SCAN_LIMIT ?? 5),
  madeWith: "Made with care in Bangladesh/Japan",
  socials: {
    x: "",
    facebook: "",
    instagram: "",
    youtube: "",
  },
  plausibleDomain: process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ?? "",
} as const;

export type SiteLocale = (typeof siteConfig.locales)[number];
