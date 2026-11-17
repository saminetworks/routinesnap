import { setRequestLocale } from "next-intl/server";
import { LegalPageContent, legalMetadata } from "@/components/legal/legal-page";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return legalMetadata(locale, "terms");
}

/** Terms of use (Step 6): plain language. */
export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalPageContent namespace="terms" />;
}
