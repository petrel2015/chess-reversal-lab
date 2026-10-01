// OpenAI 兼容 chat/completions 客户端：浏览器直连，错误映射为 i18n key 交给组件渲染。
import type { CoachSettings } from "./coach-config";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

// key 为 i18n key；detail 为可选的原始错误信息（用于服务端返回的提示）
export class CoachError extends Error {
  key: string;
  detail?: string;

  constructor(key: string, detail?: string) {
    super(detail ?? key);
    this.name = "CoachError";
    this.key = key;
    this.detail = detail;
  }
}

export function chatEndpoint(baseUrl: string): string {
  return `${baseUrl.trim().replace(/\/+$/, "")}/chat/completions`;
}

export async function chatCompletion(
  settings: CoachSettings,
  messages: ChatMessage[],
  options: { signal?: AbortSignal; maxTokens?: number } = {},
): Promise<string> {
  const body: Record<string, unknown> = {
    model: settings.model.trim(),
    messages,
    temperature: 0.3,
  };
  if (options.maxTokens) body.max_tokens = options.maxTokens;

  let response: Response;
  try {
    response = await fetch(chatEndpoint(settings.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey.trim()}`,
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    // 断网 / DNS / CORS 拦截都会走到这里
    throw new CoachError("coach.error.network");
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (response.status === 401 || response.status === 403) {
      throw new CoachError("coach.error.invalidKey");
    }
    if (response.status === 404) {
      throw new CoachError("coach.error.badUrl");
    }
    if (response.status === 429) {
      throw new CoachError("coach.error.rate");
    }
    if (response.status >= 500) {
      throw new CoachError("coach.error.server");
    }
    throw new CoachError("coach.error.server", `${response.status} ${text}`.trim());
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new CoachError("coach.error.badResponse");
  }
  const content = extractContent(data);
  if (!content) throw new CoachError("coach.error.badResponse");
  return content;
}

function extractContent(data: unknown): string {
  if (typeof data !== "object" || data === null) return "";
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const first = choices[0] as { message?: { content?: unknown } };
  const message = first?.message;
  if (!message || typeof message.content !== "string") return "";
  return message.content.trim();
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}
