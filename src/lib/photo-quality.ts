/**
 * Client-side photo quality signals (Part B).
 *
 * Runs entirely in the browser on a small downscaled copy of the photo
 * (max ~256px on the long edge), so it is fast (<100ms) and never sends
 * anything anywhere. The scan page calls `analyzePhotoQuality` after
 * the user picks a photo and shows a gentle "retake for a better
 * result" warning when any flag is set — it never blocks the scan.
 *
 * The math lives in the pure function `computeQualityFromPixels` so it
 * can be unit-tested without a DOM/canvas; `analyzePhotoQuality` is
 * just a thin canvas wrapper around it.
 *
 * Thresholds (chosen for schedule photos: mostly dark text on a light
 * background, so a healthy photo is bright, contrasty and detailed):
 * - dark: mean luminance < 60 (0-255). A normal well-lit routine photo
 *   sits well above 150; below 60 the text is hard to read.
 * - blurry: variance of the Laplacian < 20 on the downscaled
 *   grayscale copy. A flat/uniform image scores 0; a sharp
 *   checkerboard or a page of text scores in the thousands. The bar
 *   is deliberately low so only near-flat / very soft photos warn.
 * - glare: more than 25% of pixels are near-white (luminance >= 245)
 *   AND the image is not uniformly near-white (median luminance
 *   below 220). A clean digital schedule has a white background, so
 *   most of its pixels are near-white — that is normal, not glare.
 *   Real glare is a blown-out patch against a darker photo, so the
 *   median stays low while a large fraction blows out.
 *
 * An unreadable image never throws: both entry points return the
 * "unknown" result instead (ok: false, unknown: true, all flags
 * false, all metrics 0).
 */

/** Long edge of the downscaled copy analysed by `analyzePhotoQuality`. */
export const PHOTO_QUALITY_MAX_EDGE = 256;

/** Mean luminance (0-255) below this counts as dark. */
export const DARK_LUMINANCE_THRESHOLD = 60;

/** Laplacian variance below this counts as blurry. */
export const BLUR_LAPLACIAN_VARIANCE_THRESHOLD = 20;

/** A pixel with luminance at or above this counts as blown-out white. */
export const GLARE_WHITE_THRESHOLD = 245;

/** Fraction of blown-out pixels above this counts as glare. */
export const GLARE_FRACTION_THRESHOLD = 0.25;

/**
 * Median luminance below this is required for a glare flag: a clean
 * digital schedule is uniformly near-white (median 255), so a high
 * bright fraction alone is normal paper, not flash blow-out.
 */
export const GLARE_MEDIAN_LUMINANCE_THRESHOLD = 220;

/** All thresholds in one object, for the scan page / tests. */
export const PHOTO_QUALITY_THRESHOLDS = {
  maxEdge: PHOTO_QUALITY_MAX_EDGE,
  darkLuminance: DARK_LUMINANCE_THRESHOLD,
  blurLaplacianVariance: BLUR_LAPLACIAN_VARIANCE_THRESHOLD,
  glareWhite: GLARE_WHITE_THRESHOLD,
  glareFraction: GLARE_FRACTION_THRESHOLD,
  glareMedianLuminance: GLARE_MEDIAN_LUMINANCE_THRESHOLD,
} as const;

export interface PhotoQuality {
  /** False when the image could not be read at all (see `unknown`). */
  ok: boolean;
  /** True when the image could not be read — all flags false, metrics 0. */
  unknown: boolean;
  /** Mean luminance below DARK_LUMINANCE_THRESHOLD. */
  dark: boolean;
  /** Laplacian variance below BLUR_LAPLACIAN_VARIANCE_THRESHOLD. */
  blurry: boolean;
  /** Blown-out pixels above GLARE_FRACTION_THRESHOLD of the frame. */
  glare: boolean;
  /** Average pixel luminance, 0 (black) to 255 (white). */
  meanLuminance: number;
  /** Median pixel luminance — guards the glare flag (see above). */
  medianLuminance: number;
  /** Variance of the Laplacian on the grayscale copy (sharpness). */
  laplacianVariance: number;
  /** Fraction of pixels with luminance >= GLARE_WHITE_THRESHOLD. */
  glareFraction: number;
}

/** The result returned for any unreadable image. Never throws. */
export const UNKNOWN_PHOTO_QUALITY: PhotoQuality = {
  ok: false,
  unknown: true,
  dark: false,
  blurry: false,
  glare: false,
  meanLuminance: 0,
  medianLuminance: 0,
  laplacianVariance: 0,
  glareFraction: 0,
};

export function unknownPhotoQuality(): PhotoQuality {
  return { ...UNKNOWN_PHOTO_QUALITY };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Pure quality analysis over raw RGBA pixels (as in `ImageData.data`:
 * 4 bytes per pixel, row-major). No DOM, no canvas — safe to call
 * anywhere, including tests. Returns the "unknown" result instead of
 * throwing on empty, truncated or mismatched pixel data.
 */
export function computeQualityFromPixels(
  data: ArrayLike<number>,
  width: number,
  height: number,
): PhotoQuality {
  try {
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      !data ||
      data.length < width * height * 4
    ) {
      return unknownPhotoQuality();
    }
    const count = width * height;
    const gray = new Float64Array(count);
    let sum = 0;
    let glareCount = 0;
    for (let i = 0; i < count; i += 1) {
      const r = data[i * 4] ?? 0;
      const g = data[i * 4 + 1] ?? 0;
      const b = data[i * 4 + 2] ?? 0;
      // Rec. 601 luma — matches how bright text on paper reads.
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      gray[i] = lum;
      sum += lum;
      if (lum >= GLARE_WHITE_THRESHOLD) glareCount += 1;
    }
    const meanLuminance = sum / count;
    const glareFraction = glareCount / count;

    // Median luminance: sorts a copy of the grayscale values. A clean
    // digital schedule is mostly pure-white background, so its median
    // sits at 255 — a high bright fraction there is normal paper, not
    // glare. Real glare is a blown-out patch on a darker photo, so
    // the median stays well below white.
    const sorted = Float64Array.from(gray).sort();
    const mid = Math.floor(count / 2);
    const medianLuminance =
      count % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

    // Variance of the Laplacian (3x3 cross kernel) on interior
    // pixels only — a cheap sharpness measure. Images smaller than
    // 3x3 have no interior pixels, so sharpness cannot be judged
    // and blurry stays false rather than warning on a tiny image.
    let laplacianVariance = 0;
    let blurry = false;
    if (width >= 3 && height >= 3) {
      const interior = (width - 2) * (height - 2);
      const laps = new Float64Array(interior);
      let lapSum = 0;
      let k = 0;
      for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
          const c = gray[y * width + x];
          const lap =
            gray[(y - 1) * width + x] +
            gray[(y + 1) * width + x] +
            gray[y * width + (x - 1)] +
            gray[y * width + (x + 1)] -
            4 * c;
          laps[k] = lap;
          lapSum += lap;
          k += 1;
        }
      }
      const lapMean = lapSum / interior;
      let sq = 0;
      for (let i = 0; i < interior; i += 1) {
        const d = laps[i] - lapMean;
        sq += d * d;
      }
      laplacianVariance = sq / interior;
      blurry = laplacianVariance < BLUR_LAPLACIAN_VARIANCE_THRESHOLD;
    }

    return {
      ok: true,
      unknown: false,
      dark: meanLuminance < DARK_LUMINANCE_THRESHOLD,
      blurry,
      glare:
        glareFraction > GLARE_FRACTION_THRESHOLD &&
        medianLuminance < GLARE_MEDIAN_LUMINANCE_THRESHOLD,
      meanLuminance: round1(meanLuminance),
      medianLuminance: round1(medianLuminance),
      laplacianVariance: round1(laplacianVariance),
      glareFraction: Math.round(glareFraction * 10000) / 10000,
    };
  } catch {
    return unknownPhotoQuality();
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read this image."));
    img.src = src;
  });
}

/**
 * Analyse a photo data URL (as produced by the scan page) and return
 * its quality signals. Downscales to at most PHOTO_QUALITY_MAX_EDGE
 * on the long edge first, so it stays fast. Never throws — any
 * failure (bad data URL, unreadable image, no canvas/DOM, e.g. in
 * tests or SSR) resolves to the "unknown" result.
 *
 * Trivially callable from a React component:
 *   const quality = await analyzePhotoQuality(dataUrl);
 *   if (quality.dark || quality.blurry || quality.glare) showWarning();
 */
export async function analyzePhotoQuality(dataUrl: string): Promise<PhotoQuality> {
  try {
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
      return unknownPhotoQuality();
    }
    if (typeof document === "undefined" || typeof Image === "undefined") {
      return unknownPhotoQuality();
    }
    const img = await loadImage(dataUrl);
    if (!img.naturalWidth || !img.naturalHeight) return unknownPhotoQuality();
    const scale = Math.min(
      1,
      PHOTO_QUALITY_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return unknownPhotoQuality();
    ctx.drawImage(img, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    return computeQualityFromPixels(imageData.data, width, height);
  } catch {
    return unknownPhotoQuality();
  }
}
