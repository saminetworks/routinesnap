import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

/**
 * Simple MDX blog library (Step 6).
 *
 * Posts live in `content/blog/*.mdx` with frontmatter:
 *   ---
 *   title: "..."
 *   date: "2026-11-16"   (ISO yyyy-mm-dd)
 *   excerpt: "..."
 *   ---
 * Posts are written in English for now (see the note on the blog
 * pages) — the list and post shells are translated, the post bodies
 * are not faked into other languages.
 *
 * Frontmatter is parsed with a tiny hand-rolled parser instead of a
 * dependency: the format is fixed (three string fields), so a full
 * YAML parser would be overkill. MDX rendering itself uses
 * `next-mdx-remote/rsc` in the post page.
 */

export interface BlogPostMeta {
  slug: string;
  title: string;
  date: string; // yyyy-mm-dd
  excerpt: string;
  /** Reading time in minutes, computed from the post body. */
  minutes: number;
}

export interface BlogPost extends BlogPostMeta {
  /** Raw MDX source (frontmatter stripped). */
  content: string;
}

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

/** Parse the `---` frontmatter block; returns meta + body. */
export function parseFrontmatter(source: string): {
  meta: Record<string, string>;
  content: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(source);
  if (!match) return { meta: {}, content: source };
  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line
      .slice(colon + 1)
      .trim()
      .replace(/^"(.*)"$/, "$1")
      .replace(/^'(.*)'$/, "$1");
    if (key) meta[key] = value;
  }
  return { meta, content: match[2] };
}

/** Rough reading time in minutes (200 words/minute, minimum 1). */
export function readingMinutes(content: string): number {
  const words = content.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function metaFromFile(slug: string, source: string): BlogPostMeta {
  const { meta, content } = parseFrontmatter(source);
  if (!meta.title || !meta.date || !meta.excerpt) {
    throw new Error(
      `content/blog/${slug}.mdx is missing frontmatter (title, date, excerpt are required)`,
    );
  }
  return { slug, title: meta.title, date: meta.date, excerpt: meta.excerpt, minutes: readingMinutes(content) };
}

/** All post metadata, newest first. */
export async function getAllPosts(): Promise<BlogPostMeta[]> {
  const files = (await readdir(BLOG_DIR)).filter((f) => f.endsWith(".mdx")).sort();
  const posts: BlogPostMeta[] = [];
  for (const file of files) {
    const source = await readFile(path.join(BLOG_DIR, file), "utf-8");
    posts.push(metaFromFile(file.replace(/\.mdx$/, ""), source));
  }
  return posts.sort((a, b) => b.date.localeCompare(a.date));
}

/** One post by slug, or null when it does not exist. */
export async function getPost(slug: string): Promise<BlogPost | null> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return null;
  let source: string;
  try {
    source = await readFile(path.join(BLOG_DIR, `${slug}.mdx`), "utf-8");
  } catch {
    return null;
  }
  const { meta, content } = parseFrontmatter(source);
  if (!meta.title || !meta.date || !meta.excerpt) return null;
  return { slug, title: meta.title, date: meta.date, excerpt: meta.excerpt, minutes: readingMinutes(content), content };
}
