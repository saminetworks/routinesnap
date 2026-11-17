/**
 * RoutineSnap category definitions (spec section 8).
 * Drives the AI prompts, the category picker, the use-case chips on the
 * landing page, and the template pages (Step 6). Names and descriptions
 * are translated here so every surface uses the same wording.
 */

export type CategorySlug =
  | "class-routine"
  | "exam-routine"
  | "duty-roster"
  | "invitation-card"
  | "medicine-schedule"
  | "match-fixture";

export type CategoryLocale = "en" | "bn" | "ja";

export interface CategoryDefinition {
  slug: CategorySlug;
  emoji: string;
  name: Record<CategoryLocale, string>;
  description: Record<CategoryLocale, string>;
  /** Short hints shown to the user, per locale. */
  hints: Record<CategoryLocale, string[]>;
  /** Default recurrence for events extracted from this category. */
  defaultRecurrence: "weekly" | "one-off" | "daily";
  /** Category-specific extraction rules (see spec section 8). */
  specialRules: string;
  /** Localised tips shown on the template page (Step 6). */
  rules: Record<CategoryLocale, string[]>;
}

export const categories: CategoryDefinition[] = [
  {
    slug: "class-routine",
    emoji: "🏫",
    name: {
      en: "Class routine",
      bn: "ক্লাস রুটিন",
      ja: "授業の時間割",
    },
    description: {
      en: "School, college or university routine board or WhatsApp photo. Weekly recurring events by weekday, with subject, time, room and teacher.",
      bn: "স্কুল, কলেজ বা বিশ্ববিদ্যালয়ের রুটিন বোর্ড বা হোয়াটসঅ্যাপ ছবি। সপ্তাহের দিন অনুযায়ী পুনরাবৃত্তিমূলক ইভেন্ট, বিষয়, সময়, রুম ও শিক্ষকসহ।",
      ja: "学校・大学の時間割ボードやWhatsAppの写真。曜日ごとの繰り返しイベントで、科目・時間・教室・先生を含みます。",
    },
    hints: {
      en: ["Weekly by weekday", "Subject, room, teacher"],
      bn: ["সপ্তাহের দিন অনুযায়ী", "বিষয়, রুম, শিক্ষক"],
      ja: ["曜日ごとの繰り返し", "科目・教室・先生"],
    },
    defaultRecurrence: "weekly",
    specialRules:
      "Weekly recurring events by weekday; each period has subject, time, room and teacher.",
    rules: {
      en: ["Take a straight, well-lit photo of the whole board", "Weekly periods repeat on the same weekday", "Check room numbers and teacher names before exporting"],
      bn: ["পুরো বোর্ডের সোজা, আলো ঝলমলে ছবি তুলুন", "সাপ্তাহিক পিরিয়ড একই সপ্তাহের দিনে পুনরাবৃত্তি হয়", "এক্সপোর্টের আগে রুম নম্বর ও শিক্ষকের নাম যাচাই করুন"],
      ja: ["ボード全体をまっすぐ、明るく撮影してください", "週の授業は同じ曜日に繰り返されます", "エクスポート前に教室番号と先生の名前を確認してください"],
    },
  },
  {
    slug: "exam-routine",
    emoji: "📝",
    name: {
      en: "Exam routine",
      bn: "পরীক্ষার রুটিন",
      ja: "試験日程",
    },
    description: {
      en: "Exam dates added to the calendar with reminders ahead of time (default 1 day and 2 hours before). One-off events.",
      bn: "পরীক্ষার তারিখ ক্যালেন্ডারে যোগ করা হয়, আগে থেকে রিমাইন্ডারসহ (ডিফল্ট ১ দিন ও ২ ঘণ্টা আগে)। একবারের ইভেন্ট।",
      ja: "試験日をカレンダーに追加し、事前にリマインダーを設定します（デフォルトは1日前と2時間前）。単発イベントです。",
    },
    hints: {
      en: ["One-off dates", "Reminders 1 day + 2 hours before"],
      bn: ["একবারের তারিখ", "১ দিন ও ২ ঘণ্টা আগে রিমাইন্ডার"],
      ja: ["単発の日程", "1日前と2時間前にリマインダー"],
    },
    defaultRecurrence: "one-off",
    specialRules:
      "One-off events. Default reminders: 1 day and 2 hours before each exam.",
    rules: {
      en: ["Exam dates are one-off events — no weekly repeat", "Reminders default to 1 day and 2 hours before", "Double-check the year if it is not printed on the routine"],
      bn: ["পরীক্ষার তারিখ একবারের ইভেন্ট — সাপ্তাহিক পুনরাবৃত্তি নয়", "রিমাইন্ডার ডিফল্টভাবে ১ দিন ও ২ ঘণ্টা আগে", "রুটিনে বছর ছাপা না থাকলে বছরটি যাচাই করুন"],
      ja: ["試験日は単発イベントです。毎週の繰り返しはありません", "リマインダーはデフォルトで1日前と2時間前です", "日程表に年が書かれていない場合は年を確認してください"],
    },
  },
  {
    slug: "duty-roster",
    emoji: "💼",
    name: {
      en: "Duty roster",
      bn: "ডিউটি রোস্টার",
      ja: "シフト表",
    },
    description: {
      en: "From a Japan baito shift sheet to a Bangladesh office or garments duty roster. Handles name-filtered rows, night shifts crossing midnight, and shift codes mapped to times from a legend.",
      bn: "জাপানের বাইতো শিফট শিট থেকে বাংলাদেশের অফিস বা গার্মেন্টস ডিউটি রোস্টার পর্যন্ত। নাম অনুযায়ী সারি, মধ্যরাত পেরোনো নাইট শিফট এবং লেজেন্ড থেকে সময় মেলানো শিফট কোড (A/B/C, 早/遅, ডে/নাইট) সামলায়।",
      ja: "日本のバイトのシフト表からバングラデシュのオフィス・縫製工場の勤務表まで対応。名前で絞り込み、深夜をまたぐ夜勤、凡例から時間に変換するシフトコード（A/B/C、早/遅、デー/ナイト）に対応します。",
    },
    hints: {
      en: ["Filter by my name", "Night shifts past midnight"],
      bn: ["আমার নামে ফিল্টার", "মধ্যরাত পেরোনো নাইট শিফট"],
      ja: ["自分の名前で絞り込み", "深夜をまたぐ夜勤"],
    },
    defaultRecurrence: "weekly",
    specialRules:
      "Name-filtered rows (user types their name to pick only their shifts), night shifts crossing midnight, shift codes (A/B/C, 早/遅, ডে/নাইট) mapped to times if a legend is in the image.",
    rules: {
      en: ["Type your name to keep only your own shifts", "Night shifts that cross midnight are handled correctly", "Shift codes (A/B/C, 早/遅, ডে/নাইট) are read from the legend in the photo"],
      bn: ["শুধু নিজের শিফট রাখতে আপনার নাম লিখুন", "মধ্যরাত পেরোনো নাইট শিফট সঠিকভাবে ভাগ করা হয়", "শিফট কোড (A/B/C, 早/遅, ডে/নাইট) ছবির লেজেন্ড থেকে পড়া হয়"],
      ja: ["自分の名前を入力すると、自分のシフトだけが残ります", "深夜をまたぐ夜勤も正しく分割されます", "シフトコード（A/B/C、早/遅、デー/ナイト）は写真の凡例から読み取ります"],
    },
  },
  {
    slug: "invitation-card",
    emoji: "💒",
    name: {
      en: "Invitation card",
      bn: "আমন্ত্রণপত্র",
      ja: "招待状",
    },
    description: {
      en: "Wedding or event invitation image to a single event with date, time, venue, and a map search link. Bangla dates and Hijri/Bengali calendar mentions are flagged for confirmation.",
      bn: "বিয়ে বা অনুষ্ঠানের আমন্ত্রণপত্রের ছবি থেকে একটি ইভেন্ট — তারিখ, সময়, স্থান ও মানচিত্রের লিংকসহ। বাংলা তারিখ ও হিজরি/বাংলা বর্ষপঞ্জির উল্লেখ যাচাইয়ের জন্য চিহ্নিত করা হয়।",
      ja: "結婚式やイベントの招待状の写真から、日時・会場・ map 検索リンク付きの単発イベントを作成します。ベンガル語の日付やヒジュラ暦・ベンガル暦の記述は確認用にフラグを立てます。",
    },
    hints: {
      en: ["Single event", "Date, time, venue"],
      bn: ["একটি ইভেন্ট", "তারিখ, সময়, স্থান"],
      ja: ["単発イベント", "日時・会場"],
    },
    defaultRecurrence: "one-off",
    specialRules:
      "Single event with date, time, venue and map search link. Flag Bangla dates and Hijri/Bengali calendar mentions for confirmation.",
    rules: {
      en: ["One event is created, with date, time and venue", "Bangla dates and Hijri/Bengali calendar mentions are flagged for you to confirm", "Check the venue spelling before sharing the event"],
      bn: ["তারিখ, সময় ও স্থানসহ একটি ইভেন্ট তৈরি হয়", "বাংলা তারিখ ও হিজরি/বাংলা বর্ষপঞ্জির উল্লেখ যাচাইয়ের জন্য চিহ্নিত করা হয়", "ইভেন্ট শেয়ার করার আগে স্থানের বানান যাচাই করুন"],
      ja: ["日時・会場付きの単発イベントが1件作成されます", "ベンガル語の日付やヒジュラ暦・ベンガル暦の記述は確認用にフラグが立ちます", "共有する前に会場の表記を確認してください"],
    },
  },
  {
    slug: "medicine-schedule",
    emoji: "💊",
    name: {
      en: "Medicine schedule",
      bn: "ওষুধের সময়সূচি",
      ja: "服薬スケジュール",
    },
    description: {
      en: "Prescription photo to medicine, dose and timing — morning/noon/night, before/after meal, 1+0+1 notation — and duration in days. Creates repeating reminder events.",
      bn: "প্রেসক্রিপশনের ছবি থেকে ওষুধ, ডোজ ও সময় — সকাল/দুপুর/রাত, খাবারের আগে/পরে, ১+০+১ ধরন — এবং কত দিন চলবে। পুনরাবৃত্তিমূলক রিমাইন্ডার ইভেন্ট তৈরি করে।",
      ja: "処方箋の写真から薬・用量・タイミング（朝/昼/夜、食前/食後、1+0+1表記）と服用日数を読み取り、繰り返しリマインダーを作成します。",
    },
    hints: {
      en: ["Dose and timing", "Repeating reminders"],
      bn: ["ডোজ ও সময়", "পুনরাবৃত্তিমূলক রিমাইন্ডার"],
      ja: ["用量とタイミング", "繰り返しリマインダー"],
    },
    defaultRecurrence: "daily",
    specialRules:
      "Medicine, dose, timing (morning/noon/night, before/after meal, 1+0+1 notation), duration in days. Strong safety notice and mandatory verification checkbox before export.",
    rules: {
      en: ["Doses use 1+0+1 style timing: morning, noon, night", "Always verify doses against your prescription before exporting", "RoutineSnap is a helper, not medical advice"],
      bn: ["ডোজে ১+০+১ ধরনের সময় ব্যবহার হয়: সকাল, দুপুর, রাত", "এক্সপোর্টের আগে সবসময় প্রেসক্রিপশনের সঙ্গে ডোজ মিলিয়ে নিন", "RoutineSnap একটি সহায়ক, চিকিৎসা পরামর্শ নয়"],
      ja: ["用量は1+0+1形式（朝・昼・夜）で読み取ります", "エクスポート前に必ず処方箋と用量を照合してください", "RoutineSnapは便利ツールであり、医療アドバイスではありません"],
    },
  },
  {
    slug: "match-fixture",
    emoji: "🏏",
    name: {
      en: "Match fixture",
      bn: "খেলার ফিক্সচার",
      ja: "試合日程",
    },
    description: {
      en: "Cricket (or any sport) fixture image to match events with teams, venue and local time. Filter to only your team, with timezone conversion.",
      bn: "ক্রিকেট (বা যেকোনো খেলার) ফিক্সচারের ছবি থেকে ম্যাচ ইভেন্ট — দল, ভেন্যু ও স্থানীয় সময়সহ। শুধু নিজের দল ফিল্টার করা যায়, টাইমজোন রূপান্তরসহ।",
      ja: "クリケット（またはあらゆるスポーツ）の対戦表の写真から、チーム・会場・現地時間付きの試合イベントを作成します。自分のチームだけに絞り込め、タイムゾーン変換にも対応します。",
    },
    hints: {
      en: ["Only my team", "Timezone conversion"],
      bn: ["শুধু আমার দল", "টাইমজোন রূপান্তর"],
      ja: ["自分のチームだけ", "タイムゾーン変換"],
    },
    defaultRecurrence: "one-off",
    specialRules:
      "Match events with teams, venue and local time. Allow an 'only my team' filter and timezone conversion.",
    rules: {
      en: ["Filter to only your team if you want", "Times are converted to your timezone", "Venue and teams are kept in the event title and location"],
      bn: ["চাইলে শুধু নিজের দল ফিল্টার করুন", "সময় আপনার টাইমজোনে রূপান্তর করা হয়", "ভেন্যু ও দল ইভেন্টের শিরোনাম ও স্থানে রাখা হয়"],
      ja: ["自分のチームだけに絞り込むこともできます", "時間はあなたのタイムゾーンに変換されます", "会場とチームはイベント名と場所に保存されます"],
    },
  },
];

export function getCategory(slug: string): CategoryDefinition | undefined {
  return categories.find((c) => c.slug === slug);
}
