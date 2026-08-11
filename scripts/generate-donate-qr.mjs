import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import QRCode from "qrcode";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectRoot, "public/donate");

// 收款链接（来源：用户提供的收款码解码结果）
const codes = [
  { name: "alipay-qr", url: "https://qr.alipay.com/fkx16432isyyhmx9ttwpi79" },
  { name: "wechat-qr", url: "wxp://f2f1fJpOcJc7F-MSeLMxALhc6tWu-oohtxueHRbCe98bMy2AmDunimuOJFv-8bjobLBM" },
];

const canvas = 560; // 最终图片尺寸
const qrSize = 440; // 二维码本体尺寸
const padding = (canvas - qrSize) / 2;

// 深色圆角背景 + 金色描边（匹配项目主题 #0c0e0c / 金色 #d4af37）
const background = Buffer.from(`
  <svg width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#f0d97a"/>
        <stop offset="100%" stop-color="#b8941f"/>
      </linearGradient>
    </defs>
    <rect width="${canvas}" height="${canvas}" rx="48" fill="#0c0e0c"/>
    <rect x="14" y="14" width="${canvas - 28}" height="${canvas - 28}" rx="36" fill="none" stroke="url(#edge)" stroke-width="4"/>
  </svg>
`);

await Promise.all(
  codes.map(async ({ name, url }) => {
    // 生成白底黑码的标准二维码 PNG buffer
    const qrBuffer = await QRCode.toBuffer(url, {
      margin: 0,
      width: qrSize,
      color: { dark: "#f5f3ea", light: "#0c0e0c" }, // 暖白码点 on 深色底，与背景融合
      errorCorrectionLevel: "H",
    });

    const composited = await sharp(background)
      .composite([{ input: qrBuffer, left: padding, top: padding }])
      .png({ compressionLevel: 9 })
      .toBuffer();

    const outFile = path.join(outputDirectory, `${name}.png`);
    await sharp(composited).toFile(outFile);
    console.log(`Generated ${name}.png`);
  }),
);

console.log("Donate QR codes written to public/donate/");
