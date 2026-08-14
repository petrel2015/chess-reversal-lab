"use client";

import type { Color, PieceSymbol, Square } from "chess.js";
import { type BoardMap, pieceLimit, pieceOrder } from "../lib/chess-utils";
import { colorKey, pieceKey, sideKey, useI18n } from "../lib/i18n";
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
  const { t } = useI18n();
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
          onMessage(t("tray.wrongColor", { color: t(colorKey(piece.color)) }));
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
              onMessage(t("tray.wrongColor", { color: t(colorKey(selectedBoardPiece.color)) }));
              return;
            }
            onReturnPiece(selectedSquare);
          }}
          aria-label={
            acceptingReturn
              ? t("tray.returnAria", {
                  color: t(colorKey(selectedBoardPiece.color)),
                  name: t(pieceKey(selectedBoardPiece.type)),
                })
              : t("tray.notHereAria", { side: t(sideKey(color)) })
          }
        />
      )}
      <div className="inline-tray-label">
        <span className={`color-dot ${color}`} />
        <span>
          <strong>{t(color === "w" ? "tray.whiteName" : "tray.blackName")}</strong>
          <small>
            {selectedBoardPiece
              ? acceptingReturn
                ? t("tray.returnHint")
                : t("tray.otherSide")
              : t("tray.tapDrag")}
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
                    ? t("tray.cancelled")
                    : t("tray.picked", { color: t(colorKey(color)), name: t(pieceKey(type)) }),
                );
              }}
              draggable={phase === "setup" && remaining > 0}
              onDragStart={(event) => {
                event.dataTransfer.setData("application/chess-piece", `${color}${type}`);
              }}
              aria-label={t("tray.pieceRemainingAria", {
                color: t(colorKey(color)),
                name: t(pieceKey(type)),
                remaining,
              })}
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
