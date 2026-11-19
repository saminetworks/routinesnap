"use client";

import { createElement } from "react";
import type { ProcessedImage } from "@/lib/image";
import { cn } from "@/lib/utils";

/**
 * Debug panel for the /scan page (Part D).
 *
 * Purely presentational: props in, UI out. It never fetches anything and
 * never shows the API key or image content — only sizes, dimensions, the
 * file type, the last /api/extract status/error code, the model name and
 * the extractor kind, all supplied by the caller.
 *
 * Gating: renders NOTHING unless debug mode is on. The check lives inside
 * this component so mounting it is always safe:
 *   - explicit `enabled` prop wins when provided (used by tests and by a
 *     caller that already knows the flag);
 *   - otherwise it falls back to `process.env.NEXT_PUBLIC_DEBUG === "1"`.
 *
 * Wiring (integration agent): on the scan page, in debug mode only, fetch
 * `/api/health?deep=1` once on load and pass `model` (and `extractor`)
 * down. Pass the processed image as `image` and, once
 * `src/lib/image.ts` gains a `processing` / `sentAsIs` field on
 * `ProcessedImage`, pass that value as `processing` (today the field does
 * not exist on ProcessedImage, so `processing` is a plain prop).
 * Labels: pass translated strings via `labels` (keys `scan.debug.*`);
 * English defaults are used when a label is omitted.
 *
 * Example:
 *   <ScanDebugPanel
 *     image={image}
 *     processing="processed"
 *     lastExtract={{ status: 200, code: null }}
 *     model={health?.model}
 *     extractor={health?.extractor}
 *     labels={{ title: t("debug.title"), ... }}
 *   />
 */

export type ImageProcessing = "sent-as-is" | "processed";

/** Minimal image info the panel needs — a ProcessedImage also satisfies this. */
export interface DebugPanelImage {
  sizeBytes?: number | null;
  width?: number | null;
  height?: number | null;
  type?: string | null;
}

export interface LastExtractInfo {
  /** HTTP status of the last /api/extract call, e.g. 200 or 502. */
  status?: number | null;
  /** Machine-readable error code from the response, e.g. "extraction_failed". */
  code?: string | null;
  /**
   * The raw error message when the call never got a response
   * (e.g. "Failed to fetch") — the one detail that tells us WHY a
   * scan failed in the browser instead of on the server.
   */
  detail?: string | null;
}

export interface DebugPanelLabels {
  title: string;
  imageSize: string;
  fileType: string;
  processing: string;
  lastExtract: string;
  model: string;
  extractor: string;
  sentAsIs: string;
  processed: string;
}

export const DEFAULT_DEBUG_LABELS: DebugPanelLabels = {
  title: "Debug",
  imageSize: "Image size",
  fileType: "File type",
  processing: "Processing",
  lastExtract: "Last extract",
  model: "Model",
  extractor: "Extractor",
  sentAsIs: "Sent as-is",
  processed: "Processed",
};

export interface ScanDebugPanelProps {
  /** Processed image (its blob.size / width / height / type are shown). */
  image?: ProcessedImage | DebugPanelImage | null;
  /**
   * Whether the photo was sent as-is or processed. Accepts the
   * `processing` / `sentAsIs` field from ProcessedImage once it exists;
   * until then the wiring agent passes "sent-as-is" | "processed".
   */
  processing?: ImageProcessing | string | null;
  /** Last /api/extract response; null/undefined means no extraction yet. */
  lastExtract?: LastExtractInfo | null;
  /** Model name from /api/health?deep=1; defaults to "unknown". */
  model?: string | null;
  /** Extractor kind ("anthropic" | "mock") if known. */
  extractor?: string | null;
  /**
   * Explicit on/off switch. When omitted, the panel is enabled only when
   * `process.env.NEXT_PUBLIC_DEBUG === "1"`.
   */
  enabled?: boolean;
  /** Translated labels (keys `scan.debug.*`); English defaults apply. */
  labels?: Partial<DebugPanelLabels>;
  /** Whether the panel starts expanded. Defaults to closed. */
  defaultOpen?: boolean;
  className?: string;
}

/** True when the debug panel should render. Explicit `enabled` wins. */
export function isDebugPanelEnabled(enabled?: boolean): boolean {
  if (typeof enabled === "boolean") return enabled;
  return process.env.NEXT_PUBLIC_DEBUG === "1";
}

/** "1.2 MB" / "2.0 KB" / "500 B"; "—" when the size is missing/invalid. */
export function formatBytes(bytes?: number | null): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function imageSizeBytes(image: ProcessedImage | DebugPanelImage | null | undefined): number | null {
  if (!image) return null;
  if ("blob" in image && image.blob) return image.blob.size;
  const sizeBytes = (image as DebugPanelImage).sizeBytes;
  return typeof sizeBytes === "number" ? sizeBytes : null;
}

/**
 * "1.2 MB · 1600×1284" (either half on its own when the other is missing);
 * "—" when there is no image at all.
 */
export function formatImageSummary(image: ProcessedImage | DebugPanelImage | null | undefined): string {
  if (!image) return "—";
  const parts: string[] = [];
  const size = formatBytes(imageSizeBytes(image));
  if (size !== "—") parts.push(size);
  if (typeof image.width === "number" && typeof image.height === "number") {
    parts.push(`${image.width}×${image.height}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

/** "200" / "502 · extraction_failed" / "no response · extractError · Failed to fetch" / "—" when nothing has run yet. */
export function formatLastExtract(lastExtract?: LastExtractInfo | null): string {
  if (!lastExtract) return "—";
  const parts: string[] = [];
  if (typeof lastExtract.status === "number") parts.push(String(lastExtract.status));
  if (lastExtract.code) parts.push(lastExtract.code);
  if (lastExtract.detail) parts.push(lastExtract.detail);
  if (parts.length === 0) return "—";
  // A raw error message only exists when the call never got a response.
  if (lastExtract.detail && typeof lastExtract.status !== "number") {
    parts.unshift("no response");
  }
  return parts.join(" · ");
}

export function ScanDebugPanel({
  image,
  processing,
  lastExtract,
  model,
  extractor,
  enabled,
  labels,
  defaultOpen = false,
  className,
}: ScanDebugPanelProps) {
  if (!isDebugPanelEnabled(enabled)) return null;

  const l: DebugPanelLabels = { ...DEFAULT_DEBUG_LABELS, ...labels };
  const modelName = model && model.trim() !== "" ? model : "unknown";
  const processingLabel =
    processing === "sent-as-is"
      ? l.sentAsIs
      : processing === "processed"
        ? l.processed
        : processing || "—";

  const rows: { label: string; value: string }[] = [
    { label: l.imageSize, value: formatImageSummary(image) },
    { label: l.fileType, value: image?.type || "—" },
    { label: l.processing, value: processingLabel },
    { label: l.lastExtract, value: formatLastExtract(lastExtract) },
    { label: l.model, value: modelName },
    { label: l.extractor, value: extractor || "—" },
  ];

  // Written with React.createElement (no JSX): this repo's tsconfig sets
  // "jsx": "preserve", so vitest cannot parse JSX in an imported .tsx
  // file, and the panel's helpers + gating must stay importable by tests.
  return createElement(
    "details",
    {
      "data-testid": "scan-debug-panel",
      open: defaultOpen || undefined,
      className: cn(
        "mt-6 rounded-[12px] border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground",
        className,
      ),
    },
    createElement(
      "summary",
      {
        className:
          "cursor-pointer list-none font-medium select-none [&::-webkit-details-marker]:hidden",
      },
      l.title,
    ),
    createElement(
      "dl",
      { className: "mt-2 space-y-1" },
      rows.map((row) =>
        createElement(
          "div",
          { key: row.label, className: "flex gap-2" },
          createElement("dt", { className: "shrink-0 font-medium" }, `${row.label}:`),
          createElement("dd", { className: "min-w-0 font-mono break-all" }, row.value),
        ),
      ),
    ),
  );
}
