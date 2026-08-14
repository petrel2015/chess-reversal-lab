"use client";

import type { Color, PieceSymbol, Square } from "chess.js";
import { type BoardMap, files, ranks } from "../lib/chess-utils";
import { colorKey, pieceKey, useI18n } from "../lib/i18n";
import { PieceArt } from "./piece-art";

export type ChessBoardProps = {
  shownRanks: readonly number[];
  shownFiles: readonly string[];
  displayBoard: BoardMap;
  board: BoardMap;
  selectedSquare: Square | null;
  displayLastMove: { from: Square; to: Square } | null;
  legalTargets: Set<Square>;
  phase: string;
  reviewPly: number | null;
  onSquareClick: (square: Square) => void;
  onSelectSquare: (square: Square | null) => void;
  onClearPiece: () => void;
  onMoveSetupPiece: (from: Square, to: Square) => void;
  onPlacePiece: (square: Square, piece: { color: Color; type: PieceSymbol }) => void;
};

export function ChessBoard({
  shownRanks,
  shownFiles,
  displayBoard,
  board,
  selectedSquare,
  displayLastMove,
  legalTargets,
  phase,
  reviewPly,
  onSquareClick,
  onSelectSquare,
  onClearPiece,
  onMoveSetupPiece,
  onPlacePiece,
}: ChessBoardProps) {
  const { t } = useI18n();
  return (
    <div className="board-wrap">
      <div className="chessboard" role="grid" aria-label={t("board.aria")}>
        {shownRanks.flatMap((rank, rankIndex) =>
          shownFiles.map((file, fileIndex) => {
            const square = `${file}${rank}` as Square;
            const piece = displayBoard[square];
            const dark = (files.indexOf(file as (typeof files)[number]) + ranks.indexOf(rank as (typeof ranks)[number])) % 2 === 1;
            const selected = reviewPly === null && selectedSquare === square;
            const moved = displayLastMove?.from === square || displayLastMove?.to === square;
            const legalTarget = legalTargets.has(square);
            return (
              <button
                className={`square ${dark ? "dark" : "light"} ${selected ? "selected" : ""} ${moved ? "last-move" : ""} ${legalTarget ? "legal-target" : ""}`}
                key={square}
                role="gridcell"
                data-square={square}
                onClick={() => onSquareClick(square)}
                draggable={phase === "setup" && reviewPly === null && Boolean(piece)}
                onDragStart={(event) => {
                  if (phase === "setup" && piece) {
                    event.dataTransfer.setData("application/board-square", square);
                    onClearPiece();
                    onSelectSquare(square);
                  }
                }}
                onDragOver={(event) => phase === "setup" && event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const source = event.dataTransfer.getData("application/board-square") as Square;
                  if (source && board[source]) {
                    onMoveSetupPiece(source, square);
                    return;
                  }
                  const data = event.dataTransfer.getData("application/chess-piece");
                  if (data.length === 2) onPlacePiece(square, { color: data[0] as Color, type: data[1] as PieceSymbol });
                }}
                aria-label={
                  piece
                    ? t("board.squarePiece", {
                        square,
                        color: t(colorKey(piece.color)),
                        name: t(pieceKey(piece.type)),
                      })
                    : t("board.squareEmpty", { square })
                }
              >
                {fileIndex === 0 && <span className="rank-label">{rank}</span>}
                {rankIndex === 7 && <span className="file-label">{file}</span>}
                {piece && <PieceArt piece={piece} className="board-piece" />}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
