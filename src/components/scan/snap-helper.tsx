"use client";

import { createElement } from "react";
import type { PhotoQuality } from "@/lib/photo-quality";
import { cn } from "@/lib/utils";

/**
 * Snap Helper (Part C): a small chat-style panel on the scan page.
 *
 * Purely presentational and hook-free (so tests can call it directly,
 * like Part D's debug panel): props in, UI out. It appears when an
 * extraction fails and is also openable anytime via a "Need help?"
 * button on the scan page.
 *
 * The reason is derived from the actual error code plus the Part B
 * photo-quality signals — never from a guess:
 * - rate_limited / invalid_image / ai_unavailable: the code says it.
 * - invalid_output / extraction_failed / serverError / extractError:
 *   when the photo is dark, blurry or has glare, the photo is the
 *   likely cause; otherwise the honest answer is "couldn't tell
 *   exactly" — "cropped" is NEVER claimed, there is no signal for it.
 *
 * All user-visible strings come via `labels` (English defaults built
 * in); the scan page passes translated strings. Buttons call the
 * callbacks passed as props, so the parent owns every flow (retake,
 * tips, retry, manual add).
 *
 * Example:
 *   <SnapHelper
 *     open={helperOpen}
 *     errorCode={lastErrorCode}
 *     quality={quality}
 *     onRetake={...} onShowTips={...} onRetry={...} onManualAdd={...}
 *     onClose={() => setHelperOpen(false)}
 *   />
 */

/** Machine-readable error codes the scan page already maps (see scan-page.tsx). */
export type SnapErrorCode =
  | "rate_limited"
  | "invalid_image"
  | "ai_unavailable"
  | "invalid_output"
  | "extraction_failed"
  | "serverError"
  | "extractError";

/** What the helper tells the user went wrong. */
export type SnapReason =
  | "rate_limited"
  | "invalid_image"
  | "ai_unavailable"
  | "invalid_output"
  | "photo_quality"
  | "unknown";

/**
 * Derive the helper's reason from the real error code plus the
 * photo-quality signals. Quality only overrides the generic codes
 * (invalid_output / extraction_failed / serverError / extractError /
 * none): a rate limit or an outage is what it is, whatever the photo
 * looks like. No signal exists for a cropped photo, so "cropped" is
 * never a reason — inconclusive cases stay "unknown".
 */
export function deriveSnapReason(
  errorCode?: string | null,
  quality?: PhotoQuality | null,
): SnapReason {
  const photoSuspect =
    quality !== null &&
    quality !== undefined &&
    !quality.unknown &&
    (quality.dark || quality.blurry || quality.glare);
  switch (errorCode) {
    case "rate_limited":
      return "rate_limited";
    case "invalid_image":
      return "invalid_image";
    case "ai_unavailable":
      return "ai_unavailable";
    case "invalid_output":
      return photoSuspect ? "photo_quality" : "invalid_output";
    default:
      return photoSuspect ? "photo_quality" : "unknown";
  }
}

/** Which quality flags are set, in display order (unknown => none). */
export function qualityFlagList(quality?: PhotoQuality | null): ("dark" | "blurry" | "glare")[] {
  if (!quality || quality.unknown) return [];
  const flags: ("dark" | "blurry" | "glare")[] = [];
  if (quality.dark) flags.push("dark");
  if (quality.blurry) flags.push("blurry");
  if (quality.glare) flags.push("glare");
  return flags;
}

export interface SnapHelperLabels {
  title: string;
  close: string;
  reasonRateLimited: string;
  reasonInvalidImage: string;
  reasonAiUnavailable: string;
  reasonInvalidOutput: string;
  reasonPhotoQuality: string;
  reasonUnknown: string;
  qualityNoteDark: string;
  qualityNoteBlurry: string;
  qualityNoteGlare: string;
  tipsTitle: string;
  tips: string[];
  retake: string;
  showTips: string;
  hideTips: string;
  retry: string;
  manualAdd: string;
}

export const DEFAULT_SNAP_HELPER_LABELS: SnapHelperLabels = {
  title: "Need a hand?",
  close: "Close",
  reasonRateLimited:
    "You've used today's free scans. Come back tomorrow, or add your events manually below — that always works.",
  reasonInvalidImage:
    "That file couldn't be used as a photo. Try a JPG, PNG or WEBP image under 8 MB.",
  reasonAiUnavailable:
    "Our AI service is busy right now. This isn't your photo's fault — please try again in a minute.",
  reasonInvalidOutput:
    "We couldn't make sense of the schedule in that photo. A clearer photo or a closer crop usually fixes it.",
  reasonPhotoQuality:
    "Your photo looks hard to read, and that's the most likely reason the scan failed.",
  reasonUnknown:
    "We couldn't tell exactly what went wrong. A clearer photo usually fixes it — or add your events manually below.",
  qualityNoteDark: "The photo looks too dark.",
  qualityNoteBlurry: "The photo looks blurry.",
  qualityNoteGlare: "There's a bright glare on the photo.",
  tipsTitle: "How to take a good photo",
  tips: [
    "Fill the frame with the schedule — get close so the text is big.",
    "Hold the phone steady and tap the screen to focus on the text.",
    "Use daylight or a bright room; avoid flash and shadows on the page.",
    "Keep the page flat and straight — avoid angles and curled corners.",
    "Check the preview: if you can't read it, the scan can't either.",
  ],
  retake: "Take new photo",
  showTips: "How to take a good photo",
  hideTips: "Hide tips",
  retry: "Try again",
  manualAdd: "Add events manually",
};

export interface SnapHelperProps {
  /** Machine-readable code of the last failed extraction (or null). */
  errorCode?: string | null;
  /** Part B quality signals for the current photo (or null). */
  quality?: PhotoQuality | null;
  /** Whether the panel is visible. Defaults to false (closed). */
  open?: boolean;
  /** Whether the tips list inside the panel is shown. Defaults to false. */
  tipsOpen?: boolean;
  /** "Take new photo" — reopens the upload / replace flow. */
  onRetake?: () => void;
  /** "How to take a good photo" — toggles the tips list. */
  onShowTips?: () => void;
  /** "Try again" — re-runs the last extraction. */
  onRetry?: () => void;
  /** "Add events manually" — goes to manual entry. */
  onManualAdd?: () => void;
  /** Close (×) button. */
  onClose?: () => void;
  /** Translated labels; English defaults apply. */
  labels?: Partial<SnapHelperLabels>;
  className?: string;
}

export function SnapHelper({
  errorCode,
  quality,
  open = false,
  tipsOpen = false,
  onRetake,
  onShowTips,
  onRetry,
  onManualAdd,
  onClose,
  labels,
  className,
}: SnapHelperProps) {
  if (!open) return null;

  const l: SnapHelperLabels = { ...DEFAULT_SNAP_HELPER_LABELS, ...labels };
  const reason = deriveSnapReason(errorCode, quality);
  const reasonText =
    reason === "rate_limited"
      ? l.reasonRateLimited
      : reason === "invalid_image"
        ? l.reasonInvalidImage
        : reason === "ai_unavailable"
          ? l.reasonAiUnavailable
          : reason === "invalid_output"
            ? l.reasonInvalidOutput
            : reason === "photo_quality"
              ? l.reasonPhotoQuality
              : l.reasonUnknown;
  const flags = qualityFlagList(quality);
  const qualityNotes: Record<"dark" | "blurry" | "glare", string> = {
    dark: l.qualityNoteDark,
    blurry: l.qualityNoteBlurry,
    glare: l.qualityNoteGlare,
  };

  const actions: { testId: string; label: string; onClick?: () => void; primary?: boolean }[] = [
    { testId: "snap-retake", label: l.retake, onClick: onRetake },
    { testId: "snap-tips", label: tipsOpen ? l.hideTips : l.showTips, onClick: onShowTips },
    { testId: "snap-retry", label: l.retry, onClick: onRetry, primary: true },
    { testId: "snap-manual", label: l.manualAdd, onClick: onManualAdd },
  ].filter((a) => a.onClick !== undefined);

  // Written with React.createElement (no JSX): this repo's tsconfig sets
  // "jsx": "preserve", so vitest cannot parse JSX in an imported .tsx
  // file, and the helper's reason logic must stay importable by tests.
  return createElement(
    "section",
    {
      "data-testid": "snap-helper",
      role: "region",
      "aria-label": l.title,
      className: cn(
        "mt-6 rounded-[16px] border border-border bg-card p-4 sm:p-5",
        className,
      ),
    },
    createElement(
      "div",
      { className: "flex items-start justify-between gap-3" },
      createElement("h2", { className: "text-base font-semibold" }, l.title),
      onClose
        ? createElement(
            "button",
            {
              type: "button",
              "data-testid": "snap-close",
              onClick: onClose,
              "aria-label": l.close,
              className:
                "flex min-h-11 min-w-11 items-center justify-center rounded-[10px] border border-border text-sm font-medium text-muted-foreground hover:bg-muted",
            },
            "×",
          )
        : null,
    ),
    createElement(
      "p",
      { "data-testid": "snap-helper-reason", className: "mt-2 text-sm text-muted-foreground" },
      reasonText,
    ),
    flags.length > 0
      ? createElement(
          "ul",
          { "data-testid": "snap-helper-quality", className: "mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground" },
          flags.map((flag) => createElement("li", { key: flag }, qualityNotes[flag])),
        )
      : null,
    tipsOpen
      ? createElement(
          "div",
          { "data-testid": "snap-helper-tips", className: "mt-4 rounded-[12px] border border-border bg-muted/40 p-3" },
          createElement("h3", { className: "text-sm font-semibold" }, l.tipsTitle),
          createElement(
            "ul",
            { className: "mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground" },
            l.tips.map((tip) => createElement("li", { key: tip }, tip)),
          ),
        )
      : null,
    createElement(
      "div",
      { className: "mt-4 flex flex-wrap gap-2" },
      actions.map((action) =>
        createElement(
          "button",
          {
            key: action.testId,
            type: "button",
            "data-testid": action.testId,
            onClick: action.onClick,
            className: cn(
              "min-h-11 rounded-[10px] px-3 text-sm font-medium",
              action.primary
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-background hover:bg-muted",
            ),
          },
          action.label,
        ),
      ),
    ),
  );
}
