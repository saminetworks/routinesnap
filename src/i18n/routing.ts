import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "bn", "ja"],
  defaultLocale: "en",
  // Every page lives under a locale prefix: /en/…, /bn/…, /ja/…
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];
