"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Locale = "zh" | "en";

export type TranslateFn = (
  key: string,
  params?: Record<string, string | number>,
) => string;

const STORAGE_KEY = "locale";

const zh: Record<string, string> = {
  // meta
  "meta.title": "逆转棋局 · AI 国际象棋推演",
  "meta.titleShort": "逆转棋局",
  // brand
  "brand.name": "逆转棋局",
  "brand.tagline": "POSITION LAB",
  "brand.homeAria": "逆转棋局首页",
  // engine states
  "engine.loading": "引擎载入中",
  "engine.ready": "Stockfish 17.1 已就绪",
  "engine.thinking": "Stockfish 正在思考",
  "engine.error": "引擎不可用",
  // hero
  "hero.eyebrow": "CUSTOM CHESS SCENARIO",
  "hero.titleLead": "摆下残局，",
  "hero.titleEm": "推演逆转。",
  "hero.copy":
    "自由布置棋子，指定你希望获胜的一方。AI 会寻找最佳路线，但不会把理论败局伪装成必胜。",
  // stepper
  "stepper.aria": "操作步骤",
  "stepper.place": "布置棋子",
  "stepper.side": "选择阵营",
  "stepper.start": "开始推演",
  // turn banner
  "turn.setup": "摆棋模式",
  "turn.over": "对局结束",
  "turn.ai": "AI 回合",
  "turn.you": "你的回合",
  // flip
  "flip.aria": "翻转棋盘视角，仅改变显示方向",
  "flip.title": "仅改变棋盘观看方向，不会重置棋局",
  "flip.label": "翻转视角",
  // presets
  "preset.title": "选择起始棋盘",
  "preset.hint": "之后仍可自由增删、移动棋子",
  "preset.empty": "空棋盘",
  "preset.standard": "标准开局",
  // board actions
  "action.changeGame": "改变棋局",
  "action.undo": "悔棋",
  "action.redo": "恢复",
  "action.review": "回看棋谱",
  "action.prev": "上一步",
  "action.next": "下一步",
  "action.resetSetup": "重摆开局",
  "action.resetFromCurrent": "从当前局面重摆",
  "review.idle": "回看不会改变棋局",
  "review.active": "正在回看 {ply}/{total} 步",
  // control panel
  "panel.configLabel": "MATCH CONFIGURATION",
  "panel.setupHeading": "对局设置",
  "panel.statusHeading": "局面状态",
  // selection toolbar
  "select.selected": "已选中 {square}",
  "select.hint": "点另一个格子移动；有棋子时会交换位置",
  "select.cancelAria": "取消选择",
  "select.return": "放回棋子库",
  // edit hint
  "editHint.title": "摆棋提示",
  "editHint.body": "棋子可自由挪动或放回棋子库，手机直接点按即可。",
  // setup config
  "config.winnerLegend": "希望哪方获胜？",
  "config.winnerHelp": "Stockfish 将控制这一方，并始终寻找最佳着法。",
  "config.turnLegend": "接下来谁走？",
  "config.turnWhite": "白方先走",
  "config.turnBlack": "黑方先走",
  "config.timeLegend": "AI 思考时间",
  "config.timeValue": "{seconds} 秒",
  "config.timeFast": "快速",
  "config.timeDeep": "深入",
  // validation box
  "validate.notReady": "局面尚未就绪",
  "validate.ready": "局面可以开始",
  "validate.ok": "基础合法性检查已通过",
  // validatePosition keys
  "validate.oneKing": "双方必须各有且只有一个王",
  "validate.kingsAdjacent": "两个王不能相邻",
  "validate.pawnRank": "兵不能摆在第一排或第八排",
  "validate.bothInCheck": "双方的王不能同时被将军",
  "validate.wrongSideCheck": "未轮到走的一方不能正处于被将军状态",
  "validate.invalid": "当前摆法无法构成合法局面",
  // start button
  "start.label": "开始推演",
  // play status
  "eval.label": "ENGINE EVALUATION",
  "eval.note": "评估始终以指定获胜方为视角",
  "side.aiControl": "AI 控制",
  "side.youSimulate": "你模拟",
  "moves.heading": "行棋记录",
  "moves.count": "{count} 步",
  "moves.empty": "第一步尚未落下",
  // footer
  "footer.note": "仅用于自定义残局研究与本地推演",
  "footer.engine": "Stockfish 17.1 · GPLv3 · 无法保证理论败势逆转",
  // dynamic messages
  "msg.loadedStandard": "已加载标准开局，可直接开始或继续调整",
  "msg.loadedStandardFull": "已加载标准开局：32 枚棋子就位，白方先走",
  "msg.simulateTurn": "轮到你模拟{side}落子",
  "msg.engineIllegal": "引擎返回了无法执行的棋步",
  "msg.pawnRankPlace": "兵不能放在第一排或第八排",
  "msg.pawnRankMove": "兵不能移动到第一排或第八排",
  "msg.pieceUsedUp": "{color}{name}已经全部用完",
  "msg.piecePlaced": "{color}{name}已放到 {square}，可继续选择棋子",
  "msg.swapped": "已交换 {from} 与 {to} 的棋子",
  "msg.moved": "已将棋子从 {from} 移到 {to}",
  "msg.selectedSquare": "已选中 {square} 的{color}{name}，点击目标格移动",
  "msg.reviewingBlocked": "正在回看第 {ply}/{total} 步，请用“下一步”回到当前局面",
  "msg.illegalMove": "这不是一个合法棋步；兵不能后退",
  "msg.evalWaitingReeval": "等待引擎重新评估",
  "msg.moveValid": "落子有效，轮到 AI",
  "msg.moveValidateFail": "走法校验失败，请重新选择棋子",
  "msg.evalWaiting": "等待引擎评估",
  "msg.positionLocked": "局面已锁定，AI 准备落子",
  "msg.pleaseSimulate": "请先模拟{side}落子",
  "msg.initFailed": "局面初始化失败，请检查摆法",
  "msg.cleared": "棋盘已清空，重新布置残局",
  "msg.restoredSetup": "已恢复本局开始前的摆法，可重新调整",
  "msg.backToSetup": "已返回摆棋模式",
  "msg.setCurrentStart": "已将当前最新局面设为新起点，可继续摆棋",
  "msg.nothingToUndo": "还没有可以撤销的己方棋步",
  "msg.undone": "已悔棋，轮到你重新落子",
  "msg.alreadyLatest": "已经恢复到最新一步",
  "msg.redoFail": "前进记录无法恢复，请重新落子",
  "msg.redoneAi": "已前进，AI 将重新回应",
  "msg.redoneTurn": "已恢复被撤销的回合",
  "msg.reviewStart": "已经回看到本局起始位置",
  "msg.reviewAtStart": "正在回看起始位置 · 共 {total} 步",
  "msg.reviewPly": "正在回看第 {ply}/{total} 步 · {move}",
  "msg.atLatest": "已经位于最新局面",
  "msg.backToCurrent": "已回到当前局面 · 最近一步 {move}",
  "msg.backToCurrentPlain": "已回到当前局面",
  "msg.cancelSelectContinue": "已取消选择，可继续摆棋",
  "msg.returnedToTray": "{color}{name}已放回棋子库",
  "msg.engineLoadFail": "引擎未能载入，请刷新页面重试",
  "msg.engineLoadFailStockfish": "Stockfish 载入失败，请刷新页面重试",
  "msg.aiCalculating": "{side} AI 正在计算最佳走法…",
  // colors & pieces
  "color.white": "白",
  "color.black": "黑",
  "piece.k": "王",
  "piece.q": "后",
  "piece.r": "车",
  "piece.b": "象",
  "piece.n": "马",
  "piece.p": "兵",
  // sides
  "side.white": "白方",
  "side.black": "黑方",
  // move label & endings
  "moveLabel": "{side} · {san}",
  "ending.checkmate": "{winner}将死获胜",
  "ending.stalemate": "逼和",
  "ending.threefold": "三次重复，和棋",
  "ending.insufficient": "子力不足，和棋",
  "ending.fifty": "五十回合规则，和棋",
  "ending.draw": "和棋",
  "ending.over": "对局结束",
  // chance source
  "chance.review": "回看第 {ply}/{total} 步",
  "chance.result": "对局结果",
  "chance.engine": "Stockfish 局面估算",
  "chance.material": "按当前子力估算",
  // evaluation
  "eval.waiting": "等待局面",
  "eval.mateWin": "指定方可强制将死 · M{n}",
  "eval.mateLoss": "指定方将被强制将死 · M{n}",
  "eval.bigAdv": "指定方明显优势 · +{n}",
  "eval.slightAdv": "指定方稍优 · +{n}",
  "eval.bigDis": "指定方明显劣势 · {n}",
  "eval.slightDis": "指定方稍劣 · {n}",
  "eval.equal": "局面接近均势 · {sign}{n}",
  // donate
  "donate.tag": "请我喝杯咖啡 ￥4.9",
  "donate.alipay": "支付宝",
  "donate.wechat": "微信",
  "donate.modalAria": "{channel}赞赏二维码",
  "donate.closeAria": "关闭",
  "donate.qrAlt": "{channel}收款码",
  "donate.alipayHint": "长按或保存二维码，打开支付宝扫一扫",
  "donate.wechatHint": "长按或保存二维码，打开微信扫一扫",
  // piece tray
  "tray.wrongColor": "请将{color}棋放回对应颜色的棋子库",
  "tray.returnAria": "将已选中的{color}{name}放回棋子库",
  "tray.notHereAria": "此处是{side}棋子库，已选棋子不能放在这里",
  "tray.whiteName": "白方棋子库",
  "tray.blackName": "黑方棋子库",
  "tray.returnHint": "点这里放回已选棋子",
  "tray.otherSide": "已选棋子属于另一方",
  "tray.tapDrag": "点按或拖动",
  "tray.cancelled": "已取消选择",
  "tray.picked": "已拿起{color}{name}，点击棋盘放置",
  "tray.pieceRemainingAria": "{color}{name}，剩余{remaining}枚",
  // position dashboard
  "dash.aria": "双方子力与胜率",
  "dash.heading": "子力与胜算",
  "dash.materialDelta": "子力差 {value}",
  "dash.sidePiecesAria": "{side}当前棋子",
  "dash.noPieces": "暂无棋子",
  "dash.whiteChance": "白方 {n}%",
  "dash.blackChance": "黑方 {n}%",
  "dash.chanceLabel": "胜算估计",
  "dash.chanceAria": "白方胜算 {w}%，黑方胜算 {b}%",
  "dash.note": "胜率为局面估算，不代表理论必胜；和棋可能性折算在双方数值中。",
  // chess board
  "board.aria": "国际象棋棋盘",
  "board.squarePiece": "{square} {color}{name}",
  "board.squareEmpty": "{square} 空",
  // language toggle
  "lang.toggleAria": "切换语言",
};

const en: Record<string, string> = {
  // meta
  "meta.title": "Chess Reversal · AI Endgame Lab",
  "meta.titleShort": "Chess Reversal",
  // brand
  "brand.name": "Chess Reversal",
  "brand.tagline": "POSITION LAB",
  "brand.homeAria": "Chess Reversal home",
  // engine states
  "engine.loading": "Loading engine…",
  "engine.ready": "Stockfish 17.1 ready",
  "engine.thinking": "Stockfish is thinking…",
  "engine.error": "Engine unavailable",
  // hero
  "hero.eyebrow": "CUSTOM CHESS SCENARIO",
  "hero.titleLead": "Set up the endgame, ",
  "hero.titleEm": "engineer the reversal.",
  "hero.copy":
    "Place pieces freely and pick the side you want to win. The AI finds the best line — without dressing up a lost position as a sure win.",
  // stepper
  "stepper.aria": "Steps",
  "stepper.place": "Place pieces",
  "stepper.side": "Pick a side",
  "stepper.start": "Start analysis",
  // turn banner
  "turn.setup": "Setup mode",
  "turn.over": "Game over",
  "turn.ai": "AI's turn",
  "turn.you": "Your turn",
  // flip
  "flip.aria": "Flip board view (display only)",
  "flip.title": "Only changes the viewing angle; does not reset the game",
  "flip.label": "Flip view",
  // presets
  "preset.title": "Choose a starting board",
  "preset.hint": "You can still add, remove or move pieces afterwards",
  "preset.empty": "Empty board",
  "preset.standard": "Standard opening",
  // board actions
  "action.changeGame": "Change game",
  "action.undo": "Undo",
  "action.redo": "Redo",
  "action.review": "Review moves",
  "action.prev": "Previous",
  "action.next": "Next",
  "action.resetSetup": "Reset setup",
  "action.resetFromCurrent": "Reset from current position",
  "review.idle": "Reviewing does not change the game",
  "review.active": "Reviewing move {ply}/{total}",
  // control panel
  "panel.configLabel": "MATCH CONFIGURATION",
  "panel.setupHeading": "Match setup",
  "panel.statusHeading": "Position status",
  // selection toolbar
  "select.selected": "Selected {square}",
  "select.hint": "Click another square to move; pieces swap if occupied",
  "select.cancelAria": "Cancel selection",
  "select.return": "Return to tray",
  // edit hint
  "editHint.title": "Setup tip",
  "editHint.body": "Move pieces freely or return them to the tray — on mobile, just tap.",
  // setup config
  "config.winnerLegend": "Which side should win?",
  "config.winnerHelp": "Stockfish controls this side and always plays the best move.",
  "config.turnLegend": "Who moves first?",
  "config.turnWhite": "White moves first",
  "config.turnBlack": "Black moves first",
  "config.timeLegend": "AI thinking time",
  "config.timeValue": "{seconds} s",
  "config.timeFast": "Fast",
  "config.timeDeep": "Deep",
  // validation box
  "validate.notReady": "Position not ready",
  "validate.ready": "Position is ready",
  "validate.ok": "Basic legality checks passed",
  // validatePosition keys
  "validate.oneKing": "Each side must have exactly one king",
  "validate.kingsAdjacent": "The two kings cannot be adjacent",
  "validate.pawnRank": "Pawns cannot be placed on the first or eighth rank",
  "validate.bothInCheck": "Both kings cannot be in check at once",
  "validate.wrongSideCheck": "The side not to move cannot already be in check",
  "validate.invalid": "This arrangement is not a legal position",
  // start button
  "start.label": "Start analysis",
  // play status
  "eval.label": "ENGINE EVALUATION",
  "eval.note": "Evaluation is from the designated winner's perspective",
  "side.aiControl": "AI controls",
  "side.youSimulate": "You simulate",
  "moves.heading": "Move list",
  "moves.count": "{count} moves",
  "moves.empty": "No moves yet",
  // footer
  "footer.note": "For custom endgame study and local analysis only",
  "footer.engine": "Stockfish 17.1 · GPLv3 · Cannot guarantee reversing lost positions",
  // dynamic messages
  "msg.loadedStandard": "Standard opening loaded — start right away or keep adjusting",
  "msg.loadedStandardFull": "Standard opening loaded: 32 pieces set, White to move",
  "msg.simulateTurn": "Your turn to simulate {side}",
  "msg.engineIllegal": "The engine returned an illegal move",
  "msg.pawnRankPlace": "Pawns cannot be placed on the first or eighth rank",
  "msg.pawnRankMove": "Pawns cannot move to the first or eighth rank",
  "msg.pieceUsedUp": "All {color} {name}s have been used",
  "msg.piecePlaced": "{color} {name} placed on {square} — keep selecting",
  "msg.swapped": "Swapped pieces between {from} and {to}",
  "msg.moved": "Moved piece from {from} to {to}",
  "msg.selectedSquare": "Selected {color} {name} on {square} — click a target square",
  "msg.reviewingBlocked": "Reviewing move {ply}/{total} — use “Next” to return to the current position",
  "msg.illegalMove": "That's not a legal move; pawns can't move backward",
  "msg.evalWaitingReeval": "Waiting for re-evaluation",
  "msg.moveValid": "Move played — AI's turn",
  "msg.moveValidateFail": "Move validation failed — please reselect",
  "msg.evalWaiting": "Waiting for evaluation",
  "msg.positionLocked": "Position locked — AI is preparing to move",
  "msg.pleaseSimulate": "Please simulate {side}'s move first",
  "msg.initFailed": "Position init failed — please check the setup",
  "msg.cleared": "Board cleared — set up a new endgame",
  "msg.restoredSetup": "Restored the starting setup — adjust freely",
  "msg.backToSetup": "Returned to setup mode",
  "msg.setCurrentStart": "Current position set as the new start — keep editing",
  "msg.nothingToUndo": "No moves of yours to undo yet",
  "msg.undone": "Undone — your move again",
  "msg.alreadyLatest": "Already at the latest move",
  "msg.redoFail": "Couldn't redo — please move again",
  "msg.redoneAi": "Redone — AI will respond again",
  "msg.redoneTurn": "Restored the undone turn",
  "msg.reviewStart": "Already at the game's starting position",
  "msg.reviewAtStart": "Reviewing the start · {total} moves total",
  "msg.reviewPly": "Reviewing move {ply}/{total} · {move}",
  "msg.atLatest": "Already at the latest position",
  "msg.backToCurrent": "Back to current position · last move {move}",
  "msg.backToCurrentPlain": "Back to current position",
  "msg.cancelSelectContinue": "Selection cancelled — keep setting up",
  "msg.returnedToTray": "{color} {name} returned to tray",
  "msg.engineLoadFail": "Engine failed to load — please refresh",
  "msg.engineLoadFailStockfish": "Stockfish failed to load — please refresh",
  "msg.aiCalculating": "{side} AI is calculating the best move…",
  // colors & pieces
  "color.white": "White",
  "color.black": "Black",
  "piece.k": "King",
  "piece.q": "Queen",
  "piece.r": "Rook",
  "piece.b": "Bishop",
  "piece.n": "Knight",
  "piece.p": "Pawn",
  // sides
  "side.white": "White",
  "side.black": "Black",
  // move label & endings
  "moveLabel": "{side} · {san}",
  "ending.checkmate": "{winner} wins by checkmate",
  "ending.stalemate": "Stalemate",
  "ending.threefold": "Draw by threefold repetition",
  "ending.insufficient": "Draw by insufficient material",
  "ending.fifty": "Draw by the fifty-move rule",
  "ending.draw": "Draw",
  "ending.over": "Game over",
  // chance source
  "chance.review": "Reviewing move {ply}/{total}",
  "chance.result": "Game result",
  "chance.engine": "Stockfish position estimate",
  "chance.material": "Estimated by material",
  // evaluation
  "eval.waiting": "Waiting for position",
  "eval.mateWin": "Designated side can force mate · M{n}",
  "eval.mateLoss": "Designated side will get mated · M{n}",
  "eval.bigAdv": "Designated side clearly ahead · +{n}",
  "eval.slightAdv": "Designated side slightly better · +{n}",
  "eval.bigDis": "Designated side clearly worse · {n}",
  "eval.slightDis": "Designated side slightly worse · {n}",
  "eval.equal": "Roughly equal · {sign}{n}",
  // donate
  "donate.tag": "Buy me a coffee ￥4.9",
  "donate.alipay": "Alipay",
  "donate.wechat": "WeChat",
  "donate.modalAria": "{channel} tip QR code",
  "donate.closeAria": "Close",
  "donate.qrAlt": "{channel} QR code",
  "donate.alipayHint": "Long-press or save the QR, then scan with Alipay",
  "donate.wechatHint": "Long-press or save the QR, then scan with WeChat",
  // piece tray
  "tray.wrongColor": "Return {color} pieces to their own tray",
  "tray.returnAria": "Return the selected {color} {name} to the tray",
  "tray.notHereAria": "This is the {side} tray; the selected piece can't go here",
  "tray.whiteName": "White piece tray",
  "tray.blackName": "Black piece tray",
  "tray.returnHint": "Click here to return the selected piece",
  "tray.otherSide": "Selected piece belongs to the other side",
  "tray.tapDrag": "Tap or drag",
  "tray.cancelled": "Selection cancelled",
  "tray.picked": "Picked up {color} {name} — click the board to place",
  "tray.pieceRemainingAria": "{color} {name}, {remaining} left",
  // position dashboard
  "dash.aria": "Material and win chances for both sides",
  "dash.heading": "Material & chances",
  "dash.materialDelta": "Material delta {value}",
  "dash.sidePiecesAria": "{side}'s current pieces",
  "dash.noPieces": "No pieces",
  "dash.whiteChance": "White {n}%",
  "dash.blackChance": "Black {n}%",
  "dash.chanceLabel": "Win chance",
  "dash.chanceAria": "White win chance {w}%, Black {b}%",
  "dash.note":
    "Win chance is an estimate, not a theoretical guarantee; draw likelihood is folded into both sides.",
  // chess board
  "board.aria": "Chess board",
  "board.squarePiece": "{square} {color} {name}",
  "board.squareEmpty": "{square} empty",
  // language toggle
  "lang.toggleAria": "Switch language",
};

const dictionaries: Record<Locale, Record<string, string>> = { zh, en };

export function translate(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>,
): string {
  const dict = dictionaries[locale] ?? dictionaries.zh;
  let value = dict[key] ?? dictionaries.zh[key] ?? key;
  if (params) {
    for (const [name, raw] of Object.entries(params)) {
      value = value.replaceAll(`{${name}}`, String(raw));
    }
  }
  return value;
}

export function detectLocale(): Locale {
  if (typeof window === "undefined") return "zh";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    // localStorage may be unavailable (private mode); fall through to browser language
  }
  const lang = (window.navigator.language ?? "zh").toLowerCase();
  return lang.startsWith("zh") ? "zh" : "en";
}

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslateFn;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  // SSR and the first client render use the same default (zh) to avoid
  // hydration mismatches; detection runs after mount.
  const [locale, setLocaleState] = useState<Locale>("zh");

  useEffect(() => {
    setLocaleState(detectLocale());
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    document.title = translate(locale, "meta.title");
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore write failures (private mode etc.)
    }
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) =>
      translate(locale, key, params),
    [locale],
  );

  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within an I18nProvider");
  return ctx;
}

// --- key helpers (keep call sites terse) ---
export const sideKey = (color: "w" | "b") =>
  color === "w" ? "side.white" : "side.black";
export const colorKey = (color: "w" | "b") =>
  color === "w" ? "color.white" : "color.black";
export const pieceKey = (type: string) => `piece.${type}`;
