// 「请作者喝杯咖啡」赞赏功能测试套件
// 覆盖：入口/弹窗交互、渠道切换、手机端跳转与兜底、焦点管理、
// zh/en 文案与键集对齐、合同断言（无自定义 scheme / 无静态二维码图 / QR 库懒加载）、
// 二维码回环（页面同款参数 + jsQR 解码）。
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";

const require = createRequire(import.meta.url);

const ALIPAY_URL = "https://qr.alipay.com/fkx16432isyyhmx9ttwpi79";
const WXP_PAYLOAD =
  "wxp://f2f1fJpOcJc7F-MSeLMxALhc6tWu-oohtxueHRbCe98bMy2AmDunimuOJFv-8bjobLBM";

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

// ---------- 打包与 jsdom 脚手架 ----------

let bundlePromise = null;
function getBundle() {
  bundlePromise ??= require("esbuild")
    .build({
      entryPoints: [fileURLToPath(new URL("./donation-entry.tsx", import.meta.url))],
      bundle: true,
      format: "iife",
      platform: "browser",
      jsx: "automatic",
      write: false,
      logLevel: "silent",
      outfile: "donation-bundle.js",
      define: { "process.env.NODE_ENV": '"production"' },
    })
    .then((result) => result.outputFiles[0].text);
  return bundlePromise;
}

// jsdom 会忽略构造选项里的 userAgent，必须用 defineProperty 覆盖
async function createAppDom({ locale = "zh", userAgent = DESKTOP_UA } = {}) {
  const dom = new JSDOM(
    "<!doctype html><html><body><div id=\"root\"></div></body></html>",
    {
      url: "https://chess-reversal.test/",
      runScripts: "dangerously",
      pretendToBeVisual: true,
      virtualConsole: new VirtualConsole().on("jsdomError", () => {}),
    },
  );
  const { window } = dom;
  Object.defineProperty(window.navigator, "userAgent", {
    get: () => userAgent,
    configurable: true,
  });
  window.localStorage.setItem("locale", locale);
  // 强制 React 调度器走 setTimeout 兜底路径（jsdom 的 MessageChannel 不可靠）
  window.MessageChannel = undefined;
  const opened = [];
  window.open = (url, target, features) => {
    opened.push({ url, target, features });
    return {};
  };
  const script = window.document.createElement("script");
  script.textContent = await getBundle();
  window.document.body.appendChild(script);
  return { dom, window, document: window.document, opened };
}

async function waitFor(fn, { timeout = 3000, step = 10 } = {}) {
  let lastError;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      return fn();
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, step));
  }
  throw lastError ?? new Error("waitFor timed out");
}

async function getEntry(document) {
  return waitFor(() => {
    const entry = document.querySelector(".donate-entry");
    assert.ok(entry, "entry button should be mounted");
    return entry;
  });
}

async function openDialog(document) {
  const entry = await getEntry(document);
  entry.click();
  return waitFor(() => {
    const overlay = document.querySelector(".donate-overlay");
    assert.ok(overlay, "dialog should open");
    return overlay;
  });
}

function channelTabs(document) {
  const tabs = document.querySelectorAll(".donate-tabs button");
  assert.equal(tabs.length, 2);
  return { alipayTab: tabs[0], wechatTab: tabs[1] };
}

async function switchChannel(document, tab, expectedHint) {
  tab.click();
  return waitFor(() => {
    assert.equal(
      document.querySelector(".donate-hint")?.textContent,
      expectedHint,
    );
    return document.querySelector(".donate-hint");
  });
}

// ---------- 交互逻辑 ----------

test("Footer 入口默认中文文案；弹窗打开前无二维码、无跳转", async () => {
  const { document, opened } = await createAppDom();
  const entry = await getEntry(document);
  assert.equal(entry.textContent, "☕ 请作者喝杯咖啡");
  assert.ok(document.querySelector(".donate-overlay") === null);
  assert.equal(document.querySelector("canvas"), null, "未打开弹窗不应有 QR canvas");
  assert.equal(opened.length, 0);
});

test("桌面端：弹窗默认支付宝二维码，可切换微信，全程不跳转", async () => {
  const { document, opened } = await createAppDom();
  await openDialog(document);

  assert.equal(
    document.querySelector(".donate-title")?.textContent,
    "请作者喝杯咖啡 ☕",
  );
  assert.equal(
    document.querySelector(".donate-subtitle")?.textContent,
    "如果这个小工具帮到了你，可以请作者喝杯咖啡。",
  );
  const canvas = document.querySelector("canvas.donate-qr");
  assert.ok(canvas, "弹窗打开后应出现 QR canvas");
  assert.equal(canvas.getAttribute("aria-label"), "支付宝收款码");
  assert.equal(
    document.querySelector(".donate-hint")?.textContent,
    "打开支付宝扫一扫",
  );
  const { alipayTab, wechatTab } = channelTabs(document);
  assert.equal(alipayTab.textContent, "支付宝");
  assert.equal(wechatTab.textContent, "微信支付");
  assert.equal(alipayTab.getAttribute("aria-pressed"), "true");
  assert.equal(document.activeElement, alipayTab, "打开后焦点移入弹窗");

  await switchChannel(document, wechatTab, "打开微信扫一扫");
  assert.equal(wechatTab.getAttribute("aria-pressed"), "true");
  assert.equal(alipayTab.getAttribute("aria-pressed"), "false");
  assert.equal(
    document.querySelector("canvas.donate-qr")?.getAttribute("aria-label"),
    "微信支付收款码",
  );
  assert.equal(opened.length, 0, "桌面端不应发起任何跳转");
});

test("ESC 关闭弹窗并把焦点归还给 Footer 入口", async () => {
  const { window, document } = await createAppDom();
  const entry = await getEntry(document);
  await openDialog(document);

  document.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  await waitFor(() => {
    assert.ok(document.querySelector(".donate-overlay") === null);
    return true;
  });
  assert.equal(document.activeElement, entry, "关闭后焦点应归还入口");
});

test("点击遮罩关闭弹窗；点击弹窗内部不关闭", async () => {
  const { window, document } = await createAppDom();
  const overlay = await openDialog(document);

  document.querySelector(".donate-dialog").dispatchEvent(
    new window.MouseEvent("click", { bubbles: true }),
  );
  assert.ok(document.querySelector(".donate-overlay"), "点内部不应关闭");

  overlay.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await waitFor(() => {
    assert.ok(document.querySelector(".donate-overlay") === null);
    return true;
  });
});

test("手机端支付宝：打开官方收款链接一次/会话，二维码常驻兜底", async () => {
  const { window, document, opened } = await createAppDom({ userAgent: MOBILE_UA });
  assert.ok(/Mobi/.test(window.navigator.userAgent), "UA 覆盖应生效");

  await openDialog(document);
  await waitFor(() => {
    assert.equal(opened.length, 1, "打开弹窗即尝试一次官方收款链接");
    return true;
  });
  assert.deepEqual(opened[0], {
    url: ALIPAY_URL,
    target: "_blank",
    features: "noopener",
  });
  assert.ok(document.querySelector("canvas.donate-qr"), "二维码始终可见");
  assert.equal(
    document.querySelector(".donate-hint")?.textContent,
    "没有自动打开？请使用支付宝 / 微信扫码",
  );

  const { alipayTab, wechatTab } = channelTabs(document);
  await switchChannel(document, wechatTab, "打开微信扫一扫");
  assert.equal(opened.length, 1, "微信渠道不发起跳转");

  await switchChannel(document, alipayTab, "没有自动打开？请使用支付宝 / 微信扫码");
  assert.equal(opened.length, 1, "同一弹窗会话至多尝试一次跳转");

  document.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  await waitFor(() => {
    assert.ok(document.querySelector(".donate-overlay") === null);
    return true;
  });
  const entry = await getEntry(document);
  entry.click();
  await waitFor(() => {
    assert.equal(opened.length, 2, "重新打开弹窗 = 新会话，可再次尝试");
    return true;
  });
});

test("手机端微信：直接展示二维码，绝不携带 wxp:// 跳转", async () => {
  const { document, opened } = await createAppDom({ userAgent: MOBILE_UA });
  await openDialog(document);
  const { wechatTab } = channelTabs(document);
  await switchChannel(document, wechatTab, "打开微信扫一扫");
  assert.ok(document.querySelector("canvas.donate-qr"));
  for (const call of opened) {
    assert.ok(!call.url.startsWith("wxp://"), "wxp payload 不能用于跳转");
  }
});

test("英文环境文案跟随：Buy me a coffee 入口与弹窗", async () => {
  const { document } = await createAppDom({ locale: "en" });
  const entry = await getEntry(document);
  assert.equal(entry.textContent, "☕ Buy me a coffee");

  await openDialog(document);
  assert.equal(
    document.querySelector(".donate-title")?.textContent,
    "Buy me a coffee ☕",
  );
  assert.equal(
    document.querySelector(".donate-subtitle")?.textContent,
    "If this little tool helped you, you can buy the author a coffee.",
  );
  const { alipayTab, wechatTab } = channelTabs(document);
  assert.equal(alipayTab.textContent, "Alipay");
  assert.equal(wechatTab.textContent, "WeChat Pay");
  assert.equal(
    document.querySelector(".donate-hint")?.textContent,
    "Scan with Alipay",
  );
  await switchChannel(document, wechatTab, "Scan with WeChat");
});

// ---------- 合同断言（防回退） ----------

test("合同：无自定义 scheme、无静态二维码图片、QR 库仅懒加载", async () => {
  const [btnSrc, qrSrc, pkgSrc] = await Promise.all([
    readFile(new URL("../app/components/donate-button.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/donation-qr.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  const donationCode = btnSrc + qrSrc;
  assert.doesNotMatch(donationCode, /alipays:\/\//i, "禁止构造 alipays:// scheme");
  assert.doesNotMatch(donationCode, /platformapi/i);
  assert.doesNotMatch(
    donationCode,
    /\.(png|jpe?g|svg)\b/i,
    "捐赠代码不得引用任何二维码图片文件",
  );
  assert.match(qrSrc, /await import\("qrcode"\)/, "QR 库必须动态加载");
  assert.doesNotMatch(donationCode, /from "qrcode"/, "禁止顶层静态导入 QR 库");
  assert.ok(qrSrc.includes(ALIPAY_URL), "支付宝收款链接须逐字配置");
  assert.match(qrSrc, /qrContent:\s*\n?\s*["']wxp:/, "微信 payload 仅作为二维码内容");
  const pkg = JSON.parse(pkgSrc);
  assert.ok(pkg.dependencies.qrcode, "qrcode 应为运行时依赖");
  assert.equal(pkg.scripts["qr:generate"], undefined, "静态二维码生成脚本应已移除");
});

test("合同：仓库中不存在静态二维码图片与生成脚本", async () => {
  await assert.rejects(access(new URL("../public/donate", import.meta.url)));
  await assert.rejects(
    access(new URL("../scripts/generate-donate-qr.mjs", import.meta.url)),
  );
});

test("zh/en 词典 donate 键集一致，入口文案符合规范", async () => {
  const src = await readFile(new URL("../app/lib/i18n.tsx", import.meta.url), "utf8");
  const zhBlock = src.match(/const zh: Record<string, string> = \{([\s\S]*?)\n\};/);
  const enBlock = src.match(/const en: Record<string, string> = \{([\s\S]*?)\n\};/);
  assert.ok(zhBlock && enBlock);
  const donateKeys = (block) =>
    [...block[1].matchAll(/"([^"]+)":/g)]
      .map((m) => m[1])
      .filter((key) => key.startsWith("donate."))
      .sort();
  assert.deepEqual(donateKeys(enBlock), donateKeys(zhBlock));
  assert.match(zhBlock[1], /"donate\.entry": "☕ 请作者喝杯咖啡"/);
  assert.match(enBlock[1], /"donate\.entry": "☕ Buy me a coffee"/);
});

// ---------- 二维码回环（页面同款参数 + jsQR 解码） ----------

test("二维码回环：页面同款参数生成 → jsQR 解码逐字一致", async () => {
  const { DONATION_CONFIG, createQrModules } = await import(
    "../app/components/donation-qr.ts"
  );
  const jsQR = require("jsqr");

  for (const [channel, { qrContent }] of Object.entries(DONATION_CONFIG)) {
    const modules = await createQrModules(qrContent);
    assert.ok(
      modules.size >= 21 && modules.size <= 177,
      `${channel}: 模块数应在合法范围 (${modules.size})`,
    );
    // 与 paintQrToCanvas 相同的整数缩放与静区参数
    const quiet = 4;
    const displaySize = 220;
    const total = modules.size + quiet * 2;
    const px = Math.max(1, Math.floor(displaySize / total));
    assert.ok(total - modules.size >= quiet * 2, `${channel}: 静区 ≥ 4 modules`);
    const size = px * total;
    const rgba = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let row = 0; row < modules.size; row++) {
      for (let col = 0; col < modules.size; col++) {
        if (!modules.data[row * modules.size + col]) continue;
        for (let dy = 0; dy < px; dy++) {
          for (let dx = 0; dx < px; dx++) {
            const idx =
              (((row + quiet) * px + dy) * size + (col + quiet) * px + dx) * 4;
            rgba[idx] = 17;
            rgba[idx + 1] = 17;
            rgba[idx + 2] = 17;
          }
        }
      }
    }
    const decoded = jsQR(rgba, size, size);
    assert.ok(decoded, `${channel}: jsQR 应能解码`);
    assert.equal(decoded.data, qrContent, `${channel}: 解码内容须逐字一致`);
  }
});
