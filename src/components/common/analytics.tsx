import Script from "next/script";
import { siteConfig } from "@/config/site";

/**
 * Plausible-compatible analytics (Step 8).
 *
 * Optional via env only: set NEXT_PUBLIC_PLAUSIBLE_DOMAIN to enable.
 * When it is unset this renders nothing — no script is loaded, no
 * request is made, no cookies are set. No other tracker is loaded
 * anywhere in the app.
 */
export function Analytics() {
  const domain = siteConfig.plausibleDomain;
  if (!domain) return null;
  return (
    <Script
      defer
      data-domain={domain}
      src="https://plausible.io/js/script.js"
    />
  );
}
