import { describe, expect, it } from "vitest";
import {
  analyzePhotoQuality,
  BLUR_LAPLACIAN_VARIANCE_THRESHOLD,
  computeQualityFromPixels,
  DARK_LUMINANCE_THRESHOLD,
  GLARE_FRACTION_THRESHOLD,
  GLARE_WHITE_THRESHOLD,
  PHOTO_QUALITY_MAX_EDGE,
  PHOTO_QUALITY_THRESHOLDS,
  UNKNOWN_PHOTO_QUALITY,
} from "@/lib/photo-quality";

/**
 * Part B tests — the math is tested directly on synthetic pixel
 * arrays via the pure `computeQualityFromPixels` (the test env is
 * Node, with no DOM/canvas). `analyzePhotoQuality` is covered by its
 * never-throw behaviour on unreadable input.
 */

/** Build an RGBA pixel array: fn(x, y) -> [r, g, b]. */
function makePixels(
  width: number,
  height: number,
  fn: (x: number, y: number) => [number, number, number],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = fn(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return data;
}

const flat = (v: number) => () => [v, v, v] as [number, number, number];

describe("thresholds", () => {
  it("exports sane, documented thresholds", () => {
    expect(PHOTO_QUALITY_MAX_EDGE).toBe(256);
    expect(DARK_LUMINANCE_THRESHOLD).toBe(60);
    expect(BLUR_LAPLACIAN_VARIANCE_THRESHOLD).toBe(20);
    expect(GLARE_WHITE_THRESHOLD).toBe(245);
    expect(GLARE_FRACTION_THRESHOLD).toBe(0.25);
    expect(PHOTO_QUALITY_THRESHOLDS.darkLuminance).toBe(DARK_LUMINANCE_THRESHOLD);
    expect(PHOTO_QUALITY_THRESHOLDS.glareFraction).toBe(GLARE_FRACTION_THRESHOLD);
  });
});

describe("computeQualityFromPixels — dark vs bright", () => {
  it("flags a very dark photo (mean luminance ~20) as dark", () => {
    const q = computeQualityFromPixels(makePixels(16, 16, flat(20)), 16, 16);
    expect(q.ok).toBe(true);
    expect(q.unknown).toBe(false);
    expect(q.dark).toBe(true);
    expect(q.meanLuminance).toBeCloseTo(20, 0);
  });

  it("does not flag a bright photo (mean luminance ~200) as dark", () => {
    const q = computeQualityFromPixels(makePixels(16, 16, flat(200)), 16, 16);
    expect(q.dark).toBe(false);
    expect(q.glare).toBe(false);
    expect(q.meanLuminance).toBeCloseTo(200, 0);
  });

  it("draws the dark line at the documented threshold", () => {
    expect(
      computeQualityFromPixels(makePixels(8, 8, flat(DARK_LUMINANCE_THRESHOLD - 1)), 8, 8).dark,
    ).toBe(true);
    expect(
      computeQualityFromPixels(makePixels(8, 8, flat(DARK_LUMINANCE_THRESHOLD + 1)), 8, 8).dark,
    ).toBe(false);
  });
});

describe("computeQualityFromPixels — blurry vs sharp", () => {
  it("flags a uniform flat image (zero Laplacian variance) as blurry", () => {
    const q = computeQualityFromPixels(makePixels(16, 16, flat(128)), 16, 16);
    expect(q.blurry).toBe(true);
    expect(q.laplacianVariance).toBe(0);
  });

  it("does not flag a sharp checkerboard as blurry", () => {
    const q = computeQualityFromPixels(
      makePixels(16, 16, (x, y) => ((x + y) % 2 === 0 ? [0, 0, 0] : [255, 255, 255])),
      16,
      16,
    );
    expect(q.blurry).toBe(false);
    expect(q.laplacianVariance).toBeGreaterThan(1000);
  });

  it("does not flag a sharp black/white edge as blurry", () => {
    const q = computeQualityFromPixels(
      makePixels(16, 16, (x) => (x < 8 ? [0, 0, 0] : [255, 255, 255])),
      16,
      16,
    );
    expect(q.blurry).toBe(false);
    expect(q.laplacianVariance).toBeGreaterThan(BLUR_LAPLACIAN_VARIANCE_THRESHOLD);
  });

  it("does not warn about sharpness for a tiny image with no interior pixels", () => {
    const q = computeQualityFromPixels(makePixels(2, 2, flat(128)), 2, 2);
    expect(q.ok).toBe(true);
    expect(q.blurry).toBe(false);
    expect(q.laplacianVariance).toBe(0);
  });
});

describe("computeQualityFromPixels — glare vs normal", () => {
  it("flags a photo that is half blown-out white as glare", () => {
    const q = computeQualityFromPixels(
      makePixels(16, 16, (x) => (x < 8 ? [255, 255, 255] : [128, 128, 128])),
      16,
      16,
    );
    expect(q.glare).toBe(true);
    expect(q.glareFraction).toBeCloseTo(0.5, 2);
  });

  it("does not flag a normal photo with a small white patch as glare", () => {
    const q = computeQualityFromPixels(
      makePixels(16, 16, (x, y) => (x < 4 && y < 4 ? [255, 255, 255] : [128, 128, 128])),
      16,
      16,
    );
    expect(q.glare).toBe(false);
    expect(q.glareFraction).toBeCloseTo(16 / 256, 2);
  });

  it("does not count near-white (240) as blown-out", () => {
    const q = computeQualityFromPixels(makePixels(8, 8, flat(240)), 8, 8);
    expect(q.glare).toBe(false);
    expect(q.glareFraction).toBe(0);
  });

  it("does not flag a clean digital schedule (mostly white background) as glare", () => {
    // A digital routine table: ~69% pure-white background, the rest
    // dark text — the median is white, so the bright fraction is
    // normal paper, not a flash blow-out. (This is the user's real
    // DIU routine photo: median 255, 64% of pixels >= 245.)
    const q = computeQualityFromPixels(
      makePixels(16, 16, (x) => (x < 11 ? [255, 255, 255] : [30, 30, 30])),
      16,
      16,
    );
    expect(q.glareFraction).toBeCloseTo(11 / 16, 2);
    expect(q.medianLuminance).toBe(255);
    expect(q.glare).toBe(false);
  });

  it("still flags a blown-out patch on a darker photo as glare", () => {
    // Half the frame blown white, half mid-gray: the median stays
    // low (191.5), so this is a real glare patch, not white paper.
    const q = computeQualityFromPixels(
      makePixels(16, 16, (x) => (x < 8 ? [255, 255, 255] : [128, 128, 128])),
      16,
      16,
    );
    expect(q.medianLuminance).toBeCloseTo(191.5, 1);
    expect(q.glare).toBe(true);
  });
});

describe("unknown / unreadable input never throws", () => {
  it("returns the unknown result for empty, truncated or mismatched pixels", () => {
    for (const bad of [
      computeQualityFromPixels(new Uint8ClampedArray(0), 0, 0),
      computeQualityFromPixels(new Uint8ClampedArray(4), 4, 4),
      computeQualityFromPixels(makePixels(4, 4, flat(128)), 8, 8),
      computeQualityFromPixels(makePixels(4, 4, flat(128)), -1, 4),
    ]) {
      expect(bad).toEqual(UNKNOWN_PHOTO_QUALITY);
      expect(bad.ok).toBe(false);
      expect(bad.unknown).toBe(true);
      expect(bad.dark).toBe(false);
      expect(bad.blurry).toBe(false);
      expect(bad.glare).toBe(false);
    }
  });

  it("analyzePhotoQuality resolves to unknown — never throws — on garbage input", async () => {
    for (const badInput of [
      "",
      "not-a-data-url",
      "data:image/jpeg;base64,!!!not-base64!!!",
      "data:text/plain;base64,aGVsbG8=",
    ]) {
      await expect(analyzePhotoQuality(badInput)).resolves.toEqual(UNKNOWN_PHOTO_QUALITY);
    }
  });

  it("analyzePhotoQuality returns unknown with no DOM (Node test env)", async () => {
    // A well-formed data URL still cannot be decoded without a
    // browser Image/canvas, so it must resolve unknown, not throw.
    const tinyPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    await expect(analyzePhotoQuality(tinyPng)).resolves.toEqual(UNKNOWN_PHOTO_QUALITY);
  });
});
