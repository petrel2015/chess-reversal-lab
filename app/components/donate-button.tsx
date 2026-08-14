"use client";

import { useEffect, useState } from "react";
import { useI18n } from "../lib/i18n";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const alipayQr = `${basePath}/donate/alipay-qr.png`;
const wechatQr = `${basePath}/donate/wechat-qr.png`;

// 支付宝收款码原始 URL（用于 alipays:// 智能唤起）
const alipayUrl = "https://qr.alipay.com/fkx16432isyyhmx9ttwpi79";
const alipayScheme = `alipays://platformapi/startapp?saId=10000007&qrcode=${encodeURIComponent(alipayUrl)}`;

type Channel = "alipay" | "wechat";

const channelKey: Record<Channel, string> = {
  alipay: "donate.alipay",
  wechat: "donate.wechat",
};

function isMobile() {
  if (typeof navigator === "undefined") return false;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function DonateButton() {
  const { t } = useI18n();
  const [openChannel, setOpenChannel] = useState<Channel | null>(null);

  // 组件挂载后预加载两张二维码到浏览器缓存，模态框打开时瞬间显示（避免"反应一下"）
  useEffect(() => {
    [alipayQr, wechatQr].forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, []);

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
      <span className="donate-tag">{t("donate.tag")}</span>
      <div className="donate-triggers">
        <button type="button" className="donate-trigger alipay" onClick={handleAlipay}>
          {t("donate.alipay")}
        </button>
        <button type="button" className="donate-trigger wechat" onClick={handleWechat}>
          {t("donate.wechat")}
        </button>
      </div>

      {openChannel && (
        <div
          className="donate-modal-overlay"
          onClick={() => setOpenChannel(null)}
          role="dialog"
          aria-modal="true"
          aria-label={t("donate.modalAria", { channel: t(channelKey[openChannel]) })}
        >
          <div className="donate-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="donate-close"
              onClick={() => setOpenChannel(null)}
              aria-label={t("donate.closeAria")}
            >
              ×
            </button>
            <h3>{t("donate.tag")}</h3>
            <img
              className="donate-qr"
              src={openChannel === "alipay" ? alipayQr : wechatQr}
              alt={t("donate.qrAlt", { channel: t(channelKey[openChannel]) })}
            />
            <small>
              {openChannel === "alipay" ? t("donate.alipayHint") : t("donate.wechatHint")}
            </small>
          </div>
        </div>
      )}
    </div>
  );
}
