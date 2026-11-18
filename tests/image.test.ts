import { describe, expect, it, vi } from "vitest";
import {
  JPEG_QUALITY,
  MAX_IMAGE_BYTES,
  MAX_LONG_EDGE,
  computeDownscale,
  decideProcessing,
  getOrientationTransform,
  isHeicFile,
  parseImageDimensions,
  parseJpegExif,
  processImageFile,
  rotatedDimensions,
  validateImageFile,
} from "@/lib/image";

/* Minimal-JPEG bytes for the mocked heic2any conversion (800x600, no EXIF). */
const convertedJpegBytes = vi.hoisted(() => {
  const u16be = (v: number) => [(v >> 8) & 0xff, v & 0xff];
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, ...u16be(11), 8, ...u16be(600), ...u16be(800), 1, 1, 0x11, 0, 0xff, 0xd9,
  ]);
});

vi.mock("heic2any", () => ({
  default: vi.fn(async () => new Blob([convertedJpegBytes], { type: "image/jpeg" })),
}));

function u16le(v: number): number[] {
  return [v & 0xff, (v >> 8) & 0xff];
}
function u16be(v: number): number[] {
  return [(v >> 8) & 0xff, v & 0xff];
}
function u32le(v: number): number[] {
  return [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff];
}
function u32be(v: number): number[] {
  return [(v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

/** Minimal TIFF payload: optional orientation tag, optional GPS IFD. */
function buildTiff(opts: { littleEndian?: boolean; orientation?: number; gps?: boolean }): Uint8Array<ArrayBuffer> {
  const le = opts.littleEndian !== false;
  const u16 = le ? u16le : u16be;
  const u32 = le ? u32le : u32be;
  const n = (opts.orientation !== undefined ? 1 : 0) + (opts.gps ? 1 : 0);
  const gpsOffset = 8 + (2 + n * 12 + 4);
  const out: number[] = [
    ...(le ? [0x49, 0x49] : [0x4d, 0x4d]),
    ...u16(42),
    ...u32(8),
    ...u16(n),
  ];
  if (opts.orientation !== undefined) {
    // SHORT value lives in the first two bytes of the 4-byte value field.
    out.push(...u16(0x0112), ...u16(3), ...u32(1), ...u16(opts.orientation), 0, 0);
  }
  if (opts.gps) {
    out.push(...u16(0x8825), ...u16(4), ...u32(1), ...u32(gpsOffset));
  }
  out.push(...u32(0)); // next IFD
  if (opts.gps) {
    out.push(...u16(1)); // GPS IFD: one entry (GPSLatitudeRef "N")
    out.push(...u16(0x0001), ...u16(2), ...u32(2), 0x4e, 0x00, 0x00, 0x00);
    out.push(...u32(0));
  }
  return new Uint8Array(out);
}

/** Minimal JPEG: SOI, optional APP1 EXIF, SOF0 with the given dimensions. */
function buildJpeg(opts: { exif?: Uint8Array; width?: number; height?: number } = {}): Uint8Array<ArrayBuffer> {
  const width = opts.width ?? 1600;
  const height = opts.height ?? 1200;
  const out: number[] = [0xff, 0xd8];
  if (opts.exif) {
    out.push(0xff, 0xe1, ...u16be(2 + 6 + opts.exif.length), 0x45, 0x78, 0x69, 0x66, 0, 0, ...opts.exif);
  }
  out.push(0xff, 0xc0, ...u16be(11), 8, ...u16be(height), ...u16be(width), 1, 1, 0x11, 0);
  out.push(0xff, 0xd9);
  return new Uint8Array(out);
}

/** Minimal PNG: signature + IHDR only (enough for the header parser). */
function buildPng(width = 4, height = 3): Uint8Array<ArrayBuffer> {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...u32be(13), 0x49, 0x48, 0x44, 0x52,
    ...u32be(width), ...u32be(height),
    8, 2, 0, 0, 0, 0, 0, 0, 0,
  ]);
}

describe("image processing constants", () => {
  it("encodes JPEGs at 0.95 when a re-encode is unavoidable", () => {
    expect(JPEG_QUALITY).toBe(0.95);
  });

  it("keeps the 4000px long-edge cap and the 8 MB upload limit", () => {
    expect(MAX_LONG_EDGE).toBe(4000);
    expect(MAX_IMAGE_BYTES).toBe(8 * 1024 * 1024);
  });
});

describe("validateImageFile", () => {
  it("still reports tooLarge for files over 8 MB", () => {
    const file = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "big.jpg", { type: "image/jpeg" });
    expect(validateImageFile(file)).toBe("tooLarge");
  });

  it("rejects unsupported types and accepts JPEG/PNG/WEBP/HEIC", () => {
    expect(validateImageFile(new File([], "x.gif", { type: "image/gif" }))).toBe("unsupportedType");
    expect(validateImageFile(new File([], "x.jpg", { type: "image/jpeg" }))).toBeNull();
  });
});

describe("isHeicFile", () => {
  it("detects HEIC by type or extension", () => {
    expect(isHeicFile(new File([], "a.heic", { type: "application/octet-stream" }))).toBe(true);
    expect(isHeicFile(new File([], "a.jpg", { type: "image/heif" }))).toBe(true);
    expect(isHeicFile(new File([], "a.png", { type: "image/png" }))).toBe(false);
  });
});

describe("parseJpegExif", () => {
  it("reports no EXIF for a JPEG without an APP1 segment", () => {
    expect(parseJpegExif(buildJpeg())).toEqual({ hasExif: false, orientation: 1, hasGps: false });
  });

  it("reads a little-endian orientation tag (6 = rotate 90°)", () => {
    expect(parseJpegExif(buildJpeg({ exif: buildTiff({ orientation: 6 }) }))).toEqual({
      hasExif: true,
      orientation: 6,
      hasGps: false,
    });
  });

  it("reads a big-endian orientation tag", () => {
    expect(parseJpegExif(buildJpeg({ exif: buildTiff({ littleEndian: false, orientation: 3 }) }))).toEqual({
      hasExif: true,
      orientation: 3,
      hasGps: false,
    });
  });

  it("detects GPS data via the GPS IFD pointer", () => {
    expect(parseJpegExif(buildJpeg({ exif: buildTiff({ orientation: 1, gps: true }) }))).toEqual({
      hasExif: true,
      orientation: 1,
      hasGps: true,
    });
  });

  it("returns no EXIF for non-JPEG bytes and never throws on garbage", () => {
    expect(parseJpegExif(new Uint8Array([1, 2, 3, 4]))).toEqual({ hasExif: false, orientation: 1, hasGps: false });
    expect(parseJpegExif(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 10, 0x45, 0x78, 0x69, 0x66, 0, 0, 1, 2]))).toEqual({
      hasExif: false,
      orientation: 1,
      hasGps: false,
    });
  });
});

describe("parseImageDimensions", () => {
  it("reads JPEG SOF0 and PNG IHDR dimensions from headers alone", () => {
    expect(parseImageDimensions(buildJpeg({ width: 1600, height: 1200 }), "image/jpeg")).toEqual({
      width: 1600,
      height: 1200,
    });
    expect(parseImageDimensions(buildPng(4, 3), "image/png")).toEqual({ width: 4, height: 3 });
  });

  it("returns null for unreadable headers", () => {
    expect(parseImageDimensions(new Uint8Array([1, 2, 3]), "image/jpeg")).toBeNull();
  });
});

describe("computeDownscale", () => {
  it("downscales only enough to fit the 4000px long edge, keeping aspect ratio", () => {
    expect(computeDownscale(5000, 3000)).toEqual({ width: 4000, height: 2400, scale: 0.8, needsDownscale: true });
    expect(computeDownscale(8000, 100)).toEqual({ width: 4000, height: 50, scale: 0.5, needsDownscale: true });
  });

  it("leaves images at or under the cap untouched", () => {
    expect(computeDownscale(2000, 1200)).toEqual({ width: 2000, height: 1200, scale: 1, needsDownscale: false });
    expect(computeDownscale(4000, 4000)).toEqual({ width: 4000, height: 4000, scale: 1, needsDownscale: false });
  });
});

describe("getOrientationTransform", () => {
  it("is a no-op for orientation 1 and unknown values", () => {
    expect(getOrientationTransform(1)).toEqual({
      rotateDegrees: 0,
      flipHorizontal: false,
      flipVertical: false,
      swapDimensions: false,
    });
    expect(getOrientationTransform(99).rotateDegrees).toBe(0);
  });

  it("maps 6 to +90° and 8 to -90° with swapped dimensions", () => {
    expect(getOrientationTransform(6)).toEqual({
      rotateDegrees: 90,
      flipHorizontal: false,
      flipVertical: false,
      swapDimensions: true,
    });
    expect(getOrientationTransform(8).rotateDegrees).toBe(-90);
    expect(getOrientationTransform(8).swapDimensions).toBe(true);
  });

  it("maps 3 to 180° and 2 to a horizontal flip", () => {
    expect(getOrientationTransform(3).rotateDegrees).toBe(180);
    expect(getOrientationTransform(3).swapDimensions).toBe(false);
    expect(getOrientationTransform(2).flipHorizontal).toBe(true);
  });
});

describe("decideProcessing", () => {
  const base = { convertedFromHeic: false, orientation: 1, hasGps: false, size: 1000, width: 1600, height: 1200 };

  it("sends an ordinary photo as-is", () => {
    expect(decideProcessing(base)).toBe("as-is");
  });

  it("prioritises orientation over oversize and GPS (one re-encode fixes both)", () => {
    expect(decideProcessing({ ...base, orientation: 6, hasGps: true, width: 5000 })).toBe("orientation");
  });

  it("downscales files over 8 MB or with a long edge over 4000px", () => {
    expect(decideProcessing({ ...base, size: MAX_IMAGE_BYTES + 1 })).toBe("oversize");
    expect(decideProcessing({ ...base, width: 4001 })).toBe("oversize");
  });

  it("strips GPS even when the image would otherwise be as-is", () => {
    expect(decideProcessing({ ...base, hasGps: true })).toBe("exif-gps");
  });

  it("labels a converted HEIC file as heic, not as-is", () => {
    expect(decideProcessing({ ...base, convertedFromHeic: true })).toBe("heic");
  });
});

describe("processImageFile as-is path", () => {
  it("sends original PNG bytes untouched: same blob, same data URL, sentAsIs", async () => {
    const png = buildPng(4, 3);
    const file = new File([png], "routine.png", { type: "image/png" });
    const result = await processImageFile(file);
    expect(result.processing).toBe("as-is");
    expect(result.sentAsIs).toBe(true);
    expect(result.convertedFromHeic).toBe(false);
    expect(result.blob).toBe(file);
    expect(result.width).toBe(4);
    expect(result.height).toBe(3);
    expect(result.type).toBe("image/png");
    expect(result.dataUrl).toBe(`data:image/png;base64,${Buffer.from(png).toString("base64")}`);
  });

  it("sends an ordinary JPEG untouched", async () => {
    const jpeg = buildJpeg({ width: 1600, height: 1200 });
    const file = new File([jpeg], "photo.jpg", { type: "image/jpeg" });
    const result = await processImageFile(file);
    expect(result.processing).toBe("as-is");
    expect(result.sentAsIs).toBe(true);
    expect(result.dataUrl).toBe(`data:image/jpeg;base64,${Buffer.from(jpeg).toString("base64")}`);
    expect(result.width).toBe(1600);
    expect(result.height).toBe(1200);
  });

  it("keeps harmless EXIF (orientation 1, no GPS) and still sends as-is", async () => {
    const jpeg = buildJpeg({ exif: buildTiff({ orientation: 1 }) });
    const file = new File([jpeg], "photo.jpg", { type: "image/jpeg" });
    const result = await processImageFile(file);
    expect(result.processing).toBe("as-is");
    expect(result.sentAsIs).toBe(true);
  });
});

describe("processImageFile HEIC path", () => {
  it("converts HEIC (mocked heic2any) and never claims as-is", async () => {
    const file = new File([new Uint8Array([0, 0, 0, 0])], "photo.heic", { type: "image/heic" });
    const result = await processImageFile(file);
    expect(result.processing).toBe("heic");
    expect(result.convertedFromHeic).toBe(true);
    expect(result.sentAsIs).toBe(false);
    expect(result.type).toBe("image/jpeg");
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
    expect(result.dataUrl).toBe(`data:image/jpeg;base64,${Buffer.from(convertedJpegBytes).toString("base64")}`);
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
