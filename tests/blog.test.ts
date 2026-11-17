import { describe, expect, it } from "vitest";
import {
  getAllPosts,
  getPost,
  parseFrontmatter,
  readingMinutes,
} from "@/lib/blog";

describe("parseFrontmatter", () => {
  it("splits frontmatter from body", () => {
    const { meta, content } = parseFrontmatter(
      '---\ntitle: "Hello"\ndate: "2026-11-16"\nexcerpt: "Hi"\n---\nBody text here.',
    );
    expect(meta).toEqual({ title: "Hello", date: "2026-11-16", excerpt: "Hi" });
    expect(content).toBe("Body text here.");
  });

  it("returns empty meta when there is no frontmatter block", () => {
    const { meta, content } = parseFrontmatter("Just body.");
    expect(meta).toEqual({});
    expect(content).toBe("Just body.");
  });
});

describe("readingMinutes", () => {
  it("is at least 1 and scales with word count", () => {
    expect(readingMinutes("one two")).toBe(1);
    expect(readingMinutes("word ".repeat(400))).toBe(2);
  });
});

describe("blog posts on disk", () => {
  it("lists 3 starter posts, newest first, with title/date/excerpt", async () => {
    const posts = await getAllPosts();
    expect(posts).toHaveLength(3);
    expect(posts.map((p) => p.slug)).toEqual([
      "class-routine-photo-to-calendar",
      "duty-roster-to-calendar",
      "photo-to-calendar-privately",
    ]);
    for (const post of posts) {
      expect(post.title.length).toBeGreaterThan(0);
      expect(post.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(post.excerpt.length).toBeGreaterThan(0);
      expect(post.minutes).toBeGreaterThanOrEqual(1);
    }
  });

  it("returns a full post by slug and null for unknown slugs", async () => {
    const post = await getPost("duty-roster-to-calendar");
    expect(post?.title).toContain("Duty rosters");
    expect(post?.content).toContain("midnight");
    expect(await getPost("no-such-post")).toBeNull();
    expect(await getPost("../package")).toBeNull();
  });
});
