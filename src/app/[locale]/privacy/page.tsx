import { setRequestLocale } from "next-intl/server";
import { LegalPageContent, legalMetadata } from "@/components/legal/legal-page";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return legalMetadata(locale, "privacy");
}

/** Privacy policy (Step 6): plain language, no server-side storage. */
export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalPageContent namespace="privacy" />;
}
