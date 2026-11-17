import { getTranslations } from "next-intl/server";
import { Reveal } from "./reveal";

/**
 * Stats strip.
 * NOTE: these are placeholder numbers, clearly marked as examples —
 * replace with real metrics once the product has usage data.
 */
export async function Stats() {
  const t = await getTranslations("home.stats");
  // Placeholder numbers (examples only, not real metrics).
  const items = t.raw("items") as Array<{ value: string; label: string }>;

  return (
    <section aria-label="RoutineSnap in numbers" className="mx-auto max-w-6xl px-4 pb-16">
      <Reveal>
        <dl className="grid grid-cols-3 gap-4 rounded-2xl border border-border bg-card px-4 py-8 text-center shadow-soft sm:gap-8">
          {items.map((item) => (
            <div key={item.label} className="flex flex-col">
              <dt className="order-2 mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground sm:text-sm">
                {item.label}
              </dt>
              <dd className="text-gradient-primary order-1 text-3xl font-extrabold tracking-tight sm:text-5xl">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </Reveal>
    </section>
  );
}
