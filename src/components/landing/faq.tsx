"use client";

import { useTranslations } from "next-intl";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

/** FAQ accordion (shadcn/Radix), 10 questions, single-open. */
export function Faq() {
  const t = useTranslations("home.faq");
  const items = t.raw("items") as Array<{ q: string; a: string }>;

  return (
    <section aria-labelledby="faq-heading" className="mx-auto max-w-3xl px-4 py-16">
      <h2
        id="faq-heading"
        className="text-center text-2xl font-bold tracking-tight sm:text-3xl"
      >
        {t("title")}
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
        {t("subtitle")}
      </p>
      <Accordion type="single" collapsible className="mt-8">
        {items.map((item, i) => (
          <AccordionItem key={item.q} value={`faq-${i}`}>
            <AccordionTrigger>{item.q}</AccordionTrigger>
            <AccordionContent>{item.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
