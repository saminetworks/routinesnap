import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getAllPosts } from "@/lib/blog";
import { pageMetadata } from "@/lib/seo";

/**
 * Blog list (Step 6). The list shell is translated; the posts
 * themselves are written in English for now (see the note on the
 * page) — translations are not faked.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "blog" });
  return pageMetadata({ locale, title: t("title"), description: t("subtitle"), path: "/blog" });
}

export default async function BlogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("blog");
  const posts = await getAllPosts();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
        <p className="mt-3 rounded-[10px] bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {t("englishNote")}
        </p>
      </header>

      <ul className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => {
          const date = new Date(`${post.date}T00:00:00`).toLocaleDateString(locale, {
            year: "numeric",
            month: "long",
            day: "numeric",
          });
          return (
            <li key={post.slug}>
              <Link
                href={`/blog/${post.slug}`}
                className="group flex h-full min-h-11 flex-col rounded-[16px] border border-border bg-card p-5 transition-all hover:-translate-y-1 hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              >
                <p className="font-mono text-xs text-muted-foreground">
                  {date} · {t("minRead", { count: post.minutes })}
                </p>
                <h2 className="mt-2 text-lg font-bold leading-snug group-hover:text-primary">
                  {post.title}
                </h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {post.excerpt}
                </p>
                <span className="mt-4 text-sm font-medium text-primary">{t("readMore")} →</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
