import assert from "node:assert/strict";
import test from "node:test";
import {
  chatEndpoint,
  chatCompletion,
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
