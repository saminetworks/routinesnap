/**
 * Client-side image utilities (spec §7, §11).
 * Everything here runs in the browser only.
 *
 * Minimal pipeline — the photo sent to the AI stays exactly as the user
 * sent it whenever possible:
 * - JPEG/PNG/WEBP under 8 MB, long edge ≤ 4000px, EXIF orientation 1 and
 *   no GPS data → the ORIGINAL bytes are uploaded untouched: no resize,
 *   no re-encode, no EXIF stripping (harmless EXIF such as orientation 1
 *   or a camera model is left alone).
 * - HEIC/HEIF → converted with heic2any before anything else.
 * - EXIF orientation ≠ 1 → pixels are normalised exactly once
 *   (createImageBitmap with imageOrientation "from-image" where available,
 *   otherwise a raw bitmap + one manual canvas transform; as a last resort
 *   an <img> draw, which modern browsers already orient — never a
 *   rotation on top of an already-oriented decode).
 * - File over 8 MB or long edge > 4000px → downscaled only enough to fit
 *   (long edge ≤ 4000px AND output ≤ 8 MB), JPEG quality 0.95.
 * - EXIF containing GPS data → a single JPEG re-encode at quality 0.95
 *   to strip it, even if the image would otherwise be sent as-is.
 * The `processing` field on ProcessedImage records which path was taken.
 * No image data ever leaves the browser in Step 3 (mock extractor).
 */

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
/** Long-edge cap for the as-is path (and the downscale target). */
export const MAX_LONG_EDGE = 4000;
/** JPEG encode quality for the rare paths that must re-encode. */
export const JPEG_QUALITY = 0.95;

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
export const ACCEPTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];

/** How the image was sent to the AI. Exactly one of these applies. */
export type ProcessingKind = "as-is" | "heic" | "orientation" | "oversize" | "exif-gps" | "enhanced";

export interface ProcessedImage {
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
  name: string;
  type: string;
  /** True when a HEIC file was converted. */
  convertedFromHeic: boolean;
  /** True only when the original file bytes were uploaded untouched. */
  sentAsIs: boolean;
  /** Which pipeline path produced this image. */
  processing: ProcessingKind;
}

export function isHeicFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    lower.endsWith(".heic") ||
    lower.endsWith(".heif")
  );
}

export function validateImageFile(file: File): string | null {
  if (file.size > MAX_IMAGE_BYTES) return "tooLarge";
  const lower = file.name.toLowerCase();
  const typeOk = ACCEPTED_TYPES.includes(file.type);
  const extOk = ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
  if (!typeOk && !extOk) return "unsupportedType";
  return null;
}

/* ------------------------------------------------------------------ */
/* Pure helpers (no DOM/canvas): unit-testable in Node.                */
/* ------------------------------------------------------------------ */

export interface ExifInfo {
  /** An EXIF segment was found and parsed. */
  hasExif: boolean;
  /** EXIF orientation tag (1 = normal); 1 when absent. */
  orientation: number;
  /** A GPS IFD is present (location data). */
  hasGps: boolean;
}

const NO_EXIF: ExifInfo = { hasExif: false, orientation: 1, hasGps: false };

const TIFF_TYPE_SIZES: Record<number, number> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  7: 1, // UNDEFINED
  9: 4, // SLONG
  10: 8, // SRATIONAL
};

function readTiffValue(
  view: DataView,
  tiffStart: number,
  type: number,
  count: number,
  valueFieldOffset: number,
  littleEndian: boolean,
): number {
  const size = TIFF_TYPE_SIZES[type];
  if (!size || count < 1) return 0;
  // Values up to 4 bytes live inline in the value field; longer values
  // live at the offset stored in the value field.
  const offset = size * count <= 4 ? valueFieldOffset : view.getUint32(valueFieldOffset, littleEndian);
  const absolute = tiffStart + offset;
  if (absolute < 0 || absolute + size > view.byteLength) return 0;
  if (type === 3) return view.getUint16(absolute, littleEndian);
  if (type === 4 || type === 9) return view.getUint32(absolute, littleEndian);
  if (type === 1 || type === 2 || type === 7) return view.getUint8(absolute);
  return 0;
}

/**
 * Parse a TIFF header (the payload of a JPEG APP1, PNG eXIf or WEBP EXIF
 * chunk). Never throws: malformed data yields NO_EXIF.
 */
export function parseTiffExif(tiff: Uint8Array): ExifInfo {
  try {
    if (tiff.length < 8) return NO_EXIF;
    const littleEndian = tiff[0] === 0x49 && tiff[1] === 0x49; // "II"
    const bigEndian = tiff[0] === 0x4d && tiff[1] === 0x4d; // "MM"
    if (!littleEndian && !bigEndian) return NO_EXIF;
    const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
    if (view.getUint16(2, littleEndian) !== 42) return NO_EXIF;
    const ifd0Offset = view.getUint32(4, littleEndian);
    if (ifd0Offset < 8 || ifd0Offset + 2 > tiff.length) return NO_EXIF;

    const readIfd = (offset: number): Map<number, number> => {
      const entries = new Map<number, number>();
      if (offset < 0 || offset + 2 > tiff.length) return entries;
      const count = view.getUint16(offset, littleEndian);
      for (let i = 0; i < count; i++) {
        const entry = offset + 2 + i * 12;
        if (entry + 12 > tiff.length) break;
        const tag = view.getUint16(entry, littleEndian);
        const type = view.getUint16(entry + 2, littleEndian);
        const entryCount = view.getUint32(entry + 4, littleEndian);
        entries.set(tag, readTiffValue(view, 0, type, entryCount, entry + 8, littleEndian));
      }
      return entries;
    };

    const ifd0 = readIfd(ifd0Offset);
    const orientation = ifd0.get(0x0112) ?? 1;
    let hasGps = false;
    const gpsOffset = ifd0.get(0x8825);
    if (gpsOffset !== undefined && gpsOffset > 0) {
      // A GPS IFD with at least one entry means location data is present.
      hasGps = readIfd(gpsOffset).size > 0;
    }
    return { hasExif: true, orientation, hasGps };
  } catch {
    return NO_EXIF;
  }
}

/**
 * Parse the JPEG APP1 EXIF segment (tiny parser, no dependency).
 * Returns orientation 1 / no GPS when there is no EXIF.
 */
export function parseJpegExif(bytes: Uint8Array): ExifInfo {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return NO_EXIF;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return NO_EXIF;
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break; // EOI / SOS: no more metadata
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) break;
    if (marker === 0xe1) {
      // APP1: "Exif\0\0" + TIFF header.
      const dataStart = offset + 4;
      if (
        length >= 8 &&
        bytes[dataStart] === 0x45 && // E
        bytes[dataStart + 1] === 0x78 && // x
        bytes[dataStart + 2] === 0x69 && // i
        bytes[dataStart + 3] === 0x66 && // f
        bytes[dataStart + 4] === 0 &&
        bytes[dataStart + 5] === 0
      ) {
        return parseTiffExif(bytes.slice(dataStart + 6, offset + 2 + length));
      }
      return NO_EXIF;
    }
    offset += 2 + length;
  }
  return NO_EXIF;
}

/** EXIF (orientation + GPS) for JPEG, PNG (eXIf chunk) and WEBP (EXIF chunk). */
export function parseImageExif(bytes: Uint8Array, mimeType: string): ExifInfo {
  if (mimeType === "image/jpeg") return parseJpegExif(bytes);
  if (mimeType === "image/png") {
    // PNG: 8-byte signature, then length + type + data + CRC chunks.
    let offset = 8;
    while (offset + 8 <= bytes.length) {
      const length =
        (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
      const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
      if (type === "eXIf") return parseTiffExif(bytes.slice(offset + 8, offset + 8 + length));
      if (type === "IEND") break;
      offset += 12 + length;
    }
    return NO_EXIF;
  }
  if (mimeType === "image/webp") {
    // RIFF....WEBP, then size + type + data chunks (padded to even sizes).
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const length = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
      const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
      if (type === "EXIF") {
        const data = bytes.slice(offset + 8, offset + 8 + length);
        // Some writers prefix the TIFF with "Exif\0\0".
        const start =
          data.length >= 6 && data[0] === 0x45 && data[1] === 0x78 && data[2] === 0x69 && data[3] === 0x66 ? 6 : 0;
        return parseTiffExif(data.slice(start));
      }
      offset += 8 + length + (length % 2);
    }
    return NO_EXIF;
  }
  return NO_EXIF;
}

function u16be(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function u32be(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
}

/**
 * Image dimensions from the file header alone (no decode, no canvas).
 * JPEG (SOF), PNG (IHDR) and WEBP (VP8X / VP8L / lossy VP8). Returns null
 * when the header cannot be read; the caller then decodes to measure.
 */
export function parseImageDimensions(bytes: Uint8Array, mimeType: string): { width: number; height: number } | null {
  try {
    if (mimeType === "image/png") {
      if (bytes.length < 24 || u32be(bytes, 16) === 0) return null;
      return { width: u32be(bytes, 16), height: u32be(bytes, 20) };
    }
    if (mimeType === "image/jpeg") {
      let offset = 2;
      while (offset + 4 <= bytes.length) {
        if (bytes[offset] !== 0xff) return null;
        const marker = bytes[offset + 1];
        if (marker === 0xd9 || marker === 0xda) return null;
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          offset += 2;
          continue;
        }
        const length = u16be(bytes, offset + 2);
        if (length < 2 || offset + 2 + length > bytes.length) return null;
        // SOF0/1/2 (not SOF4 DHT, SOF8 JPG, SOFC DNL).
        if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
          return { height: u16be(bytes, offset + 5), width: u16be(bytes, offset + 7) };
        }
        offset += 2 + length;
      }
      return null;
    }
    if (mimeType === "image/webp") {
      if (bytes.length < 12) return null;
      let offset = 12;
      while (offset + 8 <= bytes.length) {
        const length = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
        const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
        const data = offset + 8;
        if (type === "VP8X" && data + 10 <= bytes.length) {
          return {
            width: (bytes[data + 4] | (bytes[data + 5] << 8) | (bytes[data + 6] << 16)) + 1,
            height: (bytes[data + 7] | (bytes[data + 8] << 8) | (bytes[data + 9] << 16)) + 1,
          };
        }
        if (type === "VP8L" && data + 5 <= bytes.length) {
          const bits = bytes[data + 1] | (bytes[data + 2] << 8) | (bytes[data + 3] << 16) | (bytes[data + 4] << 24);
          return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
        }
        if (type === "VP8 " && data + 10 <= bytes.length) {
          const width = bytes[data + 6] | ((bytes[data + 7] & 0x3f) << 8);
          const height = bytes[data + 8] | ((bytes[data + 9] & 0x3f) << 8);
          if (width > 0 && height > 0) return { width, height };
        }
        offset += 8 + length + (length % 2);
      }
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Scale that fits width×height inside maxLongEdge, preserving aspect ratio. */
export function computeDownscale(
  width: number,
  height: number,
  maxLongEdge: number = MAX_LONG_EDGE,
): { width: number; height: number; scale: number; needsDownscale: boolean } {
  const scale = Math.min(1, maxLongEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
    needsDownscale: scale < 1,
  };
}

export interface OrientationTransform {
  rotateDegrees: 0 | 90 | -90 | 180;
  flipHorizontal: boolean;
  flipVertical: boolean;
  /** True when the output dimensions are swapped (orientations 5–8). */
  swapDimensions: boolean;
}

/** Canvas transform that normalises one EXIF orientation value. */
export function getOrientationTransform(orientation: number): OrientationTransform {
  switch (orientation) {
    case 2:
      return { rotateDegrees: 0, flipHorizontal: true, flipVertical: false, swapDimensions: false };
    case 3:
      return { rotateDegrees: 180, flipHorizontal: false, flipVertical: false, swapDimensions: false };
    case 4:
      return { rotateDegrees: 0, flipHorizontal: false, flipVertical: true, swapDimensions: false };
    case 5:
      return { rotateDegrees: 90, flipHorizontal: true, flipVertical: false, swapDimensions: true };
    case 6:
      return { rotateDegrees: 90, flipHorizontal: false, flipVertical: false, swapDimensions: true };
    case 7:
      return { rotateDegrees: -90, flipHorizontal: true, flipVertical: false, swapDimensions: true };
    case 8:
      return { rotateDegrees: -90, flipHorizontal: false, flipVertical: false, swapDimensions: true };
    default:
      return { rotateDegrees: 0, flipHorizontal: false, flipVertical: false, swapDimensions: false };
  }
}

/**
 * Pure pipeline decision, in priority order: orientation is fixed first
 * (its re-encode also strips GPS), then oversize, then GPS stripping,
 * then HEIC-only, then as-is.
 */
export function decideProcessing(input: {
  convertedFromHeic: boolean;
  orientation: number;
  hasGps: boolean;
  size: number;
  width: number;
  height: number;
  // "enhanced" is a separate post-upload step (see image-enhance.ts),
  // never a decision of the upload pipeline.
}): Exclude<ProcessingKind, "enhanced"> {
  if (input.orientation !== 1) return "orientation";
  if (input.size > MAX_IMAGE_BYTES || Math.max(input.width, input.height) > MAX_LONG_EDGE) return "oversize";
  if (input.hasGps) return "exif-gps";
  if (input.convertedFromHeic) return "heic";
  return "as-is";
}

/* ------------------------------------------------------------------ */
/* Browser-only helpers (canvas / Image / FileReader-free).            */
/* ------------------------------------------------------------------ */

/** Shared by image-enhance.ts so enhancement reuses the same decode path. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read this image."));
    img.src = src;
  });
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

/** Shared by image-enhance.ts so enhancement reuses the same encode path. */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not process this image."))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

function makeResult(
  blob: Blob,
  dataUrl: string,
  width: number,
  height: number,
  name: string,
  type: string,
  convertedFromHeic: boolean,
  processing: ProcessingKind,
): ProcessedImage {
  return {
    dataUrl,
    blob,
    width,
    height,
    name,
    type,
    convertedFromHeic,
    sentAsIs: processing === "as-is",
    processing,
  };
}

/**
 * Normalise EXIF orientation exactly once. Preferred path: the browser
 * applies the orientation when decoding (imageOrientation "from-image"),
 * so the bitmap is already upright and is drawn as-is. Fallback: decode
 * raw pixels ("none") and apply the single transform from
 * getOrientationTransform. Last resort: draw an <img>, which modern
 * browsers also decode already-oriented — drawn with no extra transform,
 * so orientation is never applied twice in any path. The output JPEG
 * carries no EXIF, so nothing can re-apply it later.
 */
async function normaliseOrientation(
  blob: Blob,
  bytes: Uint8Array,
  width: number,
  height: number,
  name: string,
  convertedFromHeic: boolean,
): Promise<ProcessedImage> {
  const orientation = parseImageExif(bytes, blob.type).orientation;
  const transform = getOrientationTransform(orientation);
  const outWidth = transform.swapDimensions ? height : width;
  const outHeight = transform.swapDimensions ? width : height;

  const createBitmap = (
    globalThis as unknown as {
      createImageBitmap?: (
        blob: Blob,
        options?: { imageOrientation?: "none" | "from-image" },
      ) => Promise<ImageBitmap>;
    }
  ).createImageBitmap;

  const finish = async (canvas: HTMLCanvasElement, w: number, h: number): Promise<ProcessedImage> => {
    const outBlob = await canvasToBlob(canvas);
    return makeResult(outBlob, bytesToDataUrl(new Uint8Array(await outBlob.arrayBuffer()), "image/jpeg"), w, h, name, "image/jpeg", convertedFromHeic, "orientation");
  };

  if (createBitmap) {
    try {
      const bitmap = await createBitmap(blob, { imageOrientation: "from-image" });
      try {
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas is not available in this browser.");
        ctx.drawImage(bitmap, 0, 0);
        return await finish(canvas, bitmap.width, bitmap.height);
      } finally {
        bitmap.close();
      }
    } catch {
      // Fall through to the raw-pixels path.
    }
    try {
      const bitmap = await createBitmap(blob, { imageOrientation: "none" });
      try {
        const canvas = document.createElement("canvas");
        canvas.width = outWidth;
        canvas.height = outHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas is not available in this browser.");
        ctx.translate(outWidth / 2, outHeight / 2);
        ctx.rotate((transform.rotateDegrees * Math.PI) / 180);
        ctx.scale(transform.flipHorizontal ? -1 : 1, transform.flipVertical ? -1 : 1);
        ctx.drawImage(bitmap, -width / 2, -height / 2, width, height);
        return await finish(canvas, outWidth, outHeight);
      } finally {
        bitmap.close();
      }
    } catch {
      // Fall through to the <img> path.
    }
  }

  // Last resort: <img> decodes already-oriented in modern browsers.
  const img = await loadImage(bytesToDataUrl(bytes, blob.type));
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.drawImage(img, 0, 0);
  return finish(canvas, img.naturalWidth, img.naturalHeight);
}

/** Downscale only enough to fit: long edge ≤ 4000px and output ≤ 8 MB. */
async function downscaleToFit(
  blob: Blob,
  bytes: Uint8Array,
  width: number,
  height: number,
  name: string,
  convertedFromHeic: boolean,
): Promise<ProcessedImage> {
  const img = await loadImage(bytesToDataUrl(bytes, blob.type));
  // Orientation ≠ 1 never reaches this branch, so the header dimensions
  // agree with the decoded image; use them for the downscale target.
  let dims = computeDownscale(width, height);
  let outBlob: Blob | null = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const canvas = document.createElement("canvas");
    canvas.width = dims.width;
    canvas.height = dims.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available in this browser.");
    ctx.drawImage(img, 0, 0, dims.width, dims.height);
    outBlob = await canvasToBlob(canvas);
    if (outBlob.size <= MAX_IMAGE_BYTES) break;
    dims = {
      width: Math.max(1, Math.round(dims.width * 0.85)),
      height: Math.max(1, Math.round(dims.height * 0.85)),
      scale: dims.scale * 0.85,
      needsDownscale: true,
    };
  }
  if (!outBlob) throw new Error("Could not process this image.");
  return makeResult(
    outBlob,
    bytesToDataUrl(new Uint8Array(await outBlob.arrayBuffer()), "image/jpeg"),
    dims.width,
    dims.height,
    name,
    "image/jpeg",
    convertedFromHeic,
    "oversize",
  );
}

/** Single JPEG re-encode at quality 0.95: drops all EXIF (incl. GPS). */
async function stripExif(
  blob: Blob,
  bytes: Uint8Array,
  width: number,
  height: number,
  name: string,
  convertedFromHeic: boolean,
): Promise<ProcessedImage> {
  const img = await loadImage(bytesToDataUrl(bytes, blob.type));
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.drawImage(img, 0, 0);
  const outBlob = await canvasToBlob(canvas);
  // Orientation is 1 on this branch, so decoded size equals header size.
  return makeResult(
    outBlob,
    bytesToDataUrl(new Uint8Array(await outBlob.arrayBuffer()), "image/jpeg"),
    width,
    height,
    name,
    "image/jpeg",
    convertedFromHeic,
    "exif-gps",
  );
}

async function processBlob(blob: Blob, name: string, convertedFromHeic: boolean): Promise<ProcessedImage> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const type = blob.type || "image/jpeg";
  const exif = parseImageExif(bytes, type);
  let dims = parseImageDimensions(bytes, type);
  if (!dims) {
    // Header unreadable: decode once to measure (browser only).
    const img = await loadImage(bytesToDataUrl(bytes, type));
    dims = { width: img.naturalWidth, height: img.naturalHeight };
  }
  const kind = decideProcessing({
    convertedFromHeic,
    orientation: exif.orientation,
    hasGps: exif.hasGps,
    size: blob.size,
    width: dims.width,
    height: dims.height,
  });
  switch (kind) {
    case "orientation":
      return normaliseOrientation(blob, bytes, dims.width, dims.height, name, convertedFromHeic);
    case "oversize":
      return downscaleToFit(blob, bytes, dims.width, dims.height, name, convertedFromHeic);
    case "exif-gps":
      return stripExif(blob, bytes, dims.width, dims.height, name, convertedFromHeic);
    case "heic":
      return makeResult(blob, bytesToDataUrl(bytes, type), dims.width, dims.height, name, type, true, "heic");
    case "as-is":
      return makeResult(blob, bytesToDataUrl(bytes, type), dims.width, dims.height, name, type, false, "as-is");
  }
}

export async function processImageFile(file: File): Promise<ProcessedImage> {
  const error = validateImageFile(file);
  if (error === "unsupportedType") throw new Error("Please use a JPG, PNG, WEBP or HEIC image.");
  // NOTE: validateImageFile still reports "tooLarge" for files over 8 MB,
  // but processImageFile no longer rejects them: the oversize branch below
  // downscales until the bytes actually uploaded fit the 8 MB limit
  // (which the /api/extract route also enforces server-side).

  if (isHeicFile(file)) {
    // heic2any is loaded lazily so non-HEIC users never download it.
    const heic2any = (await import("heic2any")).default;
    const converted = (await heic2any({ blob: file, toType: "image/jpeg", quality: JPEG_QUALITY })) as Blob;
    return processBlob(converted, file.name, true);
  }
  return processBlob(file, file.name, false);
}

/** Dimensions of an image after rotating by ±90° (swapped) or 180° (same). */
export function rotatedDimensions(
  width: number,
  height: number,
  degrees: 90 | -90 | 180,
): { width: number; height: number } {
  return Math.abs(degrees) === 90 ? { width: height, height: width } : { width, height };
}

/** Rotate a data-URL image by ±90° (or 180°) and return a new data URL. */
export async function rotateDataUrl(dataUrl: string, degrees: 90 | -90 | 180): Promise<string> {
  const img = await loadImage(dataUrl);
  const { width, height } = rotatedDimensions(img.naturalWidth, img.naturalHeight, degrees);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}
