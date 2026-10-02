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

// 浏览器直连的公共 POST：统一网络错误与 HTTP 状态码到 i18n 错误映射
async function postChat(
  settings: CoachSettings,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(chatEndpoint(settings.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey.trim()}`,
      },
      body: JSON.stringify(body),
      signal,
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
  return response;
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

  const response = await postChat(settings, body, options.signal);

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

export type StreamedReply = { content: string; reasoning: string };

// 流式对话：SSE 增量回调 onReasoning / onContent，结束后返回完整文本。
// 服务商忽略 stream 参数返回 JSON 时，走非流式解析兜底。
export async function chatCompletionStream(
  settings: CoachSettings,
  messages: ChatMessage[],
  options: {
    signal?: AbortSignal;
    maxTokens?: number;
    onReasoning?: (delta: string) => void;
    onContent?: (delta: string) => void;
  } = {},
): Promise<StreamedReply> {
  const body: Record<string, unknown> = {
    model: settings.model.trim(),
    messages,
    temperature: 0.3,
    stream: true,
  };
  if (options.maxTokens) body.max_tokens = options.maxTokens;

  const response = await postChat(settings, body, options.signal);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    // 兜底：body 为普通 JSON（服务商不支持 stream），一次性解析
    const raw = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new CoachError("coach.error.badResponse", snippet(raw));
    }
    const reply = extractStreamlessReply(data);
    if (reply === null) {
      if (isResponseApiShape(data)) {
        throw new CoachError("coach.error.responseApi");
      }
      throw new CoachError("coach.error.badResponse", snippet(raw));
    }
    options.onReasoning?.(reply.reasoning);
    options.onContent?.(reply.content);
    return reply;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new CoachError("coach.error.badResponse");
  }

  let content = "";
  let reasoning = "";
  let buffer = "";
  const decoder = new TextDecoder();
  // SSE 按行解析；data: 行携带 JSON 增量，[DONE] 结束
  const handleData = (payload: string) => {
    if (!payload || payload === "[DONE]") return;
    let event: unknown;
    try {
      event = JSON.parse(payload);
    } catch {
      return; // 忽略心跳 / 不完整分片
    }
    if (typeof event !== "object" || event === null) return;
    // 部分服务商以流内 error 事件报错
    const errorField = (event as { error?: unknown }).error;
    if (typeof errorField === "object" && errorField !== null) {
      const message = (errorField as { message?: unknown }).message;
      throw new CoachError(
        "coach.error.server",
        typeof message === "string" ? message : snippet(payload),
      );
    }
    const choices = (event as { choices?: unknown }).choices;
    if (!Array.isArray(choices) || choices.length === 0) return;
    const delta = (choices[0] as { delta?: unknown })?.delta;
    if (typeof delta !== "object" || delta === null) return;
    const record = delta as { content?: unknown; reasoning_content?: unknown };
    if (typeof record.reasoning_content === "string" && record.reasoning_content) {
      reasoning += record.reasoning_content;
      options.onReasoning?.(record.reasoning_content);
    }
    if (typeof record.content === "string" && record.content) {
      content += record.content;
      options.onContent?.(record.content);
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data:")) handleData(trimmed.slice(5).trim());
      }
    }
    buffer += decoder.decode();
    for (const line of buffer.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data:")) handleData(trimmed.slice(5).trim());
    }
  } catch (error) {
    // 中止与流内已映射的 CoachError 原样上抛，其余读流异常统一兜底
    if (isAbortError(error) || error instanceof CoachError) throw error;
    throw new CoachError("coach.error.badResponse");
  } finally {
    reader.releaseLock();
  }

  return { content: content.trim(), reasoning: reasoning.trim() };
}

// 非流式兜底：content 与 reasoning_content 分开返回（不再把思考当正文）
function extractStreamlessReply(data: unknown): StreamedReply | null {
  if (typeof data !== "object" || data === null) return null;
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = (choices[0] as { message?: unknown })?.message;
  if (typeof message !== "object" || message === null) return null;
  const record = message as { content?: unknown; reasoning_content?: unknown };
  const content =
    typeof record.content === "string" ? record.content.trim() : "";
  const reasoning =
    typeof record.reasoning_content === "string"
      ? record.reasoning_content.trim()
      : "";
  if (!content && !reasoning) return { content: "", reasoning: "" };
  return { content, reasoning };

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
