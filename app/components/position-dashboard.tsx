"use client";

import type { Color, PieceSymbol } from "chess.js";
import { formatMaterialDelta, pieceOrder } from "../lib/chess-utils";
import { sideKey, useI18n } from "../lib/i18n";
import { PieceArt } from "./piece-art";

export type PositionDashboardProps = {
  placement: "board" | "control";
  dashboardCounts: Record<Color, Record<PieceSymbol, number>>;
  materialDelta: Record<Color, number>;
  winChances: { w: number; b: number };
  chanceSource: string;
};

export function PositionDashboard({
  placement,
  dashboardCounts,
  materialDelta,
  winChances,
  chanceSource,
}: PositionDashboardProps) {
  const { t } = useI18n();
  return (
    <section
      className={`position-dashboard ${placement}-dashboard`}
      aria-label={t("dash.aria")}
    >
      <div className="dashboard-heading">
        <strong>{t("dash.heading")}</strong>
        <small>{chanceSource}</small>
      </div>
      <div className="material-list">
        {(["w", "b"] as Color[]).map((color) => (
          <div className={`material-side ${color}`} key={color}>
            <div className="material-label">
              <span className={`turn-dot ${color}`} />
              <strong>{t(sideKey(color))}</strong>
              <small className={materialDelta[color] > 0 ? "positive" : materialDelta[color] < 0 ? "negative" : ""}>
                {t("dash.materialDelta", { value: formatMaterialDelta(materialDelta[color]) })}
              </small>
            </div>
            <div className="material-pieces" aria-label={t("dash.sidePiecesAria", { side: t(sideKey(color)) })}>
              {pieceOrder.map((type) => (
                dashboardCounts[color][type] > 0 && (
                  <span className="material-piece" key={type}>
                    <PieceArt piece={{ color, type }} className="material-piece-art" />
                    <b>{dashboardCounts[color][type]}</b>
                  </span>
                )
              ))}
              {Object.values(dashboardCounts[color]).every((count) => count === 0) && <em>{t("dash.noPieces")}</em>}
            </div>
          </div>
        ))}
      </div>
      <div className="win-chance">
        <div className="chance-labels">
          <strong>{t("dash.whiteChance", { n: winChances.w })}</strong>
          <span>{t("dash.chanceLabel")}</span>
          <strong>{t("dash.blackChance", { n: winChances.b })}</strong>
        </div>
        <div
          className="chance-track"
          role="progressbar"
          aria-label={t("dash.chanceAria", { w: winChances.w, b: winChances.b })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={winChances.w}
        >
          <span style={{ width: `${winChances.w}%` }} />
        </div>
        <small className="chance-note">{t("dash.note")}</small>
      </div>
    </section>
  );
}
