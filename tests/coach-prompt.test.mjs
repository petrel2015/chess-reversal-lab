import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSystemPrompt,
  buildUserMessage,
  formatSanHistory,
  formatScore,
} from "../app/lib/coach-prompt.ts";

const LIVE_FEN = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPPPPP1/RNBQKBNR w - - 0 1";

function baseSnapshot(overrides = {}) {
  return {
    phase: "playing",
    locale: "zh",
    fen: LIVE_FEN,
    reviewing: false,
    viewedPly: 3,
    totalPlies: 3,
    sanHistory: ["e4", "e5", "Nf3"],
    firstMoveColor: "w",
    lastMoveSan: "Nf3",
    lastMoveBy: "engine",
    turnToMove: "b",
    engineSide: "w",
    humanSide: "b",
    engineScoreWhite: { cp: 30 },
    endingText: null,
    ...overrides,
  };
}

test("system prompt states the app premise and the language rule (zh)", () => {
  const prompt = buildSystemPrompt(baseSnapshot());
  assert.match(prompt, /国际象棋教练/);
  assert.match(prompt, /Stockfish/);
  assert.match(prompt, /本局执白方/);
  assert.match(prompt, /用户本人执黑方/);
  assert.match(prompt, /FEN/);
  assert.match(prompt, /始终用简体中文回答/);
});

test("system prompt is English and names the engine side (en)", () => {
  const prompt = buildSystemPrompt(baseSnapshot({ locale: "en", engineSide: "b", humanSide: "w" }));
  assert.match(prompt, /chess coach/i);
  assert.match(prompt, /Stockfish plays that side \(Black in this game\)/);
  assert.match(prompt, /the user plays White/);
  assert.match(prompt, /Always answer in English/);
  assert.doesNotMatch(prompt, /中文/);
});

test("ask message embeds FEN, numbered SAN, last move attribution and evaluation", () => {
  const message = buildUserMessage(baseSnapshot(), "为什么走 Nf3？");
  assert.match(message, new RegExp(LIVE_FEN.replace(/\//g, "\\/")));
  assert.match(message, /着法记录：1\. e4 e5 2\. Nf3/);
  assert.match(message, /刚走的一步：Nf3（引擎（Stockfish）走的）/);
  assert.match(message, /引擎评估：\+0\.30（白方视角/);
  assert.match(message, /轮到：黑方/);
  assert.match(message, /【用户提问】\n为什么走 Nf3？/);
  // 实时局面不应出现复盘标记
  assert.ok(!message.includes("复盘："));
});

test("review snapshot keeps the review marker and drops the engine evaluation", () => {
  const message = buildUserMessage(
    baseSnapshot({ reviewing: true, viewedPly: 2, lastMoveSan: "e5", lastMoveBy: "human", engineScoreWhite: { cp: 30 } }),
    "这步 e5 有问题吗？",
  );
  assert.match(message, /复盘：正在查看第 2\/3 步后的局面，非实时局面/);
  assert.match(message, /刚走的一步：e5（用户走的）/);
  assert.ok(!message.includes("引擎评估"));
});

test("mate scores are formatted as forced mate, cp as pawns", () => {
  assert.match(formatScore("zh", { mate: 3 }), /白方 3 步内可强制将死（M3）/);
  assert.match(formatScore("zh", { mate: -2 }), /黑方 2 步内可强制将死（M2）/);
  assert.match(formatScore("en", { cp: 180 }), /\+1\.80 \(from White's perspective/);
});

test("SAN history pairing handles white-first, black-first and partial turns", () => {
  assert.equal(formatSanHistory(["e4", "e5", "Nf3"], "w"), "1. e4 e5 2. Nf3");
  assert.equal(formatSanHistory(["e5", "Nf3", "Nc6"], "b"), "1...e5 2. Nf3 Nc6");
  assert.equal(formatSanHistory([], "w"), "");
});

test("brief mode replaces the question with a two-sentence instruction", () => {
  const message = buildUserMessage(baseSnapshot(), "ignored", "brief");
  assert.match(message, /请用 1-2 句话点评刚走的这一步棋（无论哪方走的）/);
  assert.ok(!message.includes("ignored"));
  const en = buildUserMessage(baseSnapshot({ locale: "en" }), "ignored", "brief");
  assert.match(en, /In 1-2 sentences, comment on the move just played/);
});

test("setup phase describes the board without a move list", () => {
  const message = buildUserMessage(
    baseSnapshot({ phase: "setup", sanHistory: [], lastMoveSan: null, lastMoveBy: null, engineScoreWhite: null }),
    "这个局面白方有机会吗？",
  );
  assert.match(message, /对局尚未开始，用户正在摆放局面/);
  assert.ok(!message.includes("着法记录："));
  assert.match(message, /这个局面白方有机会吗？/);
});
