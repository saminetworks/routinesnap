import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { JsonLd } from "@/components/common/json-ld";
import {
  faqPageJsonLd,
  pageMetadata,
  softwareApplicationJsonLd,
  webSiteJsonLd,
} from "@/lib/seo";
import { Cta } from "@/components/landing/cta";
import { Faq } from "@/components/landing/faq";
import { Features } from "@/components/landing/features";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Maker } from "@/components/landing/maker";
import { Stats } from "@/components/landing/stats";
import { UseCases } from "@/components/landing/use-cases";
import { WhyItMatters } from "@/components/landing/why-it-matters";
import type { CategoryLocale } from "@/config/categories";

/**
 * Landing page (Step 2), in spec order:
 * Hero → use-case chips → features → how it works (+ notification
 * preview) → why it matters → stats → FAQ → maker note → final CTA.
 * The scanner itself is Step 3; /scan, /templates, /blog etc. are
 * not built yet, so their links point at future routes for now.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });
  return pageMetadata({
    locale,
    title: t("title"),
    description: t("subtitle"),
    path: "",
  });
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const categoryLocale = (["en", "bn", "ja"].includes(locale)
    ? locale
    : "en") as CategoryLocale;

  const tFaq = await getTranslations("home.faq");
  const faqItems = tFaq.raw("items") as Array<{ q: string; a: string }>;

  return (
    <>
      <JsonLd data={softwareApplicationJsonLd()} />
      <JsonLd data={webSiteJsonLd()} />
      <JsonLd data={faqPageJsonLd(faqItems)} />
      <Hero />
      <UseCases locale={categoryLocale} />
      <Features />
      <HowItWorks />
      <WhyItMatters />
      <Stats />
      <Faq />
      <Maker />
      <Cta />
    </>
  );
}
