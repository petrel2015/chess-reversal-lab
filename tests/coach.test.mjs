// AI 教练（讲棋抽屉）测试套件
// 覆盖：入口/抽屉交互、未配置空态、设置保存与 localStorage 回读、
// stub fetch 的问答流程与请求形状、快捷提问、自动简评触发与抑制、
// ESC/遮罩关闭与焦点归还、en 文案、coach 键集对齐与合同断言。
//
// 注意：断言 DOM 节点「不存在」时必须先转布尔（assert.ok(node === null)），
// 不能直接 assert.equal(node, null)——React 提交前元素仍在的竞态窗口里，
// 构造 AssertionError 需深检视活的 jsdom 节点，会瞬间吃掉数 GB 内存。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { JSDOM, VirtualConsole } from "jsdom";

const require = createRequire(import.meta.url);

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const SETTINGS_KEY = "coach.settings.v1";
const ASSISTANT_REPLY = "这是一步好棋：出象控制 c6 马，同时保持中心紧张。";

// ---------- 打包与 jsdom 脚手架（沿用 donation.test.mjs 的做法） ----------

let bundlePromise = null;
function getBundle() {
  bundlePromise ??= require("esbuild")
    .build({
      entryPoints: [fileURLToPath(new URL("./coach-entry.tsx", import.meta.url))],
      bundle: true,
      format: "iife",
      platform: "browser",
      jsx: "automatic",
      write: false,
      logLevel: "silent",
      outfile: "coach-bundle.js",
      define: { "process.env.NODE_ENV": '"production"' },
    })
    .then((result) => result.outputFiles[0].text);
  return bundlePromise;
}

async function createAppDom({
  locale = "zh",
  userAgent = DESKTOP_UA,
  settings = null,
} = {}) {
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
  if (settings) {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }
  window.MessageChannel = undefined;

  // 拦截浏览器直连的 chat/completions 请求
  const fetchCalls = [];
  window.fetch = async (url, init) => {
    fetchCalls.push({ url: String(url), init });
    const payload = { choices: [{ message: { content: ASSISTANT_REPLY } }] };
    return {
      ok: true,
      status: 200,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    };
  };

  const script = window.document.createElement("script");
  script.textContent = await getBundle();
  window.document.body.appendChild(script);
  return { dom, window, document: window.document, fetchCalls };
}

function configuredSettings(overrides = {}) {
  return {
    baseUrl: "https://api.llm.test/v1",
    apiKey: "sk-test",
    model: "test-model",
    autoBrief: false,
    ...overrides,
  };
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
    const entry = document.querySelector(".coach-entry");
    assert.ok(entry, "coach entry should be mounted");
    return entry;
  });
}

async function openDrawer(document) {
  const entry = await getEntry(document);
  entry.click();
  return waitFor(() => {
    const overlay = document.querySelector(".coach-overlay");
    assert.ok(overlay, "drawer should open");
    return overlay;
  });
}

// React 受控输入需要原生 setter 触发 onChange
function setControlValue(window, element, value, TagProto) {
  const proto = TagProto ?? (element.tagName === "TEXTAREA"
    ? window.HTMLTextAreaElement
    : window.HTMLInputElement).prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  assert.ok(setter, "native value setter should exist");
  setter.call(element, value);
  element.dispatchEvent(new window.Event("input", { bubbles: true }));
}

function submitForm(window, form) {
  form.dispatchEvent(
    new window.Event("submit", { bubbles: true, cancelable: true }),
  );
}

function assistantMessages(document) {
  return [...document.querySelectorAll(".coach-msg.assistant:not(.pending)")];
}

// ---------- 入口与抽屉交互 ----------

test("顶栏入口默认中文文案；未配置时抽屉展示空态并禁用输入", async () => {
  const { document, fetchCalls } = await createAppDom();
  const entry = await getEntry(document);
  assert.equal(entry.textContent, "🧠 AI 教练");
  assert.equal(document.querySelector(".coach-overlay"), null);
  assert.equal(fetchCalls.length, 0);

  await openDrawer(document);
  assert.equal(
    document.querySelector(".coach-empty strong")?.textContent,
    "还没有配置 AI",
  );
  const textarea = document.querySelector(".coach-input-row textarea");
  assert.ok(textarea?.disabled, "未配置时输入框应禁用");
  const chips = [...document.querySelectorAll(".coach-chips button")];
  assert.ok(chips.length >= 3, "应有快捷提问");
  assert.ok(chips.every((chip) => chip.disabled), "未配置时快捷提问应禁用");
});

test("设置流程：默认值回填、保存写入 localStorage、自动简评开关持久化", async () => {
  const { window, document } = await createAppDom();
  await openDrawer(document);

  document.querySelector(".coach-cta")?.click();
  await waitFor(() => {
    assert.ok(document.querySelector(".coach-settings"), "settings form");
    return true;
  });
  const inputs = [...document.querySelectorAll(".coach-settings input:not([type='checkbox'])")];
  assert.equal(inputs.length, 3, "baseUrl / apiKey / model 三个输入");
  assert.equal(inputs[0].value, "https://api.openai.com/v1", "baseUrl 默认值");
  assert.equal(inputs[1].type, "password", "apiKey 应为密码框");

  setControlValue(window, inputs[1], "sk-mine");
  setControlValue(window, inputs[2], "deepseek-chat");
  const toggle = document.querySelector(".coach-toggle input[type='checkbox']");
  toggle?.click();

  submitForm(window, document.querySelector(".coach-settings"));
  await waitFor(() => {
    assert.ok(
      document.querySelector(".coach-settings") === null,
      "保存后回到对话",
    );
    return true;
  });
  const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY));
  assert.equal(saved.apiKey, "sk-mine");
  assert.equal(saved.model, "deepseek-chat");
  assert.equal(saved.autoBrief, true);
  assert.equal(document.querySelector(".coach-input-row textarea")?.disabled, false);
  // 回归：配置完成后「还没有配置 AI」空态必须消失，不能只解禁输入框
  assert.ok(
    document.querySelector(".coach-empty") === null,
    "配置后不应再显示未配置空态",
  );
  assert.ok(document.querySelector(".coach-hintline"), "应显示对话提示行");
});

test("问答流程：请求打到用户配置的端点，携带局面上下文与鉴权头", async () => {
  const { window, document, fetchCalls } = await createAppDom({
    settings: configuredSettings(),
  });
  await openDrawer(document);

  const textarea = document.querySelector(".coach-input-row textarea");
  assert.ok(textarea && !textarea.disabled);
  setControlValue(window, textarea, "为什么走 Nf3？");
  submitForm(window, document.querySelector(".coach-input-row"));

  await waitFor(() => {
    assert.ok(assistantMessages(document).length === 1, "assistant 回复应渲染");
    return true;
  });
  assert.equal(
    assistantMessages(document)[0].textContent,
    ASSISTANT_REPLY,
  );
  const userMsg = document.querySelector(".coach-msg.user");
  assert.equal(userMsg?.textContent, "为什么走 Nf3？");

  assert.equal(fetchCalls.length, 1);
  const { url, init } = fetchCalls[0];
  assert.equal(url, "https://api.llm.test/v1/chat/completions");
  assert.equal(init.headers.Authorization, "Bearer sk-test");
  const body = JSON.parse(init.body);
  assert.equal(body.model, "test-model");
  assert.equal(body.messages[0].role, "system");
  assert.match(body.messages[0].content, /国际象棋教练/);
  const finalUser = body.messages.at(-1);
  assert.equal(finalUser.role, "user");
  assert.match(finalUser.content, /rnbqkbnr\/pppp1ppp/);
  assert.match(finalUser.content, /1\. e4 e5 2\. Nf3/);
  assert.match(finalUser.content, /为什么走 Nf3？/);
  assert.ok(!("max_tokens" in body), "手动提问不应限制 max_tokens");
});

test("追问携带历史：第二轮请求包含上一轮问答", async () => {
  const { window, document, fetchCalls } = await createAppDom({
    settings: configuredSettings(),
  });
  await openDrawer(document);
  const textarea = document.querySelector(".coach-input-row textarea");
  setControlValue(window, textarea, "第一步");
  submitForm(window, document.querySelector(".coach-input-row"));
  await waitFor(() => assert.ok(assistantMessages(document).length === 1));
  setControlValue(window, textarea, "第二步");
  submitForm(window, document.querySelector(".coach-input-row"));
  await waitFor(() => assert.ok(assistantMessages(document).length === 2));

  const body = JSON.parse(fetchCalls.at(-1).init.body);
  const roles = body.messages.map((m) => m.role);
  assert.deepEqual(roles, ["system", "user", "assistant", "user"]);
});

test("快捷提问：解释上一步按钮发送包含 SAN 的提问", async () => {
  const { document, fetchCalls } = await createAppDom({
    settings: configuredSettings(),
  });
  await openDrawer(document);
  const explain = [...document.querySelectorAll(".coach-chips button")]
    .find((chip) => chip.textContent === "解释上一步");
  assert.ok(explain && !explain.disabled);
  explain.click();
  await waitFor(() => assert.ok(assistantMessages(document).length === 1));
  const body = JSON.parse(fetchCalls[0].init.body);
  assert.match(body.messages.at(-1).content, /为什么走 Nf3/);
});

test("自动简评：开启后引擎走棋触发一次短评；抽屉关闭时不触发", async () => {
  // 抽屉打开状态下推进快照
  const openCase = await createAppDom({
    settings: configuredSettings({ autoBrief: true }),
  });
  await openDrawer(openCase.document);
  await new Promise((resolve) => setTimeout(resolve, 150)); // 打开后仅对齐，不请求
  assert.equal(openCase.fetchCalls.length, 0, "打开抽屉本身不应发起简评");
  openCase.window.__advanceCoachSnapshot?.();
  await waitFor(() => assert.ok(openCase.fetchCalls.length === 1));
  await waitFor(() => {
    const brief = openCase.document.querySelector(".coach-msg.assistant.brief");
    assert.ok(brief, "简评消息应渲染");
    assert.ok(openCase.document.querySelector(".coach-brief-tag"));
    return true;
  });
  const body = JSON.parse(openCase.fetchCalls[0].init.body);
  assert.equal(body.max_tokens, 220, "简评应限制输出长度");
  assert.match(body.messages.at(-1).content, /请用 1-2 句话点评/);

  // 抽屉关闭时不烧 token
  const closedCase = await createAppDom({
    settings: configuredSettings({ autoBrief: true }),
  });
  await getEntry(closedCase.document);
  closedCase.window.__advanceCoachSnapshot?.();
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(closedCase.fetchCalls.length, 0, "抽屉关闭不应发起简评请求");
});

test("请求失败：401 映射为友好错误横幅", async () => {
  const dom = await createAppDom({ settings: configuredSettings() });
  dom.window.fetch = async () => ({
    ok: false,
    status: 401,
    json: async () => ({}),
    text: async () => "",
  });
  const { window, document } = dom;
  await openDrawer(document);
  const textarea = document.querySelector(".coach-input-row textarea");
  setControlValue(window, textarea, "帮我看下局面");
  submitForm(window, document.querySelector(".coach-input-row"));
  await waitFor(() => {
    const error = document.querySelector(".coach-error");
    assert.ok(error, "错误横幅应出现");
    assert.match(error.textContent, /API Key 无效/);
    return true;
  });
});

// ---------- 测试连接 ----------

test("测试连接：成功时显示 ✓，且请求使用表单草稿值", async () => {
  const { window, document, fetchCalls } = await createAppDom({
    settings: configuredSettings(),
  });
  await openDrawer(document);
  document.querySelector(".coach-gear")?.click();
  await waitFor(() => {
    assert.ok(document.querySelector(".coach-settings"));
    return true;
  });

  // 修改 baseUrl 草稿（未保存），测试应打到草稿端点而非已存端点
  const baseUrlInput = document.querySelectorAll(
    ".coach-settings input:not([type='checkbox'])",
  )[0];
  setControlValue(window, baseUrlInput, "https://draft.example.com/v1");

  const testButton = [...document.querySelectorAll(".coach-settings button")].find(
    (button) => button.textContent === "测试连接",
  );
  assert.ok(testButton && !testButton.disabled, "配置完整时测试按钮应可用");
  testButton.click();
  await waitFor(() => {
    const ok = document.querySelector(".coach-test-result.ok");
    assert.ok(ok, "应显示连接成功");
    assert.match(ok.textContent, /✓ 连接成功/);
    return true;
  });
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, "https://draft.example.com/v1/chat/completions");
});

test("测试连接：401 时显示无效 Key 的具体错误", async () => {
  const dom = await createAppDom({ settings: configuredSettings() });
  dom.window.fetch = async () => ({
    ok: false,
    status: 401,
    json: async () => ({}),
    text: async () => "",
  });
  const { window, document } = dom;
  await openDrawer(document);
  document.querySelector(".coach-gear")?.click();
  await waitFor(() => {
    assert.ok(document.querySelector(".coach-settings"));
    return true;
  });
  const testButton = [...document.querySelectorAll(".coach-settings button")].find(
    (button) => button.textContent === "测试连接",
  );
  testButton?.click();
  await waitFor(() => {
    const fail = document.querySelector(".coach-test-result.fail");
    assert.ok(fail, "应显示失败原因");
    assert.match(fail.textContent, /API Key 无效/);
    return true;
  });
  // 测试失败不应打断表单，仍可保存
  assert.ok(document.querySelector(".coach-save"), "设置表单应保留");
});

test("测试连接：GLM 推理模型空 content（仅 reasoning）也视为连通成功", async () => {
  const dom = await createAppDom({ settings: configuredSettings() });
  const payload = {
    choices: [{ message: { content: "", reasoning_content: "……" } }],
  };
  dom.window.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  });
  const { document } = dom;
  await openDrawer(document);
  document.querySelector(".coach-gear")?.click();
  await waitFor(() => {
    assert.ok(document.querySelector(".coach-settings"));
    return true;
  });
  const testButton = [...document.querySelectorAll(".coach-settings button")].find(
    (button) => button.textContent === "测试连接",
  );
  testButton?.click();
  await waitFor(() => {
    assert.ok(document.querySelector(".coach-test-result.ok"), "空 content 应算连通成功");
    return true;
  });
});

// ---------- 关闭行为与文案 ----------

test("ESC 关闭抽屉并把焦点归还顶栏入口", async () => {
  const { window, document } = await createAppDom({
    settings: configuredSettings(),
  });
  const entry = await getEntry(document);
  await openDrawer(document);
  document.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  await waitFor(() => {
    assert.ok(document.querySelector(".coach-overlay") === null);
    return true;
  });
  assert.equal(document.activeElement, entry, "关闭后焦点应归还入口");
});

test("点击遮罩关闭抽屉；点击抽屉内部不关闭", async () => {
  const { window, document } = await createAppDom({
    settings: configuredSettings(),
  });
  const overlay = await openDrawer(document);
  document.querySelector(".coach-drawer").dispatchEvent(
    new window.MouseEvent("click", { bubbles: true }),
  );
  assert.ok(document.querySelector(".coach-overlay"), "点内部不应关闭");
  overlay.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await waitFor(() => {
    assert.ok(document.querySelector(".coach-overlay") === null);
    return true;
  });
});

test("Enter 发送 / Shift+Enter 换行；en 文案跟随", async () => {
  const { window, document, fetchCalls } = await createAppDom({
    locale: "en",
    settings: configuredSettings(),
  });
  const entry = await getEntry(document);
  assert.equal(entry.textContent, "🧠 AI Coach");
  await openDrawer(document);
  assert.equal(
    document.querySelector(".coach-heading strong")?.textContent,
    "AI Coach",
  );

  const textarea = document.querySelector(".coach-input-row textarea");
  setControlValue(window, textarea, "Why Nf3?");
  textarea.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true }),
  );
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(fetchCalls.length, 0, "Shift+Enter 不应发送");

  textarea.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
  );
  await waitFor(() => assert.ok(assistantMessages(document).length === 1));
  const body = JSON.parse(fetchCalls[0].init.body);
  assert.match(body.messages[0].content, /Always answer in English/);
});

// ---------- 合同断言（防回退） ----------

test("zh/en 词典 coach 键集一致", async () => {
  const src = await readFile(new URL("../app/lib/i18n.tsx", import.meta.url), "utf8");
  const zhBlock = src.match(/const zh: Record<string, string> = \{([\s\S]*?)\n\};/);
  const enBlock = src.match(/const en: Record<string, string> = \{([\s\S]*?)\n\};/);
  assert.ok(zhBlock && enBlock);
  const coachKeys = (block) =>
    [...block[1].matchAll(/"([^"]+)":/g)]
      .map((m) => m[1])
      .filter((key) => key.startsWith("coach."))
      .sort();
  assert.deepEqual(coachKeys(enBlock), coachKeys(zhBlock));
  assert.ok(coachKeys(zhBlock).length >= 30, "coach 键应覆盖完整功能文案");
});

test("合同：网络请求只在 coach-client 发起，apiKey 仅存 localStorage", async () => {
  const [componentSrc, clientSrc] = await Promise.all([
    readFile(new URL("../app/components/ai-coach.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/coach-client.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(componentSrc, /\bfetch\(/, "组件不得直接 fetch，须经 coach-client");
  assert.match(componentSrc, /saveCoachSettings/, "设置须经 saveCoachSettings 持久化");
  assert.match(clientSrc, /chat\/completions/, "端点应为 OpenAI 兼容 chat/completions");
  assert.match(componentSrc, /autoBrief/, "自动简评开关应存在");
});
