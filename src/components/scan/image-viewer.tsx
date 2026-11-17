"use client";

import { RefreshCw, RotateCcw, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface ImageViewerProps {
  dataUrl: string;
  rotation: number;
  onRotate: (degrees: 90 | -90) => void;
  onReplace: () => void;
}

/** Image preview with zoom and rotate controls. */
export function ImageViewer({ dataUrl, rotation, onRotate, onReplace }: ImageViewerProps) {
  const t = useTranslations("scan");
  const [zoom, setZoom] = useState(1);

  return (
    <figure className="overflow-hidden rounded-[16px] border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1" role="group" aria-label="Zoom">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("zoomOut")}
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
          >
            <ZoomOut aria-hidden />
          </Button>
          <span className="min-w-12 text-center font-mono text-xs text-muted-foreground" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("zoomIn")}
            onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
          >
            <ZoomIn aria-hidden />
          </Button>
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Rotate">
          <Button type="button" variant="ghost" size="icon" aria-label={t("rotateLeft")} onClick={() => onRotate(-90)}>
            <RotateCcw aria-hidden />
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label={t("rotateRight")} onClick={() => onRotate(90)}>
            <RotateCw aria-hidden />
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onReplace}>
            <RefreshCw aria-hidden />
            {t("replace")}
          </Button>
        </div>
      </div>
      <div className="max-h-[60vh] overflow-auto bg-muted/20 p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={dataUrl}
          alt={t("imageAlt")}
          className="mx-auto max-w-none rounded-[10px] transition-transform duration-200 motion-reduce:transition-none"
          style={{ transform: `rotate(${rotation}deg) scale(${zoom})`, transformOrigin: "center" }}
        />
      </div>
    </figure>
  );
}
