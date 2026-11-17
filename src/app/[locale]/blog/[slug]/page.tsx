import type { Metadata } from "next";
import { MDXRemote } from "next-mdx-remote/rsc";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getAllPosts, getPost, readingMinutes } from "@/lib/blog";
import { JsonLd } from "@/components/common/json-ld";
import { breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

export async function generateStaticParams() {
  const posts = await getAllPosts();
  return posts.map((p) => ({ slug: p.slug }));
}

// All valid slugs are known at build time, so unknown slugs 404 at
// the router level (a dynamic render of notFound() here was cached
// with a 200 status — dynamicParams=false avoids that entirely).
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "Blog" };
  return pageMetadata({
    locale,
    title: post.title,
    description: post.excerpt,
    path: `/blog/${slug}`,
    type: "article",
    publishedTime: post.date,
  });
}

/**
 * One blog post (Step 6). MDX is rendered with next-mdx-remote/rsc.
 * Posts are written in English for now — the shell is translated,
 * the body is not faked into other languages.
 */
export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const post = await getPost(slug);
  if (!post) notFound();
  const t = await getTranslations("blog");
  const date = new Date(`${post.date}T00:00:00`).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <article className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <JsonLd
        data={breadcrumbJsonLd(locale, [
          { name: t("title"), path: "/blog" },
          { name: post.title, path: `/blog/${slug}` },
        ])}
      />
      <Link
        href="/blog"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t("backToBlog")}
      </Link>
      <header className="mt-4">
        <p className="font-mono text-xs text-muted-foreground">
          {date} · {t("minRead", { count: readingMinutes(post.content) })}
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{post.title}</h1>
        <p className="mt-3 text-lg text-muted-foreground">{post.excerpt}</p>
        <p className="mt-3 rounded-[10px] bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {t("englishNote")}
        </p>
      </header>
      <div className="mt-8 space-y-4 text-base leading-relaxed [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:tracking-tight [&_p]:text-muted-foreground [&_strong]:text-foreground">
        <MDXRemote source={post.content} />
      </div>
    </article>
  );
}
