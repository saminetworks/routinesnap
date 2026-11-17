// Generates the PWA icons from the SVG sources in public/icons/.
// Run: `node scripts/generate-icons.mjs` (or `pnpm icons`).
// The SVGs are the source of truth — edit them, re-run, and commit the
// PNGs, so the icons stay reproducible without any design tool.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const iconsDir = path.join(root, "public", "icons");

const targets = [
  { src: "icon.svg", out: "icon-192.png", size: 192 },
  { src: "icon.svg", out: "icon-512.png", size: 512 },
  { src: "icon-maskable.svg", out: "icon-maskable-512.png", size: 512 },
  { src: "icon.svg", out: "apple-touch-icon.png", size: 180 },
];

await mkdir(iconsDir, { recursive: true });
for (const { src, out, size } of targets) {
  const svg = await readFile(path.join(iconsDir, src));
  const png = await sharp(svg, { density: 300 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(path.join(iconsDir, out), png);
  console.log(`wrote public/icons/${out} (${size}x${size})`);
}
