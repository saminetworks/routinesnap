"use client";

import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "./language-switcher";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

/**
 * Sticky blurred navbar: logo, Scan / Templates / Blog links, language
 * switcher, theme toggle, primary "Scan a routine" button.
 * Mobile: hamburger button opens a full-width sheet below the header.
 */
export function SiteHeader() {
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);

  const links = [
    { href: "/scan", label: tNav("scan") },
    { href: "/templates", label: tNav("templates") },
    { href: "/blog", label: tNav("blog") },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4">
        <Logo />
        <nav
          aria-label="Primary"
          className="hidden items-center gap-1 md:flex"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex min-h-11 items-center rounded-[10px] px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/10 hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <span className="hidden sm:block">
            <LanguageSwitcher />
          </span>
          <ThemeToggle />
          <Button asChild size="default" className="hidden md:inline-flex">
            <Link href="/scan">{tCommon("scanNow")}</Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={open ? tNav("closeMenu") : tNav("menu")}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>
      {open && (
        <div
          id="mobile-nav"
          className="border-t border-border bg-background px-4 pb-6 pt-2 md:hidden"
        >
          <nav aria-label="Mobile" className="flex flex-col">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center rounded-[10px] px-2 text-base font-medium hover:bg-muted/10"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-3 flex items-center gap-2">
              <LanguageSwitcher />
            </div>
            <Button asChild size="lg" className="mt-4 w-full">
              <Link href="/scan" onClick={() => setOpen(false)}>
                {tCommon("scanNow")}
              </Link>
            </Button>
          </nav>
        </div>
      )}
    </header>
  );
}
