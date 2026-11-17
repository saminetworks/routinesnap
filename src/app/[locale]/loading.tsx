import { Loader2 } from "lucide-react";

/** On-brand loading state (Step 6, spec §14). */
export default function Loading() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-24 text-center" aria-busy="true">
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      <p className="mt-4 text-lg font-semibold">RoutineSnap</p>
      <p className="mt-1 text-sm text-muted-foreground">Loading…</p>
      <div className="mt-8 w-full max-w-md space-y-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-[16px] bg-muted/40" />
        ))}
      </div>
    </div>
  );
}
