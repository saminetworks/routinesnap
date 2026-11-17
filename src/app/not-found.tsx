import { SearchX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Root 404 (Step 6). The `[locale]/not-found.tsx` covers notFound()
 * calls from inside a rendered locale route; this one covers
 * router-level 404s — e.g. an unknown template/blog slug when
 * dynamicParams=false, or a URL with no locale at all. It links to
 * the English home/scan pages (no locale context exists here).
 */
export default function RootNotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <SearchX className="mx-auto size-10 text-muted-foreground" aria-hidden />
      <h1 className="mt-4 text-2xl font-extrabold tracking-tight">Page not found</h1>
      <p className="mx-auto mt-2 max-w-md text-muted-foreground">
        That page does not exist — or the template you were looking for was moved. Try the
        home page or scan a routine instead.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button type="button" size="lg" asChild>
          <Link href="/en/scan">Scan a routine</Link>
        </Button>
        <Button type="button" variant="secondary" size="lg" asChild>
          <Link href="/en">Go to the home page</Link>
        </Button>
      </div>
    </div>
  );
}
