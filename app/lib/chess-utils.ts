import { Chess, type Color, type Move, type PieceSymbol, type Square } from "chess.js";

// A translation function shape, mirroring app/lib/i18n.tsx. Declared locally
// (type-only) so this module stays free of any i18n runtime dependency.
type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export type Piece = { color: Color; type: PieceSymbol };
export type BoardMap = Record<string, Piece>;

export const files = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export const ranks = [8, 7, 6, 5, 4, 3, 2, 1] as const;
export const pieceOrder: PieceSymbol[] = ["k", "q", "r", "b", "n", "p"];
export const pieceLimit: Record<PieceSymbol, number> = { k: 1, q: 1, r: 2, b: 2, n: 2, p: 8 };
export const pieceValue: Record<PieceSymbol, number> = { k: 0, q: 9, r: 5, b: 3, n: 3, p: 1 };

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

// Returns "" when the position is legal, otherwise a translation key (to be
// resolved with t() at the call site). None of the messages take parameters.
export function validatePosition(board: BoardMap, turn: Color) {
  const pieces = Object.entries(board);
  const whiteKings = pieces.filter(([, p]) => p.color === "w" && p.type === "k");
  const blackKings = pieces.filter(([, p]) => p.color === "b" && p.type === "k");
  if (whiteKings.length !== 1 || blackKings.length !== 1) return "validate.oneKing";

  const [wf, wr] = [files.indexOf(whiteKings[0][0][0] as (typeof files)[number]), Number(whiteKings[0][0][1])];
  const [bf, br] = [files.indexOf(blackKings[0][0][0] as (typeof files)[number]), Number(blackKings[0][0][1])];
  if (Math.abs(wf - bf) <= 1 && Math.abs(wr - br) <= 1) return "validate.kingsAdjacent";

  if (pieces.some(([square, p]) => p.type === "p" && (square[1] === "1" || square[1] === "8"))) {
    return "validate.pawnRank";
  }

  try {
    const chess = new Chess(boardToFen(board, turn));
    const whiteInCheck = chess.isAttacked(whiteKings[0][0] as Square, "b");
    const blackInCheck = chess.isAttacked(blackKings[0][0] as Square, "w");
    if (whiteInCheck && blackInCheck) return "validate.bothInCheck";
    if ((turn === "w" && blackInCheck) || (turn === "b" && whiteInCheck)) {
      return "validate.wrongSideCheck";
    }
  } catch {
    return "validate.invalid";
  }
  return "";
}

export function describeEnding(chess: Chess, t: TranslateFn) {
  if (chess.isCheckmate()) {
    const winner = t(chess.turn() === "w" ? "side.black" : "side.white");
    return t("ending.checkmate", { winner });
  }
  if (chess.isStalemate()) return t("ending.stalemate");
  if (chess.isThreefoldRepetition()) return t("ending.threefold");
  if (chess.isInsufficientMaterial()) return t("ending.insufficient");
  if (chess.isDrawByFiftyMoves()) return t("ending.fifty");
  if (chess.isDraw()) return t("ending.draw");
  return t("ending.over");
}

export function moveLabel(move: Move, t: TranslateFn) {
  return t("moveLabel", { side: t(move.color === "w" ? "color.white" : "color.black"), san: move.san });
}

export function formatMaterialDelta(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}
