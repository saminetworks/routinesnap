/**
 * Client-side image utilities (spec §7, §11).
 * Everything here runs in the browser only:
 * - HEIC/HEIF is converted with heic2any before anything else.
 * - The image is resized to a max 2000px on the long edge on a canvas.
 * - Re-encoding through the canvas strips EXIF (including GPS) — the
 *   uploaded bytes are fresh pixels, never the original file.
 * No image data ever leaves the browser in Step 3 (mock extractor).
 */

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
export const MAX_LONG_EDGE = 2000;

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
export const ACCEPTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];

export interface ProcessedImage {
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
  name: string;
  type: string;
  /** True when a HEIC file was converted. */
  convertedFromHeic: boolean;
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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read this image."));
    img.src = src;
  });
}

function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read this file."));
    reader.readAsDataURL(file);
  });
}

/**
 * Resize + re-encode on a canvas. Drawing to canvas drops all EXIF
 * metadata (including GPS), and re-encoding keeps the upload small.
 */
async function resizeDataUrl(
  dataUrl: string,
  originalName: string,
): Promise<ProcessedImage> {
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.drawImage(img, 0, 0, width, height);
  // JPEG for photos (smaller); PNG keeps transparency for screenshots.
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not process this image."))),
      "image/jpeg",
      0.85,
    );
  });
  return {
    dataUrl: await fileToDataUrl(blob),
    blob,
    width,
    height,
    name: originalName,
    type: "image/jpeg",
    convertedFromHeic: false,
  };
}

export async function processImageFile(file: File): Promise<ProcessedImage> {
  const error = validateImageFile(file);
  if (error === "tooLarge") throw new Error("Image is larger than 8 MB.");
  if (error === "unsupportedType") throw new Error("Please use a JPG, PNG, WEBP or HEIC image.");

  let working: Blob = file;
  let convertedFromHeic = false;
  if (isHeicFile(file)) {
    // heic2any is loaded lazily so non-HEIC users never download it.
    const heic2any = (await import("heic2any")).default;
    const converted = (await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 })) as Blob;
    working = converted;
    convertedFromHeic = true;
  }
  const dataUrl = await fileToDataUrl(working);
  const resized = await resizeDataUrl(dataUrl, file.name);
  return { ...resized, convertedFromHeic };
}

/** Rotate a data-URL image by ±90° (or 180°) and return a new data URL. */
export async function rotateDataUrl(dataUrl: string, degrees: 90 | -90 | 180): Promise<string> {
  const img = await loadImage(dataUrl);
  const swap = Math.abs(degrees) === 90;
  const canvas = document.createElement("canvas");
  canvas.width = swap ? img.naturalHeight : img.naturalWidth;
  canvas.height = swap ? img.naturalWidth : img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  return canvas.toDataURL("image/jpeg", 0.9);
}
