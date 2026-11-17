import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageMetadata } from "@/lib/seo";
import { Suspense } from "react";
import { ScanPage } from "@/components/scan/scan-page";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "scan" });
  return pageMetadata({ locale, title: t("title"), description: t("subtitle"), path: "/scan" });
}

/**
 * /scan (Step 3): upload → mock extract → confirm/edit → export.
 * The real /api/extract (Step 5) and ICS export (Step 4) are not
 * built yet; this page calls the mock extractor directly.
 */
export default async function ScanRoute({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense>
      <ScanPage />
    </Suspense>
  );
}
