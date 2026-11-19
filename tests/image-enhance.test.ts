import { describe, expect, it } from "vitest";
import {
  applyGamma,
  applyLevels,
  applySharpen,
  enhanceOptionsFor,
  enhancePixels,
  shouldEnhance,
  stretchLevels,
} from "@/lib/image-enhance";
import type { PhotoQuality } from "@/lib/photo-quality";

function rgba(values: number[]): Uint8ClampedArray {
  // One gray pixel per value (R=G=B=value, A=255).
  const out = new Uint8ClampedArray(values.length * 4);
  values.forEach((v, i) => {
    out[i * 4] = v;
    out[i * 4 + 1] = v;
    out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  });
  return out;
}

const clean: PhotoQuality = {
  ok: true,
  unknown: false,
  dark: false,
  blurry: false,
  glare: false,
  meanLuminance: 200,
  medianLuminance: 255,
  laplacianVariance: 500,
  glareFraction: 0.6,
};

describe("stretchLevels / applyLevels", () => {
  it("finds the 1st–99th percentile range and stretches it to full contrast", () => {
    const data = rgba([100, 110, 120, 130, 140, 150]);
    const [lo, hi] = stretchLevels(data);
    expect(lo).toBeGreaterThanOrEqual(99);
    expect(hi).toBeLessThanOrEqual(151);
    applyLevels(data, lo, hi);
    expect(data[0]).toBe(0); // darkest -> black
    expect(data[(6 - 1) * 4]).toBe(255); // brightest -> white
  });

  it("leaves an already full-range photo alone", () => {
    const data = rgba([0, 128, 255]);
    const [lo, hi] = stretchLevels(data);
    applyLevels(data, lo, hi);
    expect(data[0]).toBe(0);
    expect(data[4]).toBe(128);
    expect(data[8]).toBe(255);
  });
});

describe("applyGamma", () => {
  it("lifts dark mid-tones without moving black or white", () => {
    const data = rgba([0, 64, 128, 255]);
    applyGamma(data, 1.8);
    expect(data[0]).toBe(0);
    expect(data[4]).toBeGreaterThan(64);
    expect(data[8]).toBeGreaterThan(128);
    expect(data[12]).toBe(255);
  });
});

describe("applySharpen", () => {
  it("strengthens a step edge and leaves flat areas alone", () => {
    // 5x1 strip: dark, dark, bright, bright, bright — sharpen the edge.
    const row = [20, 20, 20, 200, 200];
    const data = new Uint8ClampedArray(5 * 3 * 4);
    for (let y = 0; y < 3; y += 1) {
      row.forEach((v, x) => {
        const i = (y * 5 + x) * 4;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      });
    }
    const before = new Uint8ClampedArray(data);
    applySharpen(data, 5, 3, 1);
    // The bright pixel next to the edge gets brighter (edge enhanced).
    expect(data[(1 * 5 + 3) * 4]).toBeGreaterThan(before[(1 * 5 + 3) * 4]);
    // A flat-area pixel far from the edge is unchanged.
    expect(data[(1 * 5 + 4) * 4]).toBe(before[(1 * 5 + 4) * 4]);
  });
});

describe("enhancePixels", () => {
  it("does not mutate its input and returns enhanced pixels", () => {
    const input = rgba([90, 100, 110, 120]);
    const out = enhancePixels(input, 2, 2, { stretch: true, gamma: 1.8, sharpen: 0.5 });
    expect(out).not.toBe(input);
    expect(input[0]).toBe(90);
    expect(out[0]).not.toBe(90);
  });
});

describe("shouldEnhance / enhanceOptionsFor", () => {
  it("enhances only when a quality flag is set", () => {
    expect(shouldEnhance(clean)).toBe(false);
    expect(shouldEnhance({ ...clean, dark: true })).toBe(true);
    expect(shouldEnhance({ ...clean, blurry: true })).toBe(true);
    expect(shouldEnhance({ ...clean, glare: true })).toBe(true);
    expect(shouldEnhance({ ...clean, ok: false, unknown: true })).toBe(false);
    expect(shouldEnhance(null)).toBe(false);
  });

  it("lifts brightness for dark photos and sharpens blurry ones", () => {
    expect(enhanceOptionsFor({ ...clean, dark: true }).gamma).toBe(1.8);
    expect(enhanceOptionsFor({ ...clean, blurry: true }).sharpen).toBe(0.9);
    expect(enhanceOptionsFor(clean).gamma).toBe(1);
  });
});
