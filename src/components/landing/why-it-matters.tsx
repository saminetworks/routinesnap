import { getTranslations } from "next-intl/server";
import { Reveal } from "./reveal";

/** SEO text block: three short paragraphs with natural keywords. */
export async function WhyItMatters() {
  const t = await getTranslations("home.why");

  return (
    <section aria-labelledby="why-heading" className="mx-auto max-w-3xl px-4 py-16">
      <Reveal>
        <h2
          id="why-heading"
          className="text-2xl font-bold tracking-tight sm:text-3xl"
        >
          {t("title")}
        </h2>
        <div className="mt-5 space-y-4 leading-relaxed text-muted-foreground">
          <p>{t("p1")}</p>
          <p>{t("p2")}</p>
          <p>{t("p3")}</p>
        </div>
      </Reveal>
    </section>
  );
}
