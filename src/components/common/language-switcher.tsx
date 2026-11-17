"use client";

import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

/** Language switcher — keeps the current page, swaps the locale prefix. */
export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("language");
  const router = useRouter();
  const pathname = usePathname();

  const labelFor = (value: Locale) =>
    value === "en" ? t("english") : value === "bn" ? t("bangla") : t("japanese");

  return (
    <label className="flex items-center gap-1.5">
      <Languages
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <span className="sr-only">{t("label")}</span>
      <select
        aria-label={t("label")}
        value={locale}
        onChange={(event) =>
          router.replace(pathname, {
            locale: event.target.value as Locale,
          })
        }
        className="h-10 cursor-pointer rounded-[10px] border border-border bg-card px-2 text-sm text-foreground"
      >
        {routing.locales.map((value) => (
          <option key={value} value={value}>
            {labelFor(value)}
          </option>
        ))}
      </select>
    </label>
  );
}
