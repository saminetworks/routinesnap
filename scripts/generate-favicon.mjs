// Generates the browser-tab favicon (src/app/favicon.ico) and the app
// icon (src/app/icon.png) from the logo SVG (public/icons/icon.svg).
// Run: `node scripts/generate-favicon.mjs` (or `pnpm favicon`).
// The .ico is built by hand: an ICO header + directory entries, each
// holding a PNG rendered by sharp (all modern browsers accept PNG
// images inside .ico files). The SVG is the source of truth — edit it,
// re-run, and commit the outputs.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const svg = await readFile(path.join(root, "public", "icons", "icon.svg"));

// App icon for Next.js metadata (served at /icon.png).
const icon192 = await sharp(svg, { density: 300 }).resize(192, 192).png({ compressionLevel: 9 }).toBuffer();
await writeFile(path.join(root, "src", "app", "icon.png"), icon192);
console.log("wrote src/app/icon.png (192x192)");

// Favicon: 16px, 32px and 48px PNGs packed into one .ico file.
const sizes = [16, 32, 48];
const pngs = [];
for (const size of sizes) {
  pngs.push(await sharp(svg, { density: 300 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer());
}

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(sizes.length, 4); // image count

const entries = [];
let offset = 6 + 16 * sizes.length;
const chunks = [header];
for (let i = 0; i < sizes.length; i++) {
  const size = sizes[i];
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size === 256 ? 0 : size, 0); // width (0 means 256)
  entry.writeUInt8(size === 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2); // colour palette count
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(pngs[i].length, 8); // image size
  entry.writeUInt32LE(offset, 12); // image offset
  entries.push(entry);
  chunks.push(entry);
  offset += pngs[i].length;
}
for (const png of pngs) chunks.push(png);
await writeFile(path.join(root, "src", "app", "favicon.ico"), Buffer.concat(chunks));
console.log(`wrote src/app/favicon.ico (${sizes.join(", ")}px PNGs)`);
