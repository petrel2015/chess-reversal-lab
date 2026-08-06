"use client";

import type { Color, PieceSymbol, Square } from "chess.js";
import { type BoardMap, pieceLimit, pieceNames, pieceOrder } from "../lib/chess-utils";
import { PieceArt } from "./piece-art";

export type PieceTrayProps = {
  color: Color;
  placement: "top" | "bottom";
  phase: string;
  selectedSquare: Square | null;
  board: BoardMap;
  selectedPiece: { color: Color; type: PieceSymbol } | null;
  counts: Record<Color, Record<PieceSymbol, number>>;
  onSelectPiece: (piece: { color: Color; type: PieceSymbol } | null) => void;
  onClearSelection: () => void;
  onReturnPiece: (square: Square | null) => void;
  onMessage: (message: string) => void;
};

export function PieceTray({
  color,
  placement,
  phase,
  selectedSquare,
  board,
  selectedPiece,
  counts,
  onSelectPiece,
  onClearSelection,
  onReturnPiece,
  onMessage,
}: PieceTrayProps) {
  const selectedBoardPiece = selectedSquare ? board[selectedSquare] : null;
  const acceptingReturn =
    phase === "setup" && selectedBoardPiece?.color === color;

  return (
    <aside
      className={`board-piece-tray ${placement} ${acceptingReturn ? "accepting-return" : ""}`}
      onDragOver={(event) => {
        if (phase === "setup") event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        const source = event.dataTransfer.getData("application/board-square") as Square;
        const piece = source ? board[source] : null;
        if (!piece || phase !== "setup") return;
        if (piece.color !== color) {
          onMessage(`请将${piece.color === "w" ? "白" : "黑"}棋放回对应颜色的棋子库`);
          return;
        }
        onReturnPiece(source);
      }}
    >
      {selectedBoardPiece && phase === "setup" && (
        <button
          type="button"
          className="tray-return-target"
          onClick={() => {
            if (selectedBoardPiece.color !== color) {
              onMessage(`请将${selectedBoardPiece.color === "w" ? "白" : "黑"}棋放回对应颜色的棋子库`);
              return;
            }
            onReturnPiece(selectedSquare);
          }}
          aria-label={
            acceptingReturn
              ? `将已选中的${selectedBoardPiece.color === "w" ? "白" : "黑"}${pieceNames[selectedBoardPiece.type]}放回棋子库`
              : `此处是${color === "w" ? "白方" : "黑方"}棋子库，已选棋子不能放在这里`
          }
        />
      )}
      <div className="inline-tray-label">
        <span className={`color-dot ${color}`} />
        <span>
          <strong>{color === "w" ? "白方棋子库" : "黑方棋子库"}</strong>
          <small>
            {selectedBoardPiece
              ? acceptingReturn
                ? "点这里放回已选棋子"
                : "已选棋子属于另一方"
              : "点按或拖动"}
          </small>
        </span>
      </div>
      <div className="piece-grid">
        {pieceOrder.map((type) => {
          const remaining = pieceLimit[type] - counts[color][type];
          const isSelected = selectedPiece?.color === color && selectedPiece.type === type;
          return (
            <button
              className={`tray-piece ${isSelected ? "selected" : ""}`}
              disabled={phase !== "setup" || remaining === 0}
              key={`${placement}-${color}-${type}`}
              onClick={() => {
                onClearSelection();
                onSelectPiece(isSelected ? null : { color, type });
                onMessage(
                  isSelected
                    ? "已取消选择"
                    : `已拿起${color === "w" ? "白" : "黑"}${pieceNames[type]}，点击棋盘放置`,
                );
              }}
              draggable={phase === "setup" && remaining > 0}
              onDragStart={(event) => {
                event.dataTransfer.setData("application/chess-piece", `${color}${type}`);
              }}
              aria-label={`${color === "w" ? "白" : "黑"}${pieceNames[type]}，剩余${remaining}枚`}
            >
              <PieceArt piece={{ color, type }} className="piece-glyph" />
              <span className="piece-count">×{remaining}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
