import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { siteConfig } from "@/config/site";
import { Logo } from "./logo";

/**
 * Rich footer: Brand + blurb + socials | Product | Resources | Languages.
 * Social icons are config-driven — only links present in siteConfig.socials
 * are rendered (all are empty for now, so no dead links are shown).
 */
export async function SiteFooter() {
  const t = await getTranslations("footer");
  const tNav = await getTranslations("nav");
  const year = new Date().getFullYear();

  // lucide-react no longer ships brand icons, so socials use a simple
  // glyph tile. Only links present in siteConfig.socials are rendered.
  const socials = [
    { key: "x", href: siteConfig.socials.x, label: "X", glyph: "𝕏" },
    { key: "facebook", href: siteConfig.socials.facebook, label: "Facebook", glyph: "f" },
    { key: "instagram", href: siteConfig.socials.instagram, label: "Instagram", glyph: "◎" },
    { key: "youtube", href: siteConfig.socials.youtube, label: "YouTube", glyph: "▶" },
  ].filter((s) => s.href);

  const productLinks = [
    { href: "/scan", label: tNav("scan") },
    { href: "/templates", label: tNav("templates") },
    { href: "/history", label: tNav("history") },
  ];
  const resourceLinks = [
    { href: "/blog", label: tNav("blog") },
    { href: "/privacy", label: t("privacy") },
    { href: "/terms", label: t("terms") },
  ];
  const languageLinks = [
    { href: "/en", label: "English" },
    { href: "/bn", label: "বাংলা" },
    { href: "/ja", label: "日本語" },
  ];

  return (
    <footer className="border-t border-border bg-card/50">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
            {t("brandBlurb")}
          </p>
          {socials.length > 0 && (
            <div className="mt-4 flex gap-2">
              {socials.map(({ key, href, label, glyph }) => (
                <a
                  key={key}
                  href={href}
                  aria-label={label}
                  target="_blank"
                  rel="noreferrer"
                  className="flex size-11 items-center justify-center rounded-[10px] border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  <span aria-hidden className="text-lg font-bold leading-none">
                    {glyph}
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
        <nav aria-label={t("product")}>
          <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("product")}
          </h2>
          <ul className="mt-4 space-y-1">
            {productLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex min-h-11 items-center rounded-[10px] px-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label={t("resources")}>
          <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("resources")}
          </h2>
          <ul className="mt-4 space-y-1">
            {resourceLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex min-h-11 items-center rounded-[10px] px-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label={t("languages")}>
          <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("languages")}
          </h2>
          <ul className="mt-4 space-y-1">
            {languageLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="inline-flex min-h-11 items-center rounded-[10px] px-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-sm text-muted-foreground sm:flex-row">
          <p>{t("copyright", { year })}</p>
          <p>{t("madeWith")}</p>
        </div>
      </div>
    </footer>
  );
}
