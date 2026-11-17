import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, Check, ScanLine } from "lucide-react";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { ExamplePhotoMock } from "@/components/templates/example-photo-mock";
import { Button } from "@/components/ui/button";
import { categories, getCategory, type CategoryLocale } from "@/config/categories";
import { JsonLd } from "@/components/common/json-ld";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

export function generateStaticParams() {
  return categories.map((c) => ({ slug: c.slug }));
}

// All valid slugs are known at build time, so unknown slugs 404 at
// the router level (a dynamic render of notFound() here was cached
// with a 200 status — dynamicParams=false avoids that entirely).
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const category = getCategory(slug);
  if (!category) return { title: "Template" };
  const categoryLocale = (["en", "bn", "ja"].includes(locale) ? locale : "en") as CategoryLocale;
  return pageMetadata({
    locale,
    title: category.name[categoryLocale],
    description: category.description[categoryLocale],
    path: `/templates/${slug}`,
  });
}

/**
 * One template page per category (Step 6): name/description in the
 * current locale, example hints, tips, special rules from
 * categories.ts, a CSS-built example photo, and a CTA to
 * /scan?category=slug. Unknown slug → not-found page.
 */
export default async function TemplatePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const category = getCategory(slug);
  if (!category) notFound();
  const t = await getTranslations("templates");
  const categoryLocale = (["en", "bn", "ja"].includes(locale) ? locale : "en") as CategoryLocale;
  const recurrenceLabel =
    category.defaultRecurrence === "weekly"
      ? t("recurrenceWeekly")
      : category.defaultRecurrence === "daily"
        ? t("recurrenceDaily")
        : t("recurrenceOneOff");

  const tTemplates = await getTranslations("templates");
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <JsonLd
        data={breadcrumbJsonLd(locale, [
          { name: tTemplates("title"), path: "/templates" },
          { name: category.name[categoryLocale], path: `/templates/${slug}` },
        ])}
      />
      <Link
        href="/templates"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("backToTemplates")}
      </Link>

      <header className="mt-4 max-w-2xl">
        <p className="text-4xl" aria-hidden>
          {category.emoji}
        </p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
          {category.name[categoryLocale]}
        </h1>
        <p className="mt-2 text-muted-foreground">{category.description[categoryLocale]}</p>
        <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-sm font-medium">
          {t("recurrenceLabel")}: {recurrenceLabel}
        </p>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:items-start">
        <section aria-label={t("exampleTitle")}>
          <h2 className="text-lg font-bold">{t("exampleTitle")}</h2>
          <div className="mt-3">
            <ExamplePhotoMock slug={category.slug} locale={categoryLocale} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{t("exampleCaption")}</p>
        </section>

        <div className="space-y-8">
          <section aria-label={t("tipsTitle")}>
            <h2 className="text-lg font-bold">{t("tipsTitle")}</h2>
            <ul className="mt-3 space-y-2">
              {category.rules[categoryLocale].map((rule) => (
                <li key={rule} className="flex items-start gap-2 text-sm leading-relaxed">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  {rule}
                </li>
              ))}
            </ul>
          </section>

          <section aria-label={t("categoryHintsTitle")}>
            <h2 className="text-lg font-bold">{t("categoryHintsTitle")}</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {category.hints[categoryLocale].map((hint) => (
                <li
                  key={hint}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-sm"
                >
                  {hint}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {category.specialRules}
            </p>
          </section>

          <section aria-label={t("howTitle")} className="rounded-[16px] border border-border bg-card p-5">
            <h2 className="text-lg font-bold">{t("howTitle")}</h2>
            <ol className="mt-3 space-y-2">
              {(t.raw("howSteps") as string[]).map((step, i) => (
                <li key={step} className="flex items-start gap-3 text-sm leading-relaxed">
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gradient-primary font-mono text-xs text-white"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            <Button asChild size="lg" className="mt-5 w-full sm:w-auto">
              <Link href={`/scan?category=${category.slug}`}>
                <ScanLine aria-hidden />
                {t("scanCta")}
              </Link>
            </Button>
          </section>
        </div>
      </div>
    </div>
  );
}
