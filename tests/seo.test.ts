import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import {
  breadcrumbJsonLd,
  faqPageJsonLd,
  getSiteUrl,
  localizedUrl,
  pageMetadata,
  softwareApplicationJsonLd,
  webSiteJsonLd,
} from "@/lib/seo";

describe("getSiteUrl / localizedUrl", () => {
  it("defaults to localhost and strips a trailing slash", () => {
    expect(getSiteUrl()).toMatch(/^https?:\/\/[^/]+$/);
  });

  it("builds locale-prefixed absolute URLs", () => {
    expect(localizedUrl("bn", "/scan")).toBe(`${getSiteUrl()}/bn/scan`);
    expect(localizedUrl("en", "")).toBe(`${getSiteUrl()}/en`);
    expect(localizedUrl("ja", "/templates/class-routine")).toBe(
      `${getSiteUrl()}/ja/templates/class-routine`,
    );
  });
});

describe("pageMetadata", () => {
  const meta = pageMetadata({
    locale: "bn",
    title: "Scan a routine",
    description: "Upload a photo.",
    path: "/scan",
  });

  it("sets a canonical URL and hreflang alternates for en/bn/ja + x-default", () => {
    expect(meta.alternates?.canonical).toBe(`${getSiteUrl()}/bn/scan`);
    const languages = meta.alternates?.languages as Record<string, string>;
    expect(languages.en).toBe(`${getSiteUrl()}/en/scan`);
    expect(languages.bn).toBe(`${getSiteUrl()}/bn/scan`);
    expect(languages.ja).toBe(`${getSiteUrl()}/ja/scan`);
    expect(languages["x-default"]).toBe(`${getSiteUrl()}/en/scan`);
  });

  it("sets OpenGraph and Twitter cards with the 1200x630 OG image", () => {
    const og = meta.openGraph;
    expect(og?.url).toBe(`${getSiteUrl()}/bn/scan`);
    expect(og?.locale).toBe("bn_BD");
    expect(og?.images).toEqual([
      {
        url: `${getSiteUrl()}/og/og.png`,
        width: 1200,
        height: 630,
        alt: expect.stringContaining("RoutineSnap"),
      },
    ]);
    expect(meta.twitter?.card).toBe("summary_large_image");
  });
});

describe("JSON-LD builders", () => {
  it("SoftwareApplication is free and lists all three languages", () => {
    const data = softwareApplicationJsonLd();
    expect(data["@type"]).toBe("SoftwareApplication");
    expect(data.offers.price).toBe("0");
    expect(data.isAccessibleForFree).toBe(true);
    expect(data.inLanguage).toEqual(["en", "bn", "ja"]);
  });

  it("FAQPage mirrors the visible FAQ questions and answers", () => {
    const data = faqPageJsonLd([
      { q: "Is it free?", a: "Yes, up to 5 scans a day." },
      { q: "Is my photo stored?", a: "No, it is discarded." },
    ]);
    expect(data["@type"]).toBe("FAQPage");
    expect(data.mainEntity).toHaveLength(2);
    expect(data.mainEntity[0].name).toBe("Is it free?");
    expect(data.mainEntity[0].acceptedAnswer.text).toContain("5 scans");
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });

  it("BreadcrumbList is ordered and uses absolute URLs", () => {
    const data = breadcrumbJsonLd("ja", [
      { name: "Templates", path: "/templates" },
      { name: "Class routine", path: "/templates/class-routine" },
    ]);
    expect(data.itemListElement[1].position).toBe(2);
    expect(data.itemListElement[1].item).toBe(
      `${getSiteUrl()}/ja/templates/class-routine`,
    );
  });

  it("WebSite JSON-LD points at the site URL", () => {
    expect(webSiteJsonLd().url).toBe(getSiteUrl());
  });
});

describe("sitemap", () => {
  it("lists every route in en/bn/ja, including templates and blog posts", async () => {
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    // 3 locales x (15 static paths + 3 blog posts) = 54
    expect(entries).toHaveLength(54);
    for (const locale of ["en", "bn", "ja"]) {
      expect(urls).toContain(`${getSiteUrl()}/${locale}`);
      expect(urls).toContain(`${getSiteUrl()}/${locale}/scan`);
      expect(urls).toContain(`${getSiteUrl()}/${locale}/templates/class-routine`);
      expect(urls).toContain(`${getSiteUrl()}/${locale}/templates/medicine-schedule`);
      expect(urls).toContain(`${getSiteUrl()}/${locale}/blog/photo-to-calendar-privately`);
      expect(urls).toContain(`${getSiteUrl()}/${locale}/privacy`);
      expect(urls).toContain(`${getSiteUrl()}/${locale}/offline`);
    }
    for (const entry of entries) {
      expect(entry.lastModified).toBeDefined();
    }
  });
});

describe("robots", () => {
  it("allows all crawlers and points at the sitemap", () => {
    const r = robots();
    expect(r.rules).toEqual({ userAgent: "*", allow: "/" });
    expect(r.sitemap).toBe(`${getSiteUrl()}/sitemap.xml`);
  });
});
