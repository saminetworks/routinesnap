import { ArrowDown } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { HeroMockup } from "./hero-mockup";
import { Reveal } from "./reveal";

/** Hero: badge, H1, subtext, two CTAs, animated photo-to-calendar mockup. */
export async function Hero() {
  const t = await getTranslations("home");
  const tCommon = await getTranslations("common");

  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="hero-glow pointer-events-none absolute inset-x-0 top-0 h-96"
      />
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0" />
      <div className="relative mx-auto flex max-w-6xl flex-col items-center px-4 pb-16 pt-16 text-center sm:pt-24">
        <Reveal>
          <p className="inline-flex min-h-8 items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            {t("badge")}
          </p>
        </Reveal>
        <Reveal delay={0.08}>
          <h1 className="hero-heading mt-6 max-w-4xl">
            {t("title")}
          </h1>
        </Reveal>
        <Reveal delay={0.16}>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            {t("subtitle")}
          </p>
        </Reveal>
        <Reveal delay={0.24}>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="min-h-11 w-full sm:w-auto">
              <Link href="/scan">{tCommon("scanNow")}</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="min-h-11 w-full sm:w-auto">
              <a href="#how-it-works">
                {tCommon("seeHowItWorks")}
                <ArrowDown className="size-4" aria-hidden />
              </a>
            </Button>
          </div>
        </Reveal>
        <Reveal delay={0.32} className="w-full">
          <HeroMockup />
        </Reveal>
      </div>
    </section>
  );
}
