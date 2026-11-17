"use client";

import { RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

/** Client-side actions on the offline page (Step 7). */
export function OfflineActions() {
  const t = useTranslations("offline");
  return (
    <div className="mt-8 flex flex-col gap-2 sm:flex-row">
      <Button onClick={() => window.location.reload()}>
        <RotateCw className="h-4 w-4" aria-hidden />
        {t("retry")}
      </Button>
      <Button variant="outline" asChild>
        <Link href="/history">{t("viewHistory")}</Link>
      </Button>
    </div>
  );
}
