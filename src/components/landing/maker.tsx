import { Quote } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { Reveal } from "./reveal";

/**
 * Founder / maker note: real founder photo, quote, name/role.
 * Social links are config-driven in siteConfig.socials — all are empty
 * for now, so no dead links are rendered here either (see SiteFooter).
 */
export async function Maker() {
  const t = await getTranslations("home.maker");

  return (
    <section aria-labelledby="maker-heading" className="mx-auto max-w-3xl px-4 pb-16">
      <Reveal>
        <article className="rounded-2xl border border-border bg-card p-6 shadow-soft sm:p-8">
          <h2
            id="maker-heading"
            className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            {t("title")}
          </h2>
          <Quote className="mt-5 size-6 text-primary" aria-hidden />
          <blockquote className="mt-3 text-lg leading-relaxed font-medium">
            {t("quote")}
          </blockquote>
          <footer className="mt-6 flex items-center gap-3">
            <Image
              src="/images/founder.jpg"
              alt={t("name")}
              width={44}
              height={44}
              className="size-11 shrink-0 rounded-full object-cover"
            />
            <span>
              <span className="block text-sm font-semibold">{t("name")}</span>
              <span className="block text-sm text-muted-foreground">
                {t("role")}
              </span>
            </span>
          </footer>
        </article>
      </Reveal>
    </section>
  );
}
