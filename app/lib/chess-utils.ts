import { Chess, type Color, type Move, type PieceSymbol, type Square } from "chess.js";

export type Piece = { color: Color; type: PieceSymbol };
export type BoardMap = Record<string, Piece>;

export const files = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export const ranks = [8, 7, 6, 5, 4, 3, 2, 1] as const;
export const pieceOrder: PieceSymbol[] = ["k", "q", "r", "b", "n", "p"];
export const pieceLimit: Record<PieceSymbol, number> = { k: 1, q: 1, r: 2, b: 2, n: 2, p: 8 };
export const pieceValue: Record<PieceSymbol, number> = { k: 0, q: 9, r: 5, b: 3, n: 3, p: 1 };
export const pieceNames: Record<PieceSymbol, string> = {
  k: "王",
  q: "后",
  r: "车",
  b: "象",
  n: "马",
  p: "兵",
};

export function boardToFen(board: BoardMap, turn: Color, castling = "-") {
  const rows = ranks.map((rank) => {
    let row = "";
    let empty = 0;
    for (const file of files) {
      const piece = board[`${file}${rank}`];
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty) row += empty;
      empty = 0;
      const letter = piece.type;
      row += piece.color === "w" ? letter.toUpperCase() : letter;
    }
    return row + (empty || "");
  });
  return `${rows.join("/")} ${turn} ${castling} - 0 1`;
}

export function chessToBoard(chess: Chess): BoardMap {
  const next: BoardMap = {};
  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece) next[piece.square] = { color: piece.color, type: piece.type };
    }
  }
  return next;
}

export function cloneBoard(board: BoardMap): BoardMap {
  return Object.fromEntries(
    Object.entries(board).map(([square, piece]) => [square, { ...piece }]),
  );
}

export function validatePosition(board: BoardMap, turn: Color) {
  const pieces = Object.entries(board);
  const whiteKings = pieces.filter(([, p]) => p.color === "w" && p.type === "k");
  const blackKings = pieces.filter(([, p]) => p.color === "b" && p.type === "k");
  if (whiteKings.length !== 1 || blackKings.length !== 1) return "双方必须各有且只有一个王";

  const [wf, wr] = [files.indexOf(whiteKings[0][0][0] as (typeof files)[number]), Number(whiteKings[0][0][1])];
  const [bf, br] = [files.indexOf(blackKings[0][0][0] as (typeof files)[number]), Number(blackKings[0][0][1])];
  if (Math.abs(wf - bf) <= 1 && Math.abs(wr - br) <= 1) return "两个王不能相邻";

  if (pieces.some(([square, p]) => p.type === "p" && (square[1] === "1" || square[1] === "8"))) {
    return "兵不能摆在第一排或第八排";
  }

  try {
    const chess = new Chess(boardToFen(board, turn));
    const whiteInCheck = chess.isAttacked(whiteKings[0][0] as Square, "b");
    const blackInCheck = chess.isAttacked(blackKings[0][0] as Square, "w");
    if (whiteInCheck && blackInCheck) return "双方的王不能同时被将军";
    if ((turn === "w" && blackInCheck) || (turn === "b" && whiteInCheck)) {
      return "未轮到走的一方不能正处于被将军状态";
    }
  } catch {
    return "当前摆法无法构成合法局面";
  }
  return "";
}

export function describeEnding(chess: Chess) {
  if (chess.isCheckmate()) return `${chess.turn() === "w" ? "黑方" : "白方"}将死获胜`;
  if (chess.isStalemate()) return "逼和";
  if (chess.isThreefoldRepetition()) return "三次重复，和棋";
  if (chess.isInsufficientMaterial()) return "子力不足，和棋";
  if (chess.isDrawByFiftyMoves()) return "五十回合规则，和棋";
  if (chess.isDraw()) return "和棋";
  return "对局结束";
}

export function moveLabel(move: Move) {
  return `${move.color === "w" ? "白" : "黑"} · ${move.san}`;
}

export function formatMaterialDelta(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}
