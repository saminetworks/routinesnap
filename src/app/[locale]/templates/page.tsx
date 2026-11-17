import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { categories, type CategoryLocale } from "@/config/categories";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "templates" });
  return pageMetadata({ locale, title: t("title"), description: t("subtitle"), path: "/templates" });
}

/** Templates hub (Step 6): one card per category, from categories.ts. */
export default async function TemplatesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("templates");
  const categoryLocale = (["en", "bn", "ja"].includes(locale) ? locale : "en") as CategoryLocale;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
      </header>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => (
          <Link
            key={category.slug}
            href={`/templates/${category.slug}`}
            className="group flex min-h-11 flex-col rounded-[16px] border border-border bg-card p-5 transition-all hover:-translate-y-1 hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          >
            <span className="text-3xl" aria-hidden>
              {category.emoji}
            </span>
            <h2 className="mt-3 text-lg font-bold group-hover:text-primary">
              {category.name[categoryLocale]}
            </h2>
            <p className="mt-1 flex-1 text-sm leading-relaxed text-muted-foreground">
              {category.description[categoryLocale]}
            </p>
            <span className="mt-4 text-sm font-medium text-primary">
              {t("scanCta")} →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
