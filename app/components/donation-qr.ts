// 支付配置（唯一数据源；不保存任何二维码图片，二维码由浏览器按原始内容实时生成）
export const DONATION_CONFIG = {
  alipay: {
    qrContent: "https://qr.alipay.com/fkx16432isyyhmx9ttwpi79",
  },
  wechat: {
    // 仅作为二维码 payload，永远不要拿它做页面跳转
    qrContent:
      "wxp://f2f1fJpOcJc7F-MSeLMxALhc6tWu-oohtxueHRbCe98bMy2AmDunimuOJFv-8bjobLBM",
  },
} as const;

export type DonationChannel = keyof typeof DONATION_CONFIG;

const QR_ECC = "M"; // 纠错等级 M
const QR_QUIET_MODULES = 4; // 静区 ≥ 4 modules
const QR_DISPLAY_SIZE = 220; // 展示尺寸 px

// QR 库只在弹窗打开后才动态加载（代码分割，不占首屏）
export async function createQrModules(content: string) {
  const { create } = await import("qrcode");
  return create(content, { errorCorrectionLevel: QR_ECC }).modules;
}

// 整数倍缩放保证模块边缘锐利；深色前景 + 白色背景，扫码成功率优先
export function paintQrToCanvas(
  canvas: HTMLCanvasElement,
  modules: { size: number; data: Uint8Array },
) {
  const total = modules.size + QR_QUIET_MODULES * 2;
  const px = Math.max(1, Math.floor(QR_DISPLAY_SIZE / total));
  const canvasSize = px * total;
  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const ctx = canvas.getContext && canvas.getContext("2d");
  if (!ctx) return; // 环境不支持 canvas 时跳过绘制（提示文案仍可用）

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasSize, canvasSize);
  ctx.fillStyle = "#111111";
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (modules.data[row * modules.size + col]) {
        ctx.fillRect(
          (col + QR_QUIET_MODULES) * px,
          (row + QR_QUIET_MODULES) * px,
          px,
          px,
        );
      }
    }
  }
}
