"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "../lib/i18n";
import {
  DONATION_CONFIG,
  createQrModules,
  paintQrToCanvas,
  type DonationChannel,
} from "./donation-qr";

const CHANNELS: DonationChannel[] = ["alipay", "wechat"];

function isMobileUA() {
  if (typeof navigator === "undefined") return false;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function DonateButton() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<DonationChannel>("alipay");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const entryRef = useRef<HTMLButtonElement>(null);
  const alipayTabRef = useRef<HTMLButtonElement>(null);
  // 每次弹窗会话内至多尝试一次支付宝跳转；二维码常驻即天然兜底
  const openAttemptedRef = useRef(false);

  // 弹窗打开：重置会话、移动端支付宝尝试打开官方收款链接、焦点移入弹窗
  useEffect(() => {
    if (!open) return;
    openAttemptedRef.current = false;
    if (isMobileUA()) {
      window.open(DONATION_CONFIG.alipay.qrContent, "_blank", "noopener");
      openAttemptedRef.current = true;
    }
    alipayTabRef.current?.focus();
  }, [open]);

  // ESC 关闭；关闭时焦点归还入口
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      entryRef.current?.focus();
    };
  }, [open]);

  // 二维码实时生成：弹窗打开后才加载 QR 库并按渠道内容绘制
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    createQrModules(DONATION_CONFIG[channel].qrContent).then((modules) => {
      if (!cancelled && canvasRef.current) {
        paintQrToCanvas(canvasRef.current, modules);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, channel]);

  const switchChannel = (next: DonationChannel) => {
    if (next === channel) return;
    setChannel(next);
    if (
      next === "alipay" &&
      isMobileUA() &&
      !openAttemptedRef.current
    ) {
      window.open(DONATION_CONFIG.alipay.qrContent, "_blank", "noopener");
      openAttemptedRef.current = true;
    }
  };

  const hint = (() => {
    if (channel === "alipay") {
      // 手机端支付宝已尝试跳转，二维码常驻兜底
      if (isMobileUA()) return t("donate.fallbackHint");
      return t("donate.scanAlipay");
    }
    return t("donate.scanWechat");
  })();

  return (
    <>
      <button
        type="button"
        ref={entryRef}
        className="donate-entry"
        onClick={() => {
          setChannel("alipay");
          setOpen(true);
        }}
      >
        {t("donate.entry")}
      </button>

      {open && (
        <div
          className="donate-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t("donate.title")}
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="donate-dialog">
            <button
              type="button"
              className="donate-close"
              onClick={() => setOpen(false)}
              aria-label={t("donate.close")}
            >
              ×
            </button>
            <h3 className="donate-title">{t("donate.title")}</h3>
            <p className="donate-subtitle">{t("donate.subtitle")}</p>
            <div className="donate-tabs" role="group" aria-label={t("donate.channelGroup")}>
              {CHANNELS.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  ref={ch === "alipay" ? alipayTabRef : undefined}
                  className={ch === channel ? "active" : ""}
                  aria-pressed={ch === channel}
                  onClick={() => switchChannel(ch)}
                >
                  {ch === "alipay" ? t("donate.alipay") : t("donate.wechat")}
                </button>
              ))}
            </div>
            <div className="donate-qr-card">
              <canvas
                ref={canvasRef}
                className="donate-qr"
                role="img"
                aria-label={t("donate.qrAria", {
                  channel:
                    channel === "alipay"
                      ? t("donate.alipay")
                      : t("donate.wechat"),
                })}
              />
            </div>
            <p className="donate-hint">{hint}</p>
          </div>
        </div>
      )}
    </>
  );
}
