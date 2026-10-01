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
  options: {
    signal?: AbortSignal;
    maxTokens?: number;
    // 测试连接时允许空回复：HTTP 200 且结构合法即视为连通（推理模型小
    // max_tokens 下 content 可能为空串）
    allowEmptyContent?: boolean;
  } = {},
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
  let raw = "";
  try {
    raw = await response.text();
    data = JSON.parse(raw);
  } catch {
    throw new CoachError("coach.error.badResponse", snippet(raw));
  }

  const content = extractMessage(data);
  if (content === null) {
    // 命中 OpenAI Response 协议形状（无 choices、有 output）：端点填错
    if (isResponseApiShape(data)) {
      throw new CoachError("coach.error.responseApi");
    }
    throw new CoachError("coach.error.badResponse", snippet(raw));
  }
  if (!content && !options.allowEmptyContent) {
    throw new CoachError("coach.error.badResponse", snippet(raw));
  }
  return content;
}

// 返回 choices[0].message 的文本；GLM 等推理模型 content 为空时回退
// reasoning_content。结构不合法返回 null。
function extractMessage(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = (choices[0] as { message?: unknown })?.message;
  if (typeof message !== "object" || message === null) return null;
  const record = message as { content?: unknown; reasoning_content?: unknown };
  const content =
    typeof record.content === "string" ? record.content.trim() : "";
  if (content) return content;
  if (typeof record.reasoning_content === "string") {
    return record.reasoning_content.trim();
  }
  return "";
}

// 智谱 /api/v1 等 OpenAI Response 协议端点：返回体没有 choices 而是 output
function isResponseApiShape(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const record = data as { choices?: unknown; output?: unknown; object?: unknown };
  return record.choices === undefined && record.output !== undefined;
}

// 把原始返回片段附进错误信息，方便用户看到服务商到底回了什么
function snippet(raw: string): string {
  const text = raw.replace(/\s+/g, " ").trim();
  return text.slice(0, 160);
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}
