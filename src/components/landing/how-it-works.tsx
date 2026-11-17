import { Bell } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { NotificationPhone } from "./notification-phone";
import { Reveal } from "./reveal";

/**
 * How it works: 4 numbered steps (vertical timeline on mobile, 4 columns
 * on desktop, mono step numbers in gradient circles) + notification
 * preview phone mockup beside it. Step 4 carries a pulsing bell dot and
 * a "Reminder set" toast chip.
 */
export async function HowItWorks() {
  const t = await getTranslations("home.how");
  const steps = t.raw("steps") as Array<{ title: string; description: string }>;

  return (
    <section
      id="how-it-works"
      aria-labelledby="how-heading"
      className="scroll-mt-20 border-y border-border bg-card/50"
    >
      <div className="mx-auto max-w-6xl px-4 py-16">
        <Reveal>
          <h2
            id="how-heading"
            className="text-center text-2xl font-bold tracking-tight sm:text-3xl"
          >
            {t("title")}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
            {t("subtitle")}
          </p>
        </Reveal>
        <div className="mt-10 grid items-start gap-10 lg:grid-cols-[1fr_320px]">
          <ol className="space-y-6 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
            {steps.map((step, i) => (
              <Reveal key={step.title} delay={i * 0.08}>
                <li className="relative flex gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
                  <span
                    aria-hidden
                    className="bg-gradient-primary flex size-10 shrink-0 items-center justify-center rounded-full font-mono text-sm font-bold text-white"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <span className="flex flex-wrap items-center gap-2 text-base font-semibold">
                      {step.title}
                      {i === 3 && (
                        <span className="relative flex size-3" aria-hidden>
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                          <span className="relative inline-flex size-3 rounded-full bg-success" />
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                      {step.description}
                    </span>
                    {i === 3 && (
                      <span className="mt-3 inline-flex min-h-8 items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-3 py-1 text-xs font-medium text-success">
                        <Bell className="size-3.5" aria-hidden />
                        {t("reminderChip")}
                      </span>
                    )}
                  </span>
                </li>
              </Reveal>
            ))}
          </ol>
          <Reveal delay={0.16}>
            <NotificationPhone />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
