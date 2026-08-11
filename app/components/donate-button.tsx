"use client";

import { useEffect, useState } from "react";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const alipayQr = `${basePath}/donate/alipay-qr.png`;
const wechatQr = `${basePath}/donate/wechat-qr.png`;

// 支付宝收款码原始 URL（用于 alipays:// 智能唤起）
const alipayUrl = "https://qr.alipay.com/fkx16432isyyhmx9ttwpi79";
const alipayScheme = `alipays://platformapi/startapp?saId=10000007&qrcode=${encodeURIComponent(alipayUrl)}`;

type Channel = "alipay" | "wechat";

const channelLabel: Record<Channel, string> = {
  alipay: "支付宝",
  wechat: "微信",
};

function isMobile() {
  if (typeof navigator === "undefined") return false;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function DonateButton() {
  const [openChannel, setOpenChannel] = useState<Channel | null>(null);

 // ESC 键关闭模态框
  useEffect(() => {
    if (!openChannel) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenChannel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openChannel]);

  const handleAlipay = () => {
    if (isMobile()) {
      // 尝试唤起支付宝 App：记录可见性，1.5s 内未切走说明唤起失败 → 兜底弹二维码
      const before = document.visibilityState;
      window.location.href = alipayScheme;
      window.setTimeout(() => {
        if (document.visibilityState === before) {
          setOpenChannel("alipay");
        }
      }, 1500);
    } else {
      // 桌面端无 alipays scheme，直接弹二维码
      setOpenChannel("alipay");
    }
  };

  const handleWechat = () => {
    // 微信不支持 URL scheme 直接唤起付款，始终展示二维码
    setOpenChannel("wechat");
  };

  return (
    <div className="donate-section">
      <span className="donate-tag">请我喝杯咖啡 ￥4.9</span>
      <div className="donate-triggers">
        <button type="button" className="donate-trigger alipay" onClick={handleAlipay}>
          支付宝
        </button>
        <button type="button" className="donate-trigger wechat" onClick={handleWechat}>
          微信
        </button>
      </div>

      {openChannel && (
        <div
          className="donate-modal-overlay"
          onClick={() => setOpenChannel(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`${channelLabel[openChannel]}赞赏二维码`}
        >
          <div className="donate-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="donate-close"
              onClick={() => setOpenChannel(null)}
              aria-label="关闭"
            >
              ×
            </button>
            <h3>请我喝杯咖啡 ￥4.9</h3>
            <img
              className="donate-qr"
              src={openChannel === "alipay" ? alipayQr : wechatQr}
              alt={`${channelLabel[openChannel]}收款码`}
            />
            <small>
              {openChannel === "alipay"
                ? "长按或保存二维码，打开支付宝扫一扫"
                : "长按或保存二维码，打开微信扫一扫"}
            </small>
          </div>
        </div>
      )}
    </div>
  );
}
