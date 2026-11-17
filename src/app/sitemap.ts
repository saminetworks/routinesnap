import type { MetadataRoute } from "next";
import { categories } from "@/config/categories";
import { getAllPosts } from "@/lib/blog";
import { getSiteUrl, LOCALES } from "@/lib/seo";

/**
 * Sitemap (Step 8): every public route in every locale — home, scan,
 * templates + 6 category slugs, history, blog + posts, privacy, terms,
 * about, offline. Blog posts use their frontmatter date; other pages
 * use the build date.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const now = new Date();
  const posts = await getAllPosts();

  const staticPaths = [
    "",
    "/scan",
    "/templates",
    ...categories.map((c) => `/templates/${c.slug}`),
    "/history",
    "/blog",
    "/privacy",
    "/terms",
    "/about",
    "/offline",
  ];

  const entries: MetadataRoute.Sitemap = [];
  for (const locale of LOCALES) {
    for (const path of staticPaths) {
      entries.push({
        url: `${base}/${locale}${path}`,
        lastModified: now,
        changeFrequency: path === "" ? "weekly" : "monthly",
        priority: path === "" ? 1 : path === "/scan" ? 0.9 : 0.7,
      });
    }
    for (const post of posts) {
      entries.push({
        url: `${base}/${locale}/blog/${post.slug}`,
        lastModified: new Date(`${post.date}T00:00:00`),
        changeFrequency: "monthly",
        priority: 0.6,
      });
    }
  }
  return entries;
}
