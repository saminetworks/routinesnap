import { Link } from "@/i18n/navigation";
import { siteConfig } from "@/config/site";

/**
 * Shared product logo: the "Snap" mark (camera whose lens is a mini
 * calendar, public/logo.svg) + name. The mark is a plain <img> — it is
 * vector, so it stays crisp at every size, and the same file is the
 * source for the favicon and PWA icons (see scripts/generate-icons.mjs
 * and scripts/generate-favicon.mjs).
 */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`flex min-h-11 items-center gap-2 text-base font-bold tracking-tight ${className}`}
      aria-label={siteConfig.name}
    >
      <img
        src="/logo.svg"
        alt=""
        aria-hidden
        width={32}
        height={32}
        className="size-8 shrink-0"
      />
      {siteConfig.name}
    </Link>
  );
}
