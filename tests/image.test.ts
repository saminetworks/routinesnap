import { describe, expect, it } from "vitest";
import { JPEG_QUALITY, MAX_IMAGE_BYTES, MAX_LONG_EDGE, rotatedDimensions } from "@/lib/image";

describe("image processing constants", () => {
  it("encodes JPEGs at 0.92 so small time text stays legible", () => {
    expect(JPEG_QUALITY).toBe(0.92);
  });

  it("keeps the 2000px long-edge cap and the 8 MB upload limit", () => {
    expect(MAX_LONG_EDGE).toBe(2000);
    expect(MAX_IMAGE_BYTES).toBe(8 * 1024 * 1024);
  });
});

describe("rotatedDimensions", () => {
  it("swaps width and height for a ±90° rotation", () => {
    // A landscape routine photo (2000x1200) rotated sideways is portrait.
    expect(rotatedDimensions(2000, 1200, 90)).toEqual({ width: 1200, height: 2000 });
    expect(rotatedDimensions(2000, 1200, -90)).toEqual({ width: 1200, height: 2000 });
  });

  it("keeps width and height for a 180° rotation", () => {
    expect(rotatedDimensions(2000, 1200, 180)).toEqual({ width: 2000, height: 1200 });
  });
});
