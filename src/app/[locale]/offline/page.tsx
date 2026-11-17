import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { History, WifiOff } from "lucide-react";
import { OfflineActions } from "@/components/common/offline-actions";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "offline" });
  return pageMetadata({ locale, title: t("title"), description: t("body"), path: "/offline" });
}

/**
 * /offline (Step 7, PWA): friendly fallback page served by the service
 * worker when a navigation fails offline (see src/app/sw.ts). It is
 * precached per locale, so it renders with no connection. Scanning needs
 * the network, but saved history is IndexedDB-only and still works.
 */
export default async function OfflinePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("offline");

  return (
    <div className="mx-auto flex min-h-[60dvh] w-full max-w-xl flex-col items-center justify-center px-4 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
        <WifiOff className="h-8 w-8" aria-hidden />
      </div>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">{t("title")}</h1>
      <p className="mt-3 text-muted-foreground">{t("body")}</p>

      <div className="mt-8 w-full rounded-[16px] border bg-card p-4 text-left">
        <p className="font-semibold">{t("worksTitle")}</p>
        <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
          <History className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {t("worksHistory")}
        </p>
      </div>

      <OfflineActions />
    </div>
  );
}
