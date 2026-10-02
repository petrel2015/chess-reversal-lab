// AI 教练的 prompt 组装：纯函数，无 DOM 依赖，可直接被 node 测试导入。
// 注意：给 LLM 的 prompt 文案放在本模块（而不是 i18n.tsx），因为 i18n.tsx 含 JSX。
import type { Locale } from "./i18n";

export type CoachPhase = "setup" | "playing" | "over";

export type EngineScoreLike = { cp?: number; mate?: number };

// page.tsx 每次渲染时组装；始终描述「用户当前正在看的局面」（含复盘模式）
export type CoachSnapshot = {
  phase: CoachPhase;
  locale: Locale;
  fen: string;
  // true = 用户正在复盘历史局面（非实时局面）
  reviewing: boolean;
  // 正在查看的局面位于第几半步之后（实时局面 = totalPlies）
  viewedPly: number;
  totalPlies: number;
  sanHistory: string[];
  firstMoveColor: "w" | "b";
  // 进入当前查看局面的那一步（被「为什么这么走」追问的对象）
  lastMoveSan: string | null;
  lastMoveBy: "human" | "engine" | null;
  turnToMove: "w" | "b";
  // Stockfish 执子方 = 界面上被指定为「希望获胜的一方」
  engineSide: "w" | "b";
  humanSide: "w" | "b";
  // 仅实时局面有值（白方视角）
  engineScoreWhite: EngineScoreLike | null;
  // 对局结束时的结果描述（已本地化文案）
  endingText: string | null;
};

export type PromptMode = "ask" | "brief";

export function buildSystemPrompt(snapshot: CoachSnapshot): string {
  const zh = snapshot.locale === "zh";
  const engine = sideName(snapshot.locale, snapshot.engineSide);
  const human = sideName(snapshot.locale, snapshot.humanSide);
  if (zh) {
    return [
      "你是一位国际象棋教练，在「逆转棋局实验室」网页应用中为用户讲棋。",
      "",
      "应用玩法：用户自由摆放残局，并指定「希望获胜的一方」；Stockfish 引擎执该方" +
        `（本局执${engine}），每步都选择它认为最佳的着法；用户本人执${human}，` +
        "通过与引擎对弈或复盘来推演局面如何逆转。用户常在追问某一步为什么这么走。",
      "",
      "要求：",
      "- 着法用标准代数记法（SAN），格子用小写坐标（如 e4、g7）。",
      "- 回答先给结论，再给一两个简短的变化说明（如 12...Qg4! 威胁 Qxg2）。",
      "- 局面以上下文中给出的 FEN 为准，不要凭空假设棋子位置；不确定时明确说明。",
      "- 语言简洁，不要长篇开场白，不要重复用户的问题。",
      "- 界面语言是简体中文：无论提问用什么语言，思考过程和最终回答都" +
        "始终只用简体中文，不要夹杂英文句子。",
    ].join("\n");
  }
  return [
    "You are a chess coach working inside the \"Chess Reversal Lab\" web app.",
    "",
    "How the app works: the user sets up a custom position and designates the side " +
      `they want to win. Stockfish plays that side (${engine} in this game) and always ` +
      `picks its best move; the user plays ${human}. They ask why a given move was played.`,
    "",
    "Rules:",
    "- Use standard algebraic notation (SAN) for moves and lowercase squares (e.g. e4, g7).",
    "- Lead with the conclusion, then one or two short variations (e.g. 12...Qg4! threatens Qxg2).",
    "- Trust the FEN given in the context; never invent piece placement. Say so when unsure.",
    "- Be concise: no long preambles, no restating the question.",
    "- The UI language is English: no matter what language the question is " +
      "written in, always think and answer in English only.",
  ].join("\n");
}

export function buildUserMessage(
  snapshot: CoachSnapshot,
  question: string,
  mode: PromptMode = "ask",
): string {
  const zh = snapshot.locale === "zh";
  const lines: string[] = [];
  const label = (name: string) => (zh ? `${name}：` : `${name}: `);

  lines.push(zh ? "【当前局面】" : "[Current position]");
  lines.push(label("FEN") + snapshot.fen);
  if (snapshot.phase === "setup") {
    lines.push(label(zh ? "状态" : "Status") + (zh ? "对局尚未开始，用户正在摆放局面" : "Game not started yet; the user is still setting up the position"));
  } else {
    lines.push(label(zh ? "轮到" : "To move") + sideName(snapshot.locale, snapshot.turnToMove));
    lines.push(label(zh ? "着法记录" : "Moves") + formatSanHistory(snapshot.sanHistory, snapshot.firstMoveColor));
    if (snapshot.lastMoveSan && snapshot.lastMoveBy) {
      const by =
        snapshot.lastMoveBy === "engine"
          ? zh
            ? "引擎（Stockfish）走的"
            : "played by the engine (Stockfish)"
          : zh
            ? "用户走的"
            : "played by the user";
      lines.push(label(zh ? "刚走的一步" : "Last move") + `${snapshot.lastMoveSan}（${by}）`);
    }
    if (!snapshot.reviewing && snapshot.engineScoreWhite) {
      lines.push(label(zh ? "引擎评估" : "Engine evaluation") + formatScore(snapshot.locale, snapshot.engineScoreWhite));
    }
    if (snapshot.reviewing) {
      lines.push(
        label(zh ? "复盘" : "Review") +
          (zh
            ? `正在查看第 ${snapshot.viewedPly}/${snapshot.totalPlies} 步后的局面，非实时局面`
            : `viewing the position after ply ${snapshot.viewedPly} of ${snapshot.totalPlies}, not the live position`),
      );
    }
    lines.push(
      label(zh ? "对局状态" : "Game status") +
        (snapshot.phase === "over" && snapshot.endingText
          ? snapshot.endingText
          : zh
            ? "进行中"
            : "in progress"),
    );
  }

  const questionText =
    mode === "brief"
      ? zh
        ? "请用 1-2 句话点评刚走的这一步棋（无论哪方走的），不要展开长变化。"
        : "In 1-2 sentences, comment on the move just played (by either side). Do not expand into long variations."
      : question;

  // 最后一行重申语言约束：离生成最近的位置对输出语言影响最强，
  // 同时覆盖推理模型的思考过程（否则思考常默认用英文）
  const languageDirective = zh
    ? "【语言要求】\n思考过程与最终回答都只用简体中文。"
    : "[Language]\nThink and answer in English only.";

  return `${lines.join("\n")}\n\n${zh ? "【用户提问】" : "[Question]"}\n${questionText}\n\n${languageDirective}`;
}

function sideName(locale: Locale, color: "w" | "b"): string {
  if (locale === "zh") return color === "w" ? "白方" : "黑方";
  return color === "w" ? "White" : "Black";
}

// 1. e4 e5 2. Nf3 …；若黑方先行则首着记作 1...e5
export function formatSanHistory(sanHistory: string[], firstMoveColor: "w" | "b"): string {
  const parts: string[] = [];
  if (sanHistory.length === 0) return "";
  let index = 0;
  let moveNo = 1;
  if (firstMoveColor === "b") {
    parts.push(`1...${sanHistory[0]}`);
    index = 1;
    moveNo = 2;
  }
  for (; index < sanHistory.length; index += 2) {
    const white = sanHistory[index];
    const black = sanHistory[index + 1];
    parts.push(black ? `${moveNo}. ${white} ${black}` : `${moveNo}. ${white}`);
    moveNo += 1;
  }
  return parts.join(" ");
}

export function formatScore(locale: Locale, score: EngineScoreLike): string {
  const zh = locale === "zh";
  if (typeof score.mate === "number") {
    const n = Math.abs(score.mate);
    return score.mate > 0
      ? zh ? `白方 ${n} 步内可强制将死（M${n}）` : `White mates in ${n} (M${n})`
      : zh ? `黑方 ${n} 步内可强制将死（M${n}）` : `Black mates in ${n} (M${n})`;
  }
  const pawns = (score.cp ?? 0) / 100;
  const sign = pawns > 0 ? "+" : "";
  const value = `${sign}${pawns.toFixed(2)}`;
  return zh
    ? `${value}（白方视角，1.0 约等于一个兵）`
    : `${value} (from White's perspective; 1.0 ≈ one pawn)`;
}
