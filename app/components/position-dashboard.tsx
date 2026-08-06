"use client";

import type { Color, PieceSymbol } from "chess.js";
import { formatMaterialDelta, pieceOrder } from "../lib/chess-utils";
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
  return (
    <section
      className={`position-dashboard ${placement}-dashboard`}
      aria-label="双方子力与胜率"
    >
      <div className="dashboard-heading">
        <strong>子力与胜算</strong>
        <small>{chanceSource}</small>
      </div>
      <div className="material-list">
        {(["w", "b"] as Color[]).map((color) => (
          <div className={`material-side ${color}`} key={color}>
            <div className="material-label">
              <span className={`turn-dot ${color}`} />
              <strong>{color === "w" ? "白方" : "黑方"}</strong>
              <small className={materialDelta[color] > 0 ? "positive" : materialDelta[color] < 0 ? "negative" : ""}>
                子力差 {formatMaterialDelta(materialDelta[color])}
              </small>
            </div>
            <div className="material-pieces" aria-label={`${color === "w" ? "白方" : "黑方"}当前棋子`}>
              {pieceOrder.map((type) => (
                dashboardCounts[color][type] > 0 && (
                  <span className="material-piece" key={type}>
                    <PieceArt piece={{ color, type }} className="material-piece-art" />
                    <b>{dashboardCounts[color][type]}</b>
                  </span>
                )
              ))}
              {Object.values(dashboardCounts[color]).every((count) => count === 0) && <em>暂无棋子</em>}
            </div>
          </div>
        ))}
      </div>
      <div className="win-chance">
        <div className="chance-labels">
          <strong>白方 {winChances.w}%</strong>
          <span>胜算估计</span>
          <strong>黑方 {winChances.b}%</strong>
        </div>
        <div
          className="chance-track"
          role="progressbar"
          aria-label={`白方胜算 ${winChances.w}%，黑方胜算 ${winChances.b}%`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={winChances.w}
        >
          <span style={{ width: `${winChances.w}%` }} />
        </div>
        <small className="chance-note">胜率为局面估算，不代表理论必胜；和棋可能性折算在双方数值中。</small>
      </div>
    </section>
  );
}
