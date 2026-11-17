import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { pageMetadata } from "@/lib/seo";

/**
 * Shared plain-language legal page shell (Step 6).
 * Body copy lives in messages/{en,bn,ja}.json under the `privacy`
 * / `terms` namespaces as `sections: [{ heading, body }]`.
 */
export async function LegalPageContent({
  namespace,
}: {
  namespace: "privacy" | "terms";
}) {
  const t = await getTranslations(namespace);
  const sections = t.raw("sections") as { heading: string; body: string }[];
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t("title")}</h1>
      <p className="mt-3 text-lg text-muted-foreground">{t("intro")}</p>
      <div className="mt-8 space-y-8">
        {sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-xl font-bold">{section.heading}</h2>
            <p className="mt-2 leading-relaxed text-muted-foreground">{section.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}

export async function legalMetadata(
  locale: string,
  namespace: "privacy" | "terms",
): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace });
  return pageMetadata({
    locale,
    title: t("title"),
    description: t("intro"),
    path: `/${namespace}`,
  });
}
