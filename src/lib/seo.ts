import type { Metadata } from "next";
import { siteConfig } from "@/config/site";

/**
 * SEO helpers (Step 8).
 *
 * Single place for the canonical site URL, hreflang alternates and the
 * OpenGraph/Twitter defaults, so every page's `generateMetadata` builds
 * the same shape. All URLs are absolute, from NEXT_PUBLIC_SITE_URL
 * (default http://localhost:3000 in .env.example).
 */

export const LOCALES = ["en", "bn", "ja"] as const;
export type SeoLocale = (typeof LOCALES)[number];

const OG_LOCALE: Record<SeoLocale, string> = {
  en: "en_US",
  bn: "bn_BD",
  ja: "ja_JP",
};

export function getSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ?? siteConfig.url ?? "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

/** Absolute URL for a locale-prefixed path, e.g. localizedUrl("bn", "/scan"). */
export function localizedUrl(locale: string, path = ""): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${getSiteUrl()}/${locale}${clean === "/" ? "" : clean}`;
}

export interface PageMetadataOptions {
  locale: string;
  /** Page title (the layout's title template appends " | RoutineSnap"). */
  title: string;
  description: string;
  /** Locale-prefixed path without the locale, e.g. "/scan" or "" for home. */
  path?: string;
  /** "website" for pages, "article" for blog posts. */
  type?: "website" | "article";
  /** Absolute image URL; defaults to the OpenGraph image. */
  image?: string;
  /** Article publish date (ISO), for blog posts. */
  publishedTime?: string;
}

export function pageMetadata({
  locale,
  title,
  description,
  path = "",
  type = "website",
  image,
  publishedTime,
}: PageMetadataOptions): Metadata {
  const loc = (LOCALES.includes(locale as SeoLocale) ? locale : "en") as SeoLocale;
  const canonical = localizedUrl(loc, path);
  const ogImage = image ?? `${getSiteUrl()}/og/og.png`;
  return {
    title,
    description,
    alternates: {
      canonical,
      languages: {
        en: localizedUrl("en", path),
        bn: localizedUrl("bn", path),
        ja: localizedUrl("ja", path),
        "x-default": localizedUrl("en", path),
      },
    },
    openGraph: {
      title: `${title} | ${siteConfig.name}`,
      description,
      url: canonical,
      siteName: siteConfig.name,
      locale: OG_LOCALE[loc],
      alternateLocale: LOCALES.filter((l) => l !== loc).map((l) => OG_LOCALE[l]),
      type,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `${siteConfig.name} — ${siteConfig.tagline}`,
        },
      ],
      ...(publishedTime ? { publishedTime } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${siteConfig.name}`,
      description,
      images: [ogImage],
    },
  };
}

/* ------------------------------------------------------------------ */
/* JSON-LD builders. Pure data — the JsonLd component renders them.   */
/* ------------------------------------------------------------------ */

export function softwareApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: siteConfig.name,
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web, iOS, Android",
    description: siteConfig.description,
    url: getSiteUrl(),
    inLanguage: ["en", "bn", "ja"],
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    isAccessibleForFree: true,
  };
}

export function webSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    url: getSiteUrl(),
    inLanguage: ["en", "bn", "ja"],
  };
}

export function faqPageJsonLd(
  items: Array<{ q: string; a: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

export function breadcrumbJsonLd(
  locale: string,
  crumbs: Array<{ name: string; path: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: localizedUrl(locale, crumb.path),
    })),
  };
}
