import path from "node:path";
import { fileURLToPath } from "node:url";
import { readdir, stat } from "node:fs/promises";
import sharp from "sharp";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(projectRoot, "public");

const byte = (n) => `${(n / 1024).toFixed(1)} KB`;

// 压缩策略
const targets = [
  // 棋子：resize 到 256（实际最大显示 ~70px，3 倍以上 Retina 余量）+ palette 量化
  {
    name: "chess pieces (12)",
    files: async () =>
      (await readdir(path.join(publicDir, "chess-pieces")))
        .filter((f) => f.endsWith(".png"))
        .map((f) => path.join(publicDir, "chess-pieces", f)),
    transform: (s) =>
      s.resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ palette: true, quality: 85, compressionLevel: 9, colors: 256 }),
  },
  // OG 社交预览：保尺寸，palette 量化
  {
    name: "og.png",
    files: async () => [path.join(publicDir, "og.png")],
    transform: (s) =>
      s.png({ palette: true, quality: 85, compressionLevel: 9, colors: 256 }),
  },
  // PWA icons：palette 量化，保精确尺寸
  {
    name: "app icons (3)",
    files: async () =>
      ["icon-512.png", "icon-192.png", "apple-touch-icon.png"].map((f) => path.join(publicDir, f)),
    transform: (s) =>
      s.png({ palette: true, quality: 85, compressionLevel: 9, colors: 256 }),
  },
  // 二维码：跳过压缩。它们已是 compressionLevel 9 的高对比度二值图（~22KB），
  // palette 量化会破坏扫码可读性，且体积本身已足够小。
];

let totalBefore = 0;
let totalAfter = 0;

for (const group of targets) {
  const files = await group.files();
  let groupBefore = 0;
  let groupAfter = 0;

  for (const file of files) {
    const before = (await stat(file)).size;
    const buffer = await group.transform(sharp(file)).toBuffer();
    const after = buffer.length;
    // 只在确实变小时覆盖（防止异常变大）
    if (after < before) {
      const { default: fs } = await import("node:fs");
      fs.writeFileSync(file, buffer);
    }
    groupBefore += before;
    groupAfter += Math.min(after, before);
    console.log(`  ${path.basename(file).padEnd(28)} ${byte(before).padStart(10)} → ${byte(Math.min(after, before)).padStart(10)}`);
  }

  totalBefore += groupBefore;
  totalAfter += groupAfter;
  console.log(`[${group.name}] ${byte(groupBefore)} → ${byte(groupAfter)} (节省 ${((1 - groupAfter / groupBefore) * 100).toFixed(0)}%)`);
  console.log("");
}

console.log(`总计: ${byte(totalBefore)} → ${byte(totalAfter)} (节省 ${((1 - totalAfter / totalBefore) * 100).toFixed(0)}%)`);
