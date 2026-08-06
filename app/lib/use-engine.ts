"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Chess, Color } from "chess.js";

export type EngineState = "loading" | "ready" | "thinking" | "error";
export type EngineScore = { cp?: number; mate?: number };

export type EngineOutcome =
  | { kind: "moved"; uci: string }
  | { kind: "nomove" }
  | { kind: "stale"; score: EngineScore };

export type UseEngineOptions = {
  winnerColor: Color;
  humanColor: Color;
  chessRef: React.MutableRefObject<Chess | null>;
  moveTime: number;
  isThinkingTurn: boolean;
  board: unknown;
  onOutcome: (outcome: EngineOutcome) => void;
  onMessage: (message: string) => void;
};

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function useEngine({
  winnerColor,
  humanColor,
  chessRef,
  moveTime,
  isThinkingTurn,
  board,
  onOutcome,
  onMessage,
}: UseEngineOptions) {
  const [engineState, setEngineState] = useState<EngineState>("loading");
  const [evaluation, setEvaluation] = useState("等待局面");
  const [engineScoreWhite, setEngineScoreWhite] = useState<EngineScore | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const activeSearchFenRef = useRef<string | null>(null);
  const pendingScoreRef = useRef<EngineScore>({});

  const updateEvaluation = useCallback(
    (score: EngineScore) => {
      const whitePerspective = winnerColor === "w" ? 1 : -1;
      if (score.mate !== undefined) {
        setEngineScoreWhite({ mate: score.mate * whitePerspective });
        const favorable = score.mate > 0;
        setEvaluation(
          favorable
            ? `指定方可强制将死 · M${Math.abs(score.mate)}`
            : `指定方将被强制将死 · M${Math.abs(score.mate)}`,
        );
        return;
      }
      setEngineScoreWhite({ cp: (score.cp ?? 0) * whitePerspective });
      const pawns = (score.cp ?? 0) / 100;
      if (pawns > 2.5) setEvaluation(`指定方明显优势 · +${pawns.toFixed(1)}`);
      else if (pawns > 0.6) setEvaluation(`指定方稍优 · +${pawns.toFixed(1)}`);
      else if (pawns < -2.5) setEvaluation(`指定方明显劣势 · ${pawns.toFixed(1)}`);
      else if (pawns < -0.6) setEvaluation(`指定方稍劣 · ${pawns.toFixed(1)}`);
      else setEvaluation(`局面接近均势 · ${pawns >= 0 ? "+" : ""}${pawns.toFixed(1)}`);
    },
    [winnerColor],
  );

  const makeEngineMove = useCallback(() => {
    const chess = chessRef.current;
    const worker = workerRef.current;
    if (!chess || chess.isGameOver() || chess.turn() !== winnerColor) return;
    if (!worker || engineState === "error") {
      onMessage("引擎未能载入，请刷新页面重试");
      return;
    }
    activeSearchFenRef.current = chess.fen();
    pendingScoreRef.current = {};
    setEngineState("thinking");
    onMessage(`${winnerColor === "w" ? "白方" : "黑方"} AI 正在计算最佳走法…`);
    worker.postMessage("stop");
    worker.postMessage(`position fen ${chess.fen()}`);
    worker.postMessage(`go movetime ${moveTime}`);
  }, [chessRef, engineState, moveTime, onMessage, winnerColor]);

  useEffect(() => {
    const worker = new Worker(`${basePath}/engine/stockfish.js`);
    workerRef.current = worker;
    worker.onmessage = (event) => {
      const line = String(event.data);
      if (line === "uciok") {
        worker.postMessage("setoption name Hash value 32");
        worker.postMessage("isready");
      }
      if (line === "readyok") setEngineState("ready");
      const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
      if (scoreMatch) {
        const value = Number(scoreMatch[2]);
        pendingScoreRef.current =
          scoreMatch[1] === "mate" ? { mate: value } : { cp: value };
      }
      if (line.startsWith("bestmove ")) {
        const chess = chessRef.current;
        if (!chess) {
          activeSearchFenRef.current = null;
          setEngineState("ready");
          return;
        }
        const uci = line.split(" ")[1];
        if (!uci || uci === "(none)") {
          activeSearchFenRef.current = null;
          setEngineState("ready");
          onOutcome({ kind: "nomove" });
          return;
        }
        const searchedFen = activeSearchFenRef.current;
        activeSearchFenRef.current = null;
        if (!searchedFen || chess.fen() !== searchedFen) {
          setEngineState("ready");
          onOutcome({ kind: "stale", score: pendingScoreRef.current });
          return;
        }
        setEngineState("ready");
        updateEvaluation(pendingScoreRef.current);
        onOutcome({ kind: "moved", uci });
      }
    };
    worker.onerror = () => {
      setEngineState("error");
      onMessage("Stockfish 载入失败，请刷新页面重试");
    };
    worker.postMessage("uci");
    return () => {
      worker.postMessage("quit");
      worker.terminate();
    };
  }, [humanColor, onOutcome, onMessage, updateEvaluation]);

  useEffect(() => {
    if (isThinkingTurn && engineState === "ready") {
      const timer = window.setTimeout(makeEngineMove, 180);
      return () => window.clearTimeout(timer);
    }
  }, [board, engineState, isThinkingTurn, makeEngineMove]);

  const stopEngine = useCallback(() => {
    workerRef.current?.postMessage("stop");
    activeSearchFenRef.current = null;
  }, []);

  return {
    engineState,
    evaluation,
    engineScoreWhite,
    makeEngineMove,
    setEngineState,
    setEvaluation,
    setEngineScoreWhite,
    stopEngine,
    updateEvaluation,
  };
}
