import assert from "node:assert/strict";
import test from "node:test";
import {
  chatEndpoint,
  chatCompletion,
  chatCompletionStream,
  CoachError,
} from "../app/lib/coach-client.ts";

const SETTINGS = {
  baseUrl: "https://api.example.com/v1/",
  apiKey: " sk-test ",
  model: "gpt-4o-mini ",
  autoBrief: false,
};

function jsonResponse(content, extra = {}) {
  const payload = { choices: [{ message: { content } }], ...extra };
  return {
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

test("chatEndpoint trims trailing slashes and appends the path", () => {
  assert.equal(chatEndpoint("https://api.example.com/v1/"), "https://api.example.com/v1/chat/completions");
  assert.equal(chatEndpoint("  https://api.example.com/v1//  "), "https://api.example.com/v1/chat/completions");
});

test("chatCompletion sends bearer auth and a compact body", async () => {
  let captured;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return jsonResponse("  白方稍优  ");
  };
  try {
    const content = await chatCompletion(SETTINGS, [
      { role: "system", content: "sys" },
      { role: "user", content: "问" },
    ]);
    assert.equal(content, "白方稍优");
    assert.equal(captured.url, "https://api.example.com/v1/chat/completions");
    assert.equal(captured.init.method, "POST");
    assert.equal(captured.init.headers.Authorization, "Bearer sk-test");
    const body = JSON.parse(captured.init.body);
    assert.equal(body.model, "gpt-4o-mini");
    assert.equal(body.temperature, 0.3);
    assert.equal(body.messages.length, 2);
    // 未显式限制时不应发送 max_tokens
    assert.ok(!("max_tokens" in body));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("maxTokens is forwarded when provided", async () => {
  let captured;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    captured = init;
    return jsonResponse("ok");
  };
  try {
    await chatCompletion(SETTINGS, [{ role: "user", content: "q" }], { maxTokens: 220 });
    assert.equal(JSON.parse(captured.body).max_tokens, 220);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HTTP status codes map to i18n error keys", async () => {
  const cases = [
    [401, "coach.error.invalidKey"],
    [403, "coach.error.invalidKey"],
    [404, "coach.error.badUrl"],
    [429, "coach.error.rate"],
    [500, "coach.error.server"],
  ];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => "" });
  try {
    for (const [status, expectedKey] of cases) {
      globalThis.fetch = async () => ({ ok: false, status, text: async () => "boom" });
      await assert.rejects(
        chatCompletion(SETTINGS, [{ role: "user", content: "q" }]),
        (error) => error instanceof CoachError && error.key === expectedKey,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("network failures and unparsable payloads map to friendly keys", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    await assert.rejects(
      chatCompletion(SETTINGS, [{ role: "user", content: "q" }]),
      (error) => error instanceof CoachError && error.key === "coach.error.network",
    );

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [] }),
      text: async () => "{}",
    });
    await assert.rejects(
      chatCompletion(SETTINGS, [{ role: "user", content: "q" }]),
      (error) => error instanceof CoachError && error.key === "coach.error.badResponse",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reasoning models: empty content falls back to reasoning_content", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    jsonResponse("", {
      choices: [
        { message: { content: "", reasoning_content: "  思考链内容  " } },
      ],
    });
  try {
    const content = await chatCompletion(SETTINGS, [
      { role: "user", content: "q" },
    ]);
    assert.equal(content, "思考链内容");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("empty content is rejected by default but allowed for connection tests", async () => {
  const originalFetch = globalThis.fetch;
  const reply = () => jsonResponse("");
  globalThis.fetch = reply;
  try {
    await assert.rejects(
      chatCompletion(SETTINGS, [{ role: "user", content: "q" }]),
      (error) => error instanceof CoachError && error.key === "coach.error.badResponse",
    );
    const content = await chatCompletion(
      SETTINGS,
      [{ role: "user", content: "ping" }],
      { allowEmptyContent: true },
    );
    assert.equal(content, "");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenAI Response protocol payloads get a targeted error", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ id: "resp_1", object: "response", output: [] }),
    text: async () => JSON.stringify({ id: "resp_1", object: "response", output: [] }),
  });
  try {
    await assert.rejects(
      chatCompletion(SETTINGS, [{ role: "user", content: "q" }]),
      (error) => error instanceof CoachError && error.key === "coach.error.responseApi",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("unreadable payloads carry a raw snippet for debugging", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => "<html>gateway error</html>",
  });
  try {
    await assert.rejects(
      chatCompletion(SETTINGS, [{ role: "user", content: "q" }]),
      (error) =>
        error instanceof CoachError &&
        error.key === "coach.error.badResponse" &&
        error.detail.includes("gateway error"),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("aborted requests rethrow the abort error untouched", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    throw error;
  };
  try {
    await assert.rejects(
      chatCompletion(SETTINGS, [{ role: "user", content: "q" }]),
      (error) => error.name === "AbortError" && !(error instanceof CoachError),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---------- chatCompletionStream ----------

// 伪 SSE 响应：按给定 Uint8Array 分片供给 reader，可精确模拟跨块边界；
// signal 中止时下一次 read 以 AbortError 拒绝（对齐真实 fetch 行为）
function sseStreamResponse(chunks, { status = 200, contentType = "text/event-stream", signal } = {}) {
  let index = 0;
  return {
    ok: status < 400,
    status,
    headers: new Map([["content-type", contentType]]),
    body: {
      getReader() {
        return {
          read: async () => {
            if (signal?.aborted) {
              const error = new Error("The operation was aborted");
              error.name = "AbortError";
              throw error;
            }
            return index < chunks.length
              ? { done: false, value: chunks[index++] }
              : { done: true, value: undefined };
          },
          releaseLock() {},
        };
      },
    },
  };
}

const encoder = new TextEncoder();
const sseEvent = (payload) =>
  encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);

test("chatCompletionStream parses SSE deltas for content and reasoning", async () => {
  let captured;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return sseStreamResponse([
      sseEvent({ choices: [{ delta: { reasoning_content: "思考A" } }] }),
      sseEvent({ choices: [{ delta: { reasoning_content: "继续" } }] }),
      sseEvent({ choices: [{ delta: { content: "结论" } }] }),
      sseEvent({ choices: [{ delta: { content: "：白方稍优" } }] }),
      encoder.encode("data: [DONE]\n\n"),
    ]);
  };
  try {
    const reasoningCalls = [];
    const contentCalls = [];
    const reply = await chatCompletionStream(SETTINGS, [{ role: "user", content: "q" }], {
      onReasoning: (delta) => reasoningCalls.push(delta),
      onContent: (delta) => contentCalls.push(delta),
    });
    assert.equal(reply.content, "结论：白方稍优");
    assert.equal(reply.reasoning, "思考A继续");
    assert.deepEqual(reasoningCalls, ["思考A", "继续"]);
    assert.deepEqual(contentCalls, ["结论", "：白方稍优"]);
    const body = JSON.parse(captured.init.body);
    assert.equal(body.stream, true, "流式请求应携带 stream: true");
    assert.equal(captured.url, "https://api.example.com/v1/chat/completions");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("chatCompletionStream reassembles events split across chunk boundaries", async () => {
  const originalFetch = globalThis.fetch;
  const fullEvent = encoder.encode(
    `data: ${JSON.stringify({ choices: [{ delta: { content: "跨越边界的内容" } }] })}\n\n`,
  );
  const half = Math.floor(fullEvent.length / 2);
  globalThis.fetch = async () =>
    sseStreamResponse([
      fullEvent.slice(0, half),
      fullEvent.slice(half),
      encoder.encode("data: [DONE]\n\n"),
    ]);
  try {
    const contentCalls = [];
    const reply = await chatCompletionStream(SETTINGS, [{ role: "user", content: "q" }], {
      onContent: (delta) => contentCalls.push(delta),
    });
    assert.equal(reply.content, "跨越边界的内容");
    assert.deepEqual(contentCalls, ["跨越边界的内容"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("chatCompletionStream falls back to JSON when the provider ignores stream", async () => {
  const originalFetch = globalThis.fetch;
  const payload = {
    choices: [{ message: { content: "非流式回复", reasoning_content: "思考" } }],
  };
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: new Map([["content-type", "application/json"]]),
    text: async () => JSON.stringify(payload),
  });
  try {
    const reasoningCalls = [];
    const contentCalls = [];
    const reply = await chatCompletionStream(SETTINGS, [{ role: "user", content: "q" }], {
      onReasoning: (delta) => reasoningCalls.push(delta),
      onContent: (delta) => contentCalls.push(delta),
    });
    assert.equal(reply.content, "非流式回复");
    assert.equal(reply.reasoning, "思考");
    assert.deepEqual(reasoningCalls, ["思考"]);
    assert.deepEqual(contentCalls, ["非流式回复"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("chatCompletionStream maps HTTP errors like the non-stream path", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => "" });
  try {
    await assert.rejects(
      chatCompletionStream(SETTINGS, [{ role: "user", content: "q" }]),
      (error) => error instanceof CoachError && error.key === "coach.error.invalidKey",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("chatCompletionStream surfaces in-stream error events", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    sseStreamResponse([
      encoder.encode(
        `data: ${JSON.stringify({ error: { message: "rate limited upstream" } })}\n\n`,
      ),
    ]);
  try {
    await assert.rejects(
      chatCompletionStream(SETTINGS, [{ role: "user", content: "q" }]),
      (error) =>
        error instanceof CoachError &&
        error.key === "coach.error.server" &&
        error.detail?.includes("rate limited upstream"),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("chatCompletionStream rethrows aborts from the read loop", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  globalThis.fetch = async () =>
    sseStreamResponse(
      [sseEvent({ choices: [{ delta: { content: "片段" } }] })],
      { signal: controller.signal },
    );
  try {
    const promise = chatCompletionStream(SETTINGS, [{ role: "user", content: "q" }], {
      signal: controller.signal,
      onContent: () => controller.abort(),
    });
    await assert.rejects(promise, (error) => error.name === "AbortError");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
