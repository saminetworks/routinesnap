import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { categories, type CategoryLocale } from "@/config/categories";
import { Reveal } from "./reveal";

/**
 * Use-case chips: one clickable card per category, linking to
 * /templates/[slug], with the one-line description from the category
 * definitions (src/config/categories.ts).
 */
export async function UseCases({ locale }: { locale: CategoryLocale }) {
  const t = await getTranslations("home.useCases");

  return (
    <section aria-labelledby="use-cases-heading" className="mx-auto max-w-6xl px-4 py-16">
      <Reveal>
        <h2
          id="use-cases-heading"
          className="text-center text-2xl font-bold tracking-tight sm:text-3xl"
        >
          {t("title")}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
          {t("subtitle")}
        </p>
      </Reveal>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category, i) => (
          <Reveal key={category.slug} delay={(i % 3) * 0.08} className="h-full">
            <Link
              href={`/templates/${category.slug}`}
              className="group flex h-full min-h-11 flex-col rounded-2xl border border-border bg-card p-5 shadow-soft transition-all duration-200 hover:-translate-y-1 hover:border-primary/50 hover:shadow-soft focus-visible:outline-none"
            >
              <span aria-hidden className="text-3xl">
                {category.emoji}
              </span>
              <span className="mt-3 text-base font-semibold">
                {category.name[locale]}
              </span>
              <span className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">
                {category.description[locale]}
              </span>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                <ArrowRight
                  className="size-4 transition-transform group-hover:translate-x-1"
                  aria-hidden
                />
              </span>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
