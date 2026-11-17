import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Reveal } from "./reveal";

/** Final CTA band with gradient background. */
export async function Cta() {
  const t = await getTranslations("home.cta");
  const tCommon = await getTranslations("common");

  return (
    <section aria-labelledby="cta-heading" className="mx-auto max-w-6xl px-4 pb-16">
      <Reveal>
        <div className="bg-gradient-primary rounded-2xl px-6 py-12 text-center text-white sm:py-16">
          <h2
            id="cta-heading"
            className="text-2xl font-bold tracking-tight sm:text-3xl"
          >
            {t("title")}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-white/90">
            {t("subtitle")}
          </p>
          <Button
            asChild
            size="lg"
            variant="secondary"
            className="mt-8 min-h-11 bg-white text-gray-900 hover:bg-white/90"
          >
            <Link href="/scan">{tCommon("scanNow")}</Link>
          </Button>
        </div>
      </Reveal>
    </section>
  );
}
