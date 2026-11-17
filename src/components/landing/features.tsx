import { ImageIcon, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Reveal } from "./reveal";

/** Three feature cards. Icons are fixed; titles/descriptions are i18n. */
export async function Features() {
  const t = await getTranslations("home.features");
  const icons = [ImageIcon, ShieldCheck, SlidersHorizontal];
  const items = t.raw("items") as Array<{ title: string; description: string }>;

  return (
    <section aria-labelledby="features-heading" className="mx-auto max-w-6xl px-4 py-16">
      <Reveal>
        <h2
          id="features-heading"
          className="text-center text-2xl font-bold tracking-tight sm:text-3xl"
        >
          {t("title")}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
          {t("subtitle")}
        </p>
      </Reveal>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {items.map((item, i) => {
          const Icon = icons[i] ?? ImageIcon;
          return (
            <Reveal key={item.title} delay={i * 0.08} className="h-full">
              <article className="flex h-full flex-col rounded-2xl border border-border bg-card p-6 shadow-soft transition-all duration-200 hover:-translate-y-1 hover:border-primary/50">
                <span className="bg-gradient-primary flex size-11 items-center justify-center rounded-[12px] text-white">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </article>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
