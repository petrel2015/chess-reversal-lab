"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useI18n } from "../lib/i18n";
import {
  isCoachConfigured,
  loadCoachSettings,
  saveCoachSettings,
  type CoachSettings,
} from "../lib/coach-config";
import {
  buildSystemPrompt,
  buildUserMessage,
  type CoachSnapshot,
} from "../lib/coach-prompt";
import {
  chatCompletion,
  chatCompletionStream,
  CoachError,
  type ChatMessage,
} from "../lib/coach-client";
import { CoachMarkdown } from "./coach-markdown";

type CoachThreadMessage = {
  role: "user" | "assistant";
  content: string;
  // 推理模型的思考过程与耗时，折叠在「已思考 N 秒」里
  reasoning?: string;
  thinkMs?: number;
  // engine 自动简评的回复，样式上带 ♟ 标记
  kind?: "brief";
};

// 流式进行中的一条回复：reasoning/content 增量累积，startedAt 用于计时
type StreamState = {
  reasoning: string;
  content: string;
  startedAt: number;
  // 正文开始输出的时刻；思考秒数冻结在正文出现前
  reasoningEndedAt: number | null;
};

const MODEL_SUGGESTIONS = [
  "glm-5.3-flashx",
  "glm-5.2",
  "deepseek-chat",
  "gpt-4o-mini",
  "gpt-4o",
];
// 发给 API 的历史条数上限：讲棋上下文每次都随当前局面重建，无需长历史
const HISTORY_LIMIT = 8;

// 顶栏入口：仅负责开合与焦点归还（对话状态在 AiCoach 面板里，始终挂载不丢）
export function AiCoachEntry({
  open,
  docked,
  onToggle,
}: {
  open: boolean;
  docked: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const entryRef = useRef<HTMLButtonElement>(null);
  const prevOpenRef = useRef(open);
  useEffect(() => {
    // 抽屉形态关闭时把焦点还给入口；停靠形态不抢焦点
    if (prevOpenRef.current && !open && !docked) entryRef.current?.focus();
    prevOpenRef.current = open;
  }, [open, docked]);

  return (
    <button
      type="button"
      ref={entryRef}
      className="coach-entry"
      aria-label={t("coach.openAria")}
      aria-expanded={open}
      onClick={onToggle}
    >
      {t("coach.entry")}
    </button>
  );
}

export function AiCoach({
  snapshot,
  open,
  docked,
  onClose,
}: {
  snapshot: CoachSnapshot;
  open: boolean;
  docked: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [view, setView] = useState<"chat" | "settings">("chat");
  // 惰性读取 localStorage：面板初始关闭，设置不影响首屏 SSR 输出，无水合风险
  const [settings, setSettings] = useState<CoachSettings>(() => loadCoachSettings());
  const [draft, setDraft] = useState<CoachSettings>(() => loadCoachSettings());
  const [messages, setMessages] = useState<CoachThreadMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [stream, setStream] = useState<StreamState | null>(null);
  const [error, setError] = useState<{ key: string; detail?: string } | null>(
    null,
  );
  // 设置页「测试连接」结果：ok/error 消息直接展示给用户，出错不再静默
  const [testResult, setTestResult] = useState<
    | { status: "testing" }
    | { status: "ok" }
    | { status: "error"; message: string; detail?: string }
    | null
  >(null);
  const [storageWarning, setStorageWarning] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const baseUrlInputRef = useRef<HTMLInputElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // 发送与自动简评都读 ref，避免闭包里的过期局面/配置
  const snapshotRef = useRef(snapshot);
  const settingsRef = useRef(settings);
  const messagesRef = useRef(messages);
  // 已自动简评到哪个半步；-1 表示尚未与当前对局对齐（对齐本身不触发请求）
  const briefPlyRef = useRef(-1);
  const briefAlignedRef = useRef(false);
  // 请求串行队列：自动简评与手动提问不互相掐断
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const activeRef = useRef(0);
  // 思考计时：流式期间每 500ms 跳动一次
  const [nowTick, setNowTick] = useState(() => Date.now());
  const streaming = stream !== null;
  useEffect(() => {
    if (!streaming) return;
    // 不在 effect 内同步 setState：nowTick 短暂落后时 elapsed 为负，
    // streamElapsed 已钳到 0，首个 500ms tick 后开始正常跳动
    const id = window.setInterval(() => setNowTick(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [streaming]);

  useEffect(() => {
    snapshotRef.current = snapshot;
    settingsRef.current = settings;
    messagesRef.current = messages;
  });

  const configured = isCoachConfigured(settings);

  // 面板打开：焦点移入对话输入框
  useEffect(() => {
    if (!open || view !== "chat") return;
    if (configured) inputRef.current?.focus();
  }, [open, view, configured]);

  // 抽屉形态：Escape 关闭；停靠形态不响应（面板不遮挡棋盘）
  useEffect(() => {
    if (!open || docked) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [open, docked, onClose]);

  // 停靠形态：面板高度 = 视口底边 - 面板顶边；未滚动时输入框也完整可见，
  // 向下滚动面板被 sticky 钉住后自动长到全高
  useEffect(() => {
    if (!open || !docked) return;
    const el = panelRef.current;
    if (!el) return;
    const sync = () => {
      const top = el.getBoundingClientRect().top;
      // 不得超过所在网格行高（留 24px 余量），否则 sticky 无活动空间、面板无法钉住
      const rowHeight = el.parentElement?.getBoundingClientRect().height ?? 0;
      const viewportFit = window.innerHeight - Math.max(top, 0) - 12;
      const height = Math.min(
        viewportFit,
        rowHeight > 0 ? rowHeight - 24 : viewportFit,
      );
      el.style.height = `${Math.max(420, height)}px`;
    };
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, { passive: true });
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync);
      el.style.height = "";
    };
  }, [open, docked]);

  useEffect(() => {
    const node = messagesScrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, loading, error, stream]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const runRequest = useCallback(
    async (
      settings: CoachSettings,
      payload: ChatMessage[],
      question: string,
      mode: "ask" | "brief",
    ) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setError(null);
      activeRef.current += 1;
      setLoading(true);
      // 计时用闭包局部变量：正文首个增量到达时冻结思考时长
      const startedAt = Date.now();
      let reasoningEndedAt: number | null = null;
      setStream({
        reasoning: "",
        content: "",
        startedAt,
        reasoningEndedAt: null,
      });
      if (mode === "ask") {
        // 对话气泡显示用户原始提问；完整上下文只进请求 payload
        setMessages((current) => [...current, { role: "user", content: question }]);
      }
      try {
        const reply = await chatCompletionStream(settings, payload, {
          signal: controller.signal,
          // 推理模型的思考过程同样消耗 max_tokens：额度太小（如此前的 220）时
          // 思考吃光额度、正文为空，英文思考会被当作回复展示，故放宽到 1024
          maxTokens: mode === "brief" ? 1024 : undefined,
          onReasoning: (delta) =>
            setStream((current) =>
              current ? { ...current, reasoning: current.reasoning + delta } : current,
            ),
          onContent: (delta) =>
            setStream((current) => {
              reasoningEndedAt ??= Date.now();
              if (!current) return current;
              return {
                ...current,
                content: current.content + delta,
                reasoningEndedAt: current.reasoningEndedAt ?? Date.now(),
              };
            }),
        });
        // 仅返回思考没有正文时（部分推理模型行为），把思考内容当正文展示
        const content = reply.content || reply.reasoning;
        if (!content) {
          throw new CoachError("coach.error.badResponse");
        }
        const reasoning = reply.content ? reply.reasoning : "";
        const thinkMs =
          reasoning && reasoningEndedAt
            ? reasoningEndedAt - startedAt
            : undefined;
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            content,
            reasoning,
            thinkMs,
            kind: mode === "brief" ? "brief" : undefined,
          },
        ]);
      } catch (caught) {
        if (caught instanceof Error && caught.name === "AbortError") return;
        if (caught instanceof CoachError) {
          setError({ key: caught.key, detail: caught.detail });
        } else {
          setError({ key: "coach.error.badResponse" });
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        activeRef.current -= 1;
        if (activeRef.current === 0) setLoading(false);
        setStream(null);
      }
    },
    [],
  );

  // 入队即组装 payload：快照与历史取触发瞬间的局面，排队期间走棋不影响上下文
  const send = useCallback((question: string, mode: "ask" | "brief") => {
    const currentSettings = settingsRef.current;
    if (!isCoachConfigured(currentSettings)) return;
    const trimmed = question.trim();
    if (mode === "ask" && !trimmed) return;
    const snap = snapshotRef.current;
    const history = messagesRef.current
      .slice(-HISTORY_LIMIT)
      .map(({ role, content }) => ({ role, content }));
    const payload: ChatMessage[] = [
      { role: "system", content: buildSystemPrompt(snap) },
      ...history,
      { role: "user", content: buildUserMessage(snap, trimmed, mode) },
    ];
    queueRef.current = queueRef.current
      .then(() => runRequest(currentSettings, payload, trimmed, mode))
      .catch(() => {});
  }, [runRequest]);

  // 每走一步自动简评：开启开关、已配置、实时对局、步数前进即触发；
  // 不看面板开关状态（面板收起时也在后台评，消息累积在对话里）
  useEffect(() => {
    if (!settings.autoBrief || !configured) return;
    if (snapshot.phase === "setup" || snapshot.reviewing) return;
    if (!briefAlignedRef.current) {
      // 首次对齐当前局面，不追评开启开关之前的那一步
      briefAlignedRef.current = true;
      briefPlyRef.current = snapshot.totalPlies;
      return;
    }
    if (snapshot.totalPlies < briefPlyRef.current) {
      // 悔棋回退后重新对齐
      briefPlyRef.current = snapshot.totalPlies;
      return;
    }
    if (snapshot.totalPlies <= briefPlyRef.current) return;
    briefPlyRef.current = snapshot.totalPlies;
    send("", "brief");
  }, [settings.autoBrief, configured, snapshot, send]);

  const submitQuestion = () => {
    const question = input;
    setInput("");
    send(question, "ask");
  };

  const saveDraft = () => {
    const next: CoachSettings = {
      baseUrl: draft.baseUrl.trim(),
      apiKey: draft.apiKey.trim(),
      model: draft.model.trim(),
      autoBrief: draft.autoBrief,
    };
    setSettings(next);
    setStorageWarning(!saveCoachSettings(next));
    setView("chat");
  };

  // 用表单里的草稿值（而非已保存值）发一个最小请求，立即验证配置可用性
  const testConnection = async () => {
    const candidate: CoachSettings = {
      baseUrl: draft.baseUrl.trim(),
      apiKey: draft.apiKey.trim(),
      model: draft.model.trim(),
      autoBrief: draft.autoBrief,
    };
    if (!isCoachConfigured(candidate)) return;
    setTestResult({ status: "testing" });
    try {
      // 200 且结构合法即算连通：推理模型（GLM 等）在小 max_tokens 下
      // content 可能为空串，不作为失败
      await chatCompletion(candidate, [{ role: "user", content: "ping" }], {
        maxTokens: 64,
        allowEmptyContent: true,
      });
      setTestResult({ status: "ok" });
    } catch (caught) {
      setTestResult({
        status: "error",
        message:
          caught instanceof CoachError
            ? t(caught.key)
            : t("coach.error.badResponse"),
        detail: caught instanceof CoachError ? caught.detail : undefined,
      });
    }
  };

  return (
    <>
      {!docked && open && (
        <div className="coach-backdrop" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        ref={panelRef}
        className={`coach-panel${open ? " open" : ""}`}
        data-docked={docked || undefined}
        role={docked ? "complementary" : "dialog"}
        aria-modal={docked ? undefined : true}
        aria-label={t("coach.title")}
      >
        {/* 内容仅在打开时挂载：面板常驻导致的 localStorage 读取
            （loadCoachSettings 惰性初始化）会破坏 SSR 水合一致性 */}
        {open && (
          <>
        <header className="coach-header">
          <div className="coach-heading">
            <strong>{t("coach.title")}</strong>
            <small>{t("coach.subtitle")}</small>
          </div>
          {view === "settings" ? (
            <button
              type="button"
              className="coach-back"
              onClick={() => setView("chat")}
            >
              {t("coach.back")}
            </button>
          ) : (
            <button
              type="button"
              className="coach-gear"
              aria-label={t("coach.settings.title")}
              title={t("coach.settings.title")}
              onClick={() => {
                setDraft(settings);
                setTestResult(null);
                setView("settings");
              }}
            >
              ⚙
            </button>
          )}
          <button
            type="button"
            className="coach-close"
            onClick={onClose}
            aria-label={t("coach.close")}
          >
            ×
          </button>
        </header>

        {view === "settings" ? (
          <form
            className="coach-settings"
            onSubmit={(event) => {
              event.preventDefault();
              saveDraft();
            }}
          >
            <label>
              <span>{t("coach.settings.baseUrl")}</span>
              <input
                ref={baseUrlInputRef}
                value={draft.baseUrl}
                onChange={(event) =>
                  setDraft({ ...draft, baseUrl: event.target.value })
                }
                placeholder="https://open.bigmodel.cn/api/coding/paas/v4"
                inputMode="url"
              />
              <small>{t("coach.settings.baseUrlHint")}</small>
            </label>
            <label>
              <span>{t("coach.settings.apiKey")}</span>
              <input
                type="password"
                value={draft.apiKey}
                onChange={(event) =>
                  setDraft({ ...draft, apiKey: event.target.value })
                }
                placeholder="sk-…"
                autoComplete="off"
              />
              <small>{t("coach.settings.apiKeyHint")}</small>
            </label>
            <label>
              <span>{t("coach.settings.model")}</span>
              <input
                value={draft.model}
                onChange={(event) =>
                  setDraft({ ...draft, model: event.target.value })
                }
                list="coach-model-suggestions"
              />
              <datalist id="coach-model-suggestions">
                {MODEL_SUGGESTIONS.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            </label>
            <label className="coach-toggle">
              <span className="coach-toggle-row">
                <input
                  type="checkbox"
                  checked={draft.autoBrief}
                  onChange={(event) =>
                    setDraft({ ...draft, autoBrief: event.target.checked })
                  }
                />
                {t("coach.settings.autoBrief")}
              </span>
              <small>{t("coach.settings.autoBriefHint")}</small>
            </label>
            <button type="submit" className="coach-save">
              {t("coach.settings.save")}
            </button>
            <div className="coach-test-row">
              <button
                type="button"
                className="coach-test"
                disabled={
                  !isCoachConfigured(draft) || testResult?.status === "testing"
                }
                onClick={() => void testConnection()}
              >
                {testResult?.status === "testing"
                  ? t("coach.settings.testing")
                  : t("coach.settings.test")}
              </button>
              {testResult?.status === "ok" && (
                <p className="coach-test-result ok" role="status">
                  {t("coach.test.ok")}
                </p>
              )}
              {testResult?.status === "error" && (
                <p className="coach-test-result fail" role="alert">
                  {testResult.message}
                  {testResult.detail ? `（${testResult.detail}）` : ""}
                </p>
              )}
              {storageWarning && (
                <p className="coach-test-result fail" role="alert">
                  {t("coach.error.storage")}
                </p>
              )}
            </div>
          </form>
        ) : (
          <>
            <div
              className="coach-messages"
              ref={messagesScrollRef}
              aria-live="polite"
              aria-label={t("coach.messagesAria")}
            >
              {storageWarning && (
                <div className="coach-error" role="alert">
                  <p>{t("coach.error.storage")}</p>
                </div>
              )}
              {messages.length === 0 && !configured && (
                <div className="coach-empty">
                  <strong>{t("coach.unconfiguredTitle")}</strong>
                  <p>{t("coach.unconfiguredCopy")}</p>
                  <button
                    type="button"
                    className="coach-cta"
                    onClick={() => setView("settings")}
                  >
                    {t("coach.unconfiguredCta")}
                  </button>
                </div>
              )}
              {messages.length === 0 && configured && (
                <p className="coach-hintline">
                  {snapshot.phase === "setup"
                    ? t("coach.noMoves")
                    : t("coach.subtitle")}
                </p>
              )}
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`coach-msg ${message.role}${message.kind === "brief" ? " brief" : ""}`}
                >
                  {message.kind === "brief" && (
                    <span className="coach-brief-tag">{t("coach.briefTag")}</span>
                  )}
                  <ThinkSection
                    reasoning={message.reasoning}
                    seconds={
                      message.thinkMs !== undefined
                        ? Math.round(message.thinkMs / 1000)
                        : 0
                    }
                  />
                  {message.role === "assistant" ? (
                    <CoachMarkdown text={message.content} />
                  ) : (
                    <p>{message.content}</p>
                  )}
                </div>
              ))}
              {stream && (
                <div className="coach-msg assistant pending">
                  <ThinkSection
                    live
                    reasoning={stream.reasoning}
                    contentStarted={Boolean(stream.content)}
                    seconds={streamElapsed(stream, nowTick)}
                  />
                  {stream.content && <CoachMarkdown text={stream.content} />}
                </div>
              )}
              {error && (
                <div className="coach-error" role="alert">
                  <p>
                    {t(error.key)}
                    {error.detail ? `（${error.detail}）` : ""}
                  </p>
                </div>
              )}
            </div>

            <div
              className="coach-chips"
              role="group"
              aria-label={t("coach.quickAria")}
            >
              <button
                type="button"
                disabled={!configured || loading || !snapshot.lastMoveSan}
                onClick={() =>
                  send(
                    t("coach.quick.explainQ", {
                      san: snapshot.lastMoveSan ?? "",
                    }),
                    "ask",
                  )
                }
              >
                {t("coach.quick.explain")}
              </button>
              <button
                type="button"
                disabled={!configured || loading}
                onClick={() => send(t("coach.quick.evaluateQ"), "ask")}
              >
                {t("coach.quick.evaluate")}
              </button>
              <button
                type="button"
                disabled={!configured || loading}
                onClick={() => send(t("coach.quick.suggestQ"), "ask")}
              >
                {t("coach.quick.suggest")}
              </button>
              {messages.length > 0 && (
                <button
                  type="button"
                  className="coach-clear"
                  disabled={loading}
                  onClick={() => {
                    setMessages([]);
                    setError(null);
                  }}
                >
                  {t("coach.clear")}
                </button>
              )}
            </div>

            <form
              className="coach-input-row"
              onSubmit={(event) => {
                event.preventDefault();
                submitQuestion();
              }}
            >
              <textarea
                ref={inputRef}
                rows={2}
                value={input}
                aria-label={t("coach.inputAria")}
                placeholder={
                  configured ? t("coach.placeholder") : t("coach.unconfiguredCta")
                }
                disabled={!configured}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submitQuestion();
                  }
                }}
              />
              <button
                type="submit"
                disabled={!configured || loading || !input.trim()}
              >
                {t("coach.send")}
              </button>
            </form>
          </>
        )}
          </>
        )}
      </aside>
    </>
  );
}

// 思考块：一行「已思考 N 秒」，思考中带走马灯，点开看完整推理
function ThinkSection({
  reasoning,
  seconds,
  live = false,
  contentStarted = false,
}: {
  reasoning?: string;
  seconds: number;
  live?: boolean;
  contentStarted?: boolean;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  // 无思考过程的模型（或仅思考无正文的历史消息）不渲染思考块
  if (!live && !reasoning) return null;
  const label = reasoning
    ? t("coach.thinkSeconds", { seconds })
    : t("coach.thinking");
  return (
    <div className="coach-think" data-live={live || undefined}>
      <button
        type="button"
        className="coach-think-header"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        {live && <span className="coach-think-dot" aria-hidden="true" />}
        <span className="coach-think-label">{label}</span>
        {reasoning && (
          <span className="coach-think-chevron" aria-hidden="true">
            {expanded ? "▾" : "▸"}
          </span>
        )}
      </button>
      {reasoning && expanded && (
        <div className="coach-think-body">{reasoning}</div>
      )}
      {reasoning && !expanded && live && !contentStarted && (
        <div className="coach-think-marquee" aria-hidden="true">
          <span>{reasoning.slice(-160)}</span>
        </div>
      )}
    </div>
  );
}

function streamElapsed(stream: StreamState, now: number): number {
  const end = stream.content ? stream.reasoningEndedAt ?? now : now;
  return Math.max(0, Math.round((end - stream.startedAt) / 1000));
}
