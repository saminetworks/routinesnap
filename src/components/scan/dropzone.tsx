"use client";

import { Camera, ImagePlus, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ACCEPTED_TYPES, processImageFile, type ProcessedImage } from "@/lib/image";
import { cn } from "@/lib/utils";

interface DropzoneProps {
  onImage: (image: ProcessedImage) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}

/**
 * Step 1 upload: drag & drop, file picker, camera (mobile), paste.
 * Files are processed client-side (HEIC convert, resize, EXIF strip)
 * before the parent ever sees them.
 */
export function Dropzone({ onImage, onError, disabled }: DropzoneProps) {
  const t = useTranslations("scan");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file || disabled) return;
      setBusy(true);
      try {
        const processed = await processImageFile(file);
        onImage(processed);
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (message.includes("8 MB")) onError(t("fileTooLarge"));
        else if (message.includes("JPG")) onError(t("unsupportedType"));
        else onError(t("couldNotRead"));
      } finally {
        setBusy(false);
      }
    },
    [disabled, onError, onImage, t],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const item = Array.from(event.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith("image/"),
      );
      if (item) {
        event.preventDefault();
        void handleFile(item.getAsFile());
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handleFile]);

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label={t("dropzoneTitle")}
        aria-disabled={disabled || busy}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFile(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-3 rounded-[16px] border-2 border-dashed px-4 py-10 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          dragging
            ? "border-primary bg-primary/5"
            : "border-input bg-card hover:border-primary/60",
        )}
      >
        <span className="flex size-14 items-center justify-center rounded-full bg-gradient-primary text-white" aria-hidden>
          <Upload className="size-6" />
        </span>
        <p className="text-base font-semibold">{t("dropzoneTitle")}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{t("dropzoneHint")}</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            disabled={disabled || busy}
            onClick={(e) => {
              e.stopPropagation();
              fileRef.current?.click();
            }}
          >
            <ImagePlus aria-hidden />
            {busy ? t("loading") : t("browse")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || busy}
            onClick={(e) => {
              e.stopPropagation();
              cameraRef.current?.click();
            }}
          >
            <Camera aria-hidden />
            {t("useCamera")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("pasteHint")}</p>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        className="sr-only"
        aria-label={t("browse")}
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label={t("useCamera")}
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
