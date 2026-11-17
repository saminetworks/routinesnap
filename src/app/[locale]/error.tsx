"use client";

import { AlertTriangle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

/** On-brand error state (Step 6, spec §14). */
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <AlertTriangle className="mx-auto size-10 text-warning" aria-hidden />
      <h1 className="mt-4 text-2xl font-extrabold tracking-tight">Something went wrong</h1>
      <p className="mx-auto mt-2 max-w-md text-muted-foreground">
        That page hit a problem on our side. Your photos are never stored, so nothing was lost —
        please try again.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button type="button" size="lg" onClick={reset}>
          Try again
        </Button>
        <Button type="button" variant="secondary" size="lg" asChild>
          <Link href="/">Go to the home page</Link>
        </Button>
      </div>
    </div>
  );
}
