import { Link } from "@/i18n/navigation";
import { siteConfig } from "@/config/site";

/** Shared product logo (gradient tile + name). */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`flex min-h-11 items-center gap-2 text-base font-bold tracking-tight ${className}`}
      aria-label={siteConfig.name}
    >
      <span
        aria-hidden
        className="bg-gradient-primary flex size-8 shrink-0 items-center justify-center rounded-[10px] text-base font-extrabold text-white"
      >
        R
      </span>
      {siteConfig.name}
    </Link>
  );
}
