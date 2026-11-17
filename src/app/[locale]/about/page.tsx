import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { siteConfig } from "@/config/site";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about" });
  return pageMetadata({ locale, title: t("title"), description: t("subtitle"), path: "/about" });
}

/**
 * About + contact (Step 6). Contact links are config-driven only:
 * no email address is invented — when siteConfig has no public
 * contact set, the page says so instead of showing a dead link.
 */
export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("about");
  const socials = [
    { key: "x", href: siteConfig.socials.x, label: "X" },
    { key: "facebook", href: siteConfig.socials.facebook, label: "Facebook" },
    { key: "instagram", href: siteConfig.socials.instagram, label: "Instagram" },
    { key: "youtube", href: siteConfig.socials.youtube, label: "YouTube" },
  ].filter((s) => s.href);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t("title")}</h1>
      <p className="mt-3 text-lg text-muted-foreground">{t("subtitle")}</p>

      <section aria-label={t("missionTitle")} className="mt-8">
        <h2 className="text-xl font-bold">{t("missionTitle")}</h2>
        <p className="mt-2 leading-relaxed text-muted-foreground">{t("missionBody")}</p>
        <p className="mt-4 rounded-[16px] border border-border bg-card p-4 text-sm italic">
          “{t("builtBy")}.”
        </p>
      </section>

      <section aria-label={t("contactTitle")} className="mt-8">
        <h2 className="text-xl font-bold">{t("contactTitle")}</h2>
        <p className="mt-2 leading-relaxed text-muted-foreground">{t("contactBody")}</p>
        {socials.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {socials.map((s) => (
              <li key={s.key}>
                <a
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center rounded-[10px] border border-border bg-card px-4 text-sm font-medium hover:border-primary/50"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{t("contactEmpty")}</p>
        )}
      </section>
    </div>
  );
}
