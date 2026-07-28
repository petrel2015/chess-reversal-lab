import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePiece = path.join(projectRoot, "public/chess-pieces/b-n.png");
const outputDirectory = path.join(projectRoot, "public");

const size = 512;
const cells = 4;
const cellSize = size / cells;
const light = "#d6f36f";
const dark = "#b4dd3c";

const boardSquares = Array.from({ length: cells * cells }, (_, index) => {
  const row = Math.floor(index / cells);
  const column = index % cells;
  const fill = (row + column) % 2 === 0 ? light : dark;
  return `<rect x="${column * cellSize}" y="${row * cellSize}" width="${cellSize}" height="${cellSize}" fill="${fill}"/>`;
}).join("");

const background = Buffer.from(`
  <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="glow" cx="50%" cy="42%" r="68%">
        <stop offset="0%" stop-color="#efff9a" stop-opacity=".58"/>
        <stop offset="100%" stop-color="#7ea71f" stop-opacity=".18"/>
      </radialGradient>
      <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#eaff8a"/>
        <stop offset="100%" stop-color="#8eb729"/>
      </linearGradient>
    </defs>
    ${boardSquares}
    <rect width="${size}" height="${size}" fill="url(#glow)"/>
    <rect x="18" y="18" width="476" height="476" rx="92" fill="none" stroke="url(#edge)" stroke-width="12"/>
    <rect x="30" y="30" width="452" height="452" rx="80" fill="none" stroke="#0c0e0c" stroke-opacity=".22" stroke-width="3"/>
  </svg>
`);

const knight = await sharp(sourcePiece)
  .resize(400, 400, { fit: "contain" })
  .png()
  .toBuffer();

const icon512 = await sharp(background)
  .composite([
    {
      input: knight,
      left: 56,
      top: 52,
    },
  ])
  .png({ compressionLevel: 9 })
  .toBuffer();

await Promise.all([
  sharp(icon512).toFile(path.join(outputDirectory, "icon-512.png")),
  sharp(icon512).resize(192, 192).png({ compressionLevel: 9 }).toFile(path.join(outputDirectory, "icon-192.png")),
  sharp(icon512).resize(180, 180).png({ compressionLevel: 9 }).toFile(path.join(outputDirectory, "apple-touch-icon.png")),
]);

console.log("Generated apple-touch-icon.png, icon-192.png, and icon-512.png");
