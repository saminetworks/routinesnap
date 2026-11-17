import type { CategoryLocale } from "@/config/categories";

/**
 * CSS-built mock of a routine photo — no external images.
 * Each category gets a few sample rows as they would appear in a
 * real photo (day/time + label), in the page's locale where the
 * label has a translation. It is an illustration, not a real scan.
 */

interface SampleRow {
  time: string;
  label: Record<CategoryLocale, string>;
  meta?: string;
}

const SAMPLES: Record<string, SampleRow[]> = {
  "class-routine": [
    { time: "09:00", label: { en: "Physics", bn: "পদার্থবিজ্ঞান", ja: "物理" }, meta: "Room 204" },
    { time: "10:00", label: { en: "Mathematics", bn: "গণিত", ja: "数学" }, meta: "Room 204" },
    { time: "11:30", label: { en: "English", bn: "ইংরেজি", ja: "英語" }, meta: "Room 101" },
    { time: "13:00", label: { en: "Chemistry", bn: "রসায়ন", ja: "化学" }, meta: "Lab 2" },
  ],
  "exam-routine": [
    { time: "Jan 12 · 09:00", label: { en: "Physics exam", bn: "পদার্থবিজ্ঞান পরীক্ষা", ja: "物理の試験" }, meta: "Hall A" },
    { time: "Jan 14 · 09:00", label: { en: "Mathematics exam", bn: "গণিত পরীক্ষা", ja: "数学の試験" }, meta: "Hall A" },
    { time: "Jan 16 · 09:00", label: { en: "English exam", bn: "ইংরেজি পরীক্ষা", ja: "英語の試験" }, meta: "Hall B" },
  ],
  "duty-roster": [
    { time: "08:00–16:00", label: { en: "Ayesha — Day shift", bn: "আয়েশা — ডে শিফট", ja: "アイシャ — 日勤" }, meta: "A" },
    { time: "22:00–06:00", label: { en: "Rahim — Night shift", bn: "রহিম — নাইট শিফট", ja: "ラヒム — 夜勤" }, meta: "C" },
    { time: "09:00–17:00", label: { en: "Tanaka — Early shift", bn: "তানাকা — আর্লি শিফট", ja: "田中 — 早番" }, meta: "早" },
  ],
  "invitation-card": [
    { time: "Sat, 14 Feb 2026", label: { en: "Wedding of Ayesha & Rahim", bn: "আয়েশা ও রহিমের বিয়ে", ja: "アイシャとラヒムの結婚式" }, meta: "7:00 PM" },
    { time: "Grand Palace", label: { en: "Convention Hall, Dhaka", bn: "কনভেনশন হল, ঢাকা", ja: "コンベンションホール、ダッカ" }, meta: "" },
  ],
  "medicine-schedule": [
    { time: "1+0+1", label: { en: "Napa 500mg", bn: "নাপা ৫০০ মি.গ্রা.", ja: "ナパ 500mg" }, meta: "7 days" },
    { time: "1+1+1", label: { en: "Amoxicillin 250mg", bn: "অ্যামোক্সিসিলিন ২৫০ মি.গ্রা.", ja: "アモキシシリン 250mg" }, meta: "5 days" },
    { time: "0+0+1", label: { en: "Vitamin D", bn: "ভিটামিন ডি", ja: "ビタミンD" }, meta: "30 days" },
  ],
  "match-fixture": [
    { time: "2:00 PM", label: { en: "Bangladesh vs India", bn: "বাংলাদেশ বনাম ভারত", ja: "バングラデシュ対インド" }, meta: "Mirpur" },
    { time: "6:00 PM", label: { en: "Japan vs Australia", bn: "জাপান বনাম অস্ট্রেলিয়া", ja: "日本対オーストラリア" }, meta: "Tokyo Dome" },
  ],
};

export function ExamplePhotoMock({
  slug,
  locale,
}: {
  slug: string;
  locale: CategoryLocale;
}) {
  const rows = SAMPLES[slug] ?? [];
  return (
    <figure
      aria-label="Example routine photo"
      className="overflow-hidden rounded-[16px] border border-border bg-card shadow-soft"
    >
      <div className="flex items-center gap-2 border-b border-border bg-muted/20 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-danger/70" aria-hidden />
        <span className="size-2.5 rounded-full bg-warning/70" aria-hidden />
        <span className="size-2.5 rounded-full bg-success/70" aria-hidden />
        <span className="ml-2 font-mono text-xs text-muted-foreground">routine-photo.jpg</span>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li key={row.time + row.label.en} className="flex items-center gap-3 px-4 py-3">
            <span className="w-28 shrink-0 font-mono text-xs font-semibold text-primary">
              {row.time}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.label[locale]}</span>
            {row.meta && (
              <span className="shrink-0 rounded-full bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
                {row.meta}
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className="border-t border-border bg-muted/20 px-4 py-2">
        <div className="h-2 w-3/4 rounded-full bg-muted/50" aria-hidden />
        <div className="mt-2 h-2 w-1/2 rounded-full bg-muted/40" aria-hidden />
      </div>
    </figure>
  );
}
