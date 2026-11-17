"use client";

import { useTranslations } from "next-intl";
import { categories, type CategoryLocale, type CategorySlug } from "@/config/categories";
import type { CategoryInput } from "@/lib/ai/schema";
import { cn } from "@/lib/utils";

interface CategoryPickerProps {
  value: CategoryInput;
  onChange: (value: CategoryInput) => void;
  locale: CategoryLocale;
}

/** Segmented category selector; "Auto detect" is the default. */
export function CategoryPicker({ value, onChange, locale }: CategoryPickerProps) {
  const t = useTranslations("scan");
  const options: { value: CategoryInput; emoji: string; label: string }[] = [
    { value: "auto", emoji: "✨", label: t("autoDetect") },
    ...categories.map((c) => ({
      value: c.slug as CategorySlug,
      emoji: c.emoji,
      label: c.name[locale],
    })),
  ];

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{t("categoryLabel")}</legend>
      <div
        role="group"
        aria-label={t("categoryLabel")}
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
      >
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-[12px] border px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground",
              )}
            >
              <span aria-hidden>{option.emoji}</span>
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t("categoryHint")}</p>
    </fieldset>
  );
}
