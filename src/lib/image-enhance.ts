/**
 * Reading enhancement for low-quality schedule photos (Part B+).
 *
 * A clean photo is always sent to the AI exactly as the user sent it.
 * But a dark, blurry or washed-out photo is hard for the AI to read,
 * so when the photo-quality check flags one, the scan page offers an
 * "Enhance photo" button that runs this pipeline in the browser and
 * sends the enhanced copy instead. The preview always shows what the
 * AI gets, so the user sees the enhanced photo before scanning.
 *
 * The pixel math is pure (no DOM/canvas) so it is unit-tested in
 * Node; `enhanceImageForReading` is the thin canvas wrapper around it.
 *
 * What it does, in order:
 * 1. Auto-levels (contrast stretch): maps the 1st–99th percentile of
 *    brightness to black–white, so faded or washed-out text gets
 *    proper contrast. Skipped when the photo already spans the range.
 * 2. Brightness lift (gamma): lifts mid-tones on dark photos so text
 *    on a dim page is readable. Only for dark photos.
 * 3. Sharpen (unsharp mask): strengthens edges on blurry photos.
 * 4. Upscale: a small photo (long edge under 1000px) is drawn 2x so
 *    the text is bigger for the AI; capped so the result stays under
 *    the size the AI would downscale anyway.
 */

import { canvasToBlob, loadImage } from "@/lib/image";
import type { PhotoQuality } from "@/lib/photo-quality";

/** Long edge below this is upscaled 2x for reading. */
export const ENHANCE_MIN_EDGE = 1000;

/** Long edge of the enhanced image is capped here. */
export const ENHANCE_MAX_EDGE = 1600;

export interface EnhanceOptions {
  /** Auto-levels contrast (1st–99th percentile stretch). */
  stretch: boolean;
  /** Gamma lift for dark photos (1 = none, ~1.8 = strong lift). */
  gamma: number;
  /** Unsharp-mask strength (0 = none, ~0.9 = strong). */
  sharpen: number;
}

/** True when the photo is worth enhancing (a quality flag is set). */
export function shouldEnhance(quality: PhotoQuality | null): boolean {
  return (
    !!quality &&
    quality.ok &&
    !quality.unknown &&
    (quality.dark || quality.blurry || quality.glare)
  );
}

/** Pick the enhancement strength from the quality signals. */
export function enhanceOptionsFor(quality: PhotoQuality): EnhanceOptions {
  return {
    stretch: true,
    gamma: quality.dark ? 1.8 : 1,
    sharpen: quality.blurry ? 0.9 : 0.4,
  };
}

/**
 * 1st and 99th percentile luminance from a 256-bin histogram — fast
 * even on a multi-megapixel photo, no sorting needed.
 */
export function stretchLevels(data: ArrayLike<number>): [number, number] {
  const bins = new Uint32Array(256);
  const count = Math.floor(data.length / 4);
  for (let i = 0; i < count; i += 1) {
    const lum = Math.round(
      0.299 * (data[i * 4] ?? 0) +
        0.587 * (data[i * 4 + 1] ?? 0) +
        0.114 * (data[i * 4 + 2] ?? 0),
    );
    bins[lum] += 1;
  }
  const loTarget = Math.max(1, Math.floor(count * 0.01));
  const hiTarget = Math.max(1, Math.floor(count * 0.01));
  let lo = 0;
  let seen = 0;
  for (let v = 0; v < 256; v += 1) {
    seen += bins[v];
    if (seen >= loTarget) {
      lo = v;
      break;
    }
  }
  let hi = 255;
  seen = 0;
  for (let v = 255; v >= 0; v -= 1) {
    seen += bins[v];
    if (seen >= hiTarget) {
      hi = v;
      break;
    }
  }
  return [lo, hi];
}

function clampByte(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : Math.round(n);
}

/** Linear contrast stretch: map [lo, hi] onto [0, 255] per channel. */
export function applyLevels(data: Uint8ClampedArray, lo: number, hi: number): void {
  if (hi - lo < 16) return; // Already spans the range; nothing to gain.
  const scale = 255 / (hi - lo);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clampByte((data[i] - lo) * scale);
    data[i + 1] = clampByte((data[i + 1] - lo) * scale);
    data[i + 2] = clampByte((data[i + 2] - lo) * scale);
  }
}

/** Gamma lift: brightens mid-tones (gamma > 1) without blowing out white. */
export function applyGamma(data: Uint8ClampedArray, gamma: number): void {
  if (gamma === 1) return;
  const inv = 1 / gamma;
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v += 1) {
    lut[v] = clampByte(255 * Math.pow(v / 255, inv));
  }
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }
}

/**
 * Unsharp mask: out = centre + amount * (centre - 3x3 mean). Edges get
 * stronger while flat areas stay flat. Border pixels are left alone.
 */
export function applySharpen(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount: number,
): void {
  if (amount <= 0 || width < 3 || height < 3) return;
  const src = new Uint8ClampedArray(data);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        const centre = src[i + c];
        const mean =
          (src[i + c] +
            src[i - 4 + c] +
            src[i + 4 + c] +
            src[i - width * 4 + c] +
            src[i + width * 4 + c]) /
          5;
        data[i + c] = clampByte(centre + amount * (centre - mean));
      }
    }
  }
}

/** Run the full enhancement over raw RGBA pixels. Never mutates the input. */
export function enhancePixels(
  input: Uint8ClampedArray,
  width: number,
  height: number,
  opts: EnhanceOptions,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(input);
  if (opts.stretch) {
    const [lo, hi] = stretchLevels(data);
    applyLevels(data, lo, hi);
  }
  if (opts.gamma !== 1) applyGamma(data, opts.gamma);
  if (opts.sharpen > 0) applySharpen(data, width, height, opts.sharpen);
  return data;
}

/**
 * Browser wrapper: draw the photo (upscaling small ones, capping big
 * ones), enhance its pixels, and return a JPEG blob + data URL. The
 * caller replaces the photo with this result, so the preview and the
 * bytes sent to /api/extract stay the same image.
 */
export async function enhanceImageForReading(
  dataUrl: string,
  quality: PhotoQuality,
): Promise<{ dataUrl: string; blob: Blob; width: number; height: number }> {
  const img = await loadImage(dataUrl);
  const longEdge = Math.max(img.naturalWidth, img.naturalHeight);
  let scale = 1;
  if (longEdge < ENHANCE_MIN_EDGE) scale = 2;
  if (longEdge * scale > ENHANCE_MAX_EDGE) scale = ENHANCE_MAX_EDGE / longEdge;
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process this image.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const enhanced = enhancePixels(
    imageData.data,
    width,
    height,
    enhanceOptionsFor(quality),
  );
  const out = ctx.createImageData(width, height);
  out.data.set(enhanced);
  ctx.putImageData(out, 0, 0);
  const blob = await canvasToBlob(canvas);
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.92), blob, width, height };
}
