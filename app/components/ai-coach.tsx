"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  CoachError,
  type ChatMessage,
} from "../lib/coach-client";

type CoachThreadMessage = {
  role: "user" | "assistant";
  content: string;
  // engine 自动简评的回复，样式上带 ♟ 标记
  kind?: "brief";
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

export function AiCoach({ snapshot }: { snapshot: CoachSnapshot }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"chat" | "settings">("chat");
  // 惰性读取 localStorage：抽屉初始关闭，设置不影响首屏 SSR 输出，无水合风险
  const [settings, setSettings] = useState<CoachSettings>(() => loadCoachSettings());
  const [draft, setDraft] = useState<CoachSettings>(() => loadCoachSettings());
  const [messages, setMessages] = useState<CoachThreadMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
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
  const entryRef = useRef<HTMLButtonElement>(null);
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

  useEffect(() => {
    snapshotRef.current = snapshot;
    settingsRef.current = settings;
    messagesRef.current = messages;
  });

  const configured = isCoachConfigured(settings);

  // 抽屉打开：焦点移入；关闭：中止在途请求、焦点归还入口
  useEffect(() => {
    if (!open) return;
    if (view === "settings") baseUrlInputRef.current?.focus();
    else if (configured) inputRef.current?.focus();
  }, [open, view, configured]);

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

  useEffect(() => {
    const node = messagesScrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, loading, error]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const send = useCallback(
    async (question: string, mode: "ask" | "brief") => {
      const currentSettings = settingsRef.current;
      if (!isCoachConfigured(currentSettings)) return;
      const trimmed = question.trim();
      if (mode === "ask" && !trimmed) return;

      // 新请求中止旧请求（连续自动简评 / 用户打断简评）
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const snap = snapshotRef.current;
      const history = messagesRef.current
        .slice(-HISTORY_LIMIT)
        .map(({ role, content }) => ({ role, content }));
      const payload: ChatMessage[] = [
        { role: "system", content: buildSystemPrompt(snap) },
        ...history,
        { role: "user", content: buildUserMessage(snap, trimmed, mode) },
      ];

      setError(null);
      setLoading(true);
      if (mode === "ask") {
        setMessages((current) => [...current, { role: "user", content: trimmed }]);
      }
      try {
        const content = await chatCompletion(currentSettings, payload, {
          signal: controller.signal,
          maxTokens: mode === "brief" ? 220 : undefined,
        });
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            content,
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
        if (abortRef.current === controller) {
          abortRef.current = null;
          setLoading(false);
        }
      }
    },
    [],
  );

  // 引擎每走一步自动简评：仅抽屉打开、实时局面、开启开关时触发
  useEffect(() => {
    if (!open || view !== "chat" || !settings.autoBrief || !configured) return;
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
    if (snapshot.lastMoveBy !== "engine") return;
    if (snapshot.totalPlies <= briefPlyRef.current) return;
    briefPlyRef.current = snapshot.totalPlies;
    void send("", "brief");
  }, [open, view, settings.autoBrief, configured, snapshot, send]);

  const closeDrawer = () => {
    abortRef.current?.abort();
    setOpen(false);
  };

  const submitQuestion = () => {
    const question = input;
    setInput("");
    void send(question, "ask");
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
      <button
        type="button"
        ref={entryRef}
        className="coach-entry"
        aria-label={t("coach.openAria")}
        onClick={() => setOpen(true)}
      >
        {t("coach.entry")}
      </button>

      {open && (
        <div
          className="coach-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t("coach.title")}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeDrawer();
          }}
        >
          <section className="coach-drawer">
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
                onClick={closeDrawer}
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
                    placeholder="https://api.openai.com/v1"
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
                      <p>{message.content}</p>
                    </div>
                  ))}
                  {loading && (
                    <div className="coach-msg assistant pending">
                      <p>{t("coach.thinking")}</p>
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
                      void send(
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
                    onClick={() => void send(t("coach.quick.evaluateQ"), "ask")}
                  >
                    {t("coach.quick.evaluate")}
                  </button>
                  <button
                    type="button"
                    disabled={!configured || loading}
                    onClick={() => void send(t("coach.quick.suggestQ"), "ask")}
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
          </section>
        </div>
      )}
    </>
  );
}
