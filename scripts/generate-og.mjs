// Generates the OpenGraph image from the SVG source in public/og/.
// Run: `node scripts/generate-og.mjs` (or `pnpm og`).
// The SVG is the source of truth — edit it, re-run, and commit the
// PNG, so the social image stays reproducible without any design tool.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const ogDir = path.join(root, "public", "og");

await mkdir(ogDir, { recursive: true });
const svg = await readFile(path.join(ogDir, "og.svg"));
const png = await sharp(svg, { density: 300 })
  .resize(1200, 630)
  .png({ compressionLevel: 9 })
  .toBuffer();
await writeFile(path.join(ogDir, "og.png"), png);
console.log(`wrote public/og/og.png (1200x630, ${png.length} bytes)`);
