import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/seo";

/** robots.txt (Step 8): allow all crawlers, point at the sitemap. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
