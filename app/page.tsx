"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Color, type Move, type PieceSymbol, type Square } from "chess.js";
import {
  boardToFen,
  chessToBoard,
  cloneBoard,
  validatePosition,
  describeEnding,
  moveLabel,
  files,
  ranks,
  pieceOrder,
  pieceLimit,
  pieceValue,
  pieceNames,
  type Piece,
  type BoardMap,
} from "./lib/chess-utils";
import { useEngine, type EngineOutcome } from "./lib/use-engine";
import { PieceArt } from "./components/piece-art";
import { PieceTray } from "./components/piece-tray";
import { PositionDashboard } from "./components/position-dashboard";
import { ChessBoard } from "./components/chess-board";
import { DonateButton } from "./components/donate-button";

type Phase = "setup" | "playing" | "over";
type StartingPosition = { board: BoardMap; turn: Color; isStandard: boolean };

export default function Home() {
  const [board, setBoard] = useState<BoardMap>(() => chessToBoard(new Chess()));
  const [phase, setPhase] = useState<Phase>("setup");
  const [winnerColor, setWinnerColor] = useState<Color>("w");
  const [turn, setTurn] = useState<Color>("w");
  const [selectedPiece, setSelectedPiece] = useState<Piece | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [moves, setMoves] = useState<Move[]>([]);
  const [redoTurns, setRedoTurns] = useState<Move[][]>([]);
  const [reviewPly, setReviewPly] = useState<number | null>(null);
  const [message, setMessage] = useState("已加载标准开局，可直接开始或继续调整");
  const [moveTime, setMoveTime] = useState(1200);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isStandardSetup, setIsStandardSetup] = useState(true);
  const chessRef = useRef<Chess | null>(null);
  const startingPositionRef = useRef<StartingPosition | null>(null);
  const outcomeHandlerRef = useRef<(outcome: EngineOutcome) => void>(() => {});

  const humanColor = winnerColor === "w" ? "b" : "w";
  const isThinkingTurn =
    phase === "playing" && chessRef.current?.turn() === winnerColor;

  const dispatchOutcome = useCallback(
    (outcome: EngineOutcome) => outcomeHandlerRef.current(outcome),
    [],
  );

  const {
    engineState,
    evaluation,
    engineScoreWhite,
    makeEngineMove,
    setEngineState,
    setEvaluation,
    setEngineScoreWhite,
    stopEngine,
    updateEvaluation,
  } = useEngine({
    winnerColor,
    humanColor,
    chessRef,
    moveTime,
    isThinkingTurn,
    board,
    onOutcome: dispatchOutcome,
    onMessage: setMessage,
  });

  const handleEngineOutcome = useCallback(
    (outcome: EngineOutcome) => {
      const chess = chessRef.current;
      if (outcome.kind === "moved") {
        if (!chess) return;
        try {
          const { uci } = outcome;
          const move = chess.move({
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            promotion: uci[4] || "q",
          });
          setRedoTurns([]);
          setReviewPly(null);
          setBoard(chessToBoard(chess));
          setLastMove({ from: move.from, to: move.to });
          setMoves((current) => [...current, move]);
          if (chess.isGameOver()) {
            setPhase("over");
            setMessage(describeEnding(chess));
          } else {
            const human = winnerColor === "w" ? "b" : "w";
            setMessage(`轮到你模拟${human === "w" ? "白方" : "黑方"}落子`);
          }
        } catch {
          setEngineState("error");
          setMessage("引擎返回了无法执行的棋步");
        }
      }
    },
    [winnerColor, setEngineState],
  );
  useEffect(() => {
    outcomeHandlerRef.current = handleEngineOutcome;
  });

  const displayBoard = useMemo(() => {
    if (reviewPly === null || phase === "setup") return board;
    const starting = startingPositionRef.current;
    if (!starting) return board;
    try {
      const reviewChess = new Chess(
        boardToFen(starting.board, starting.turn, starting.isStandard ? "KQkq" : "-"),
      );
      moves.slice(0, reviewPly).forEach((move) => {
        reviewChess.move({ from: move.from, to: move.to, promotion: move.promotion });
      });
      return chessToBoard(reviewChess);
    } catch {
      return board;
    }
  }, [board, moves, phase, reviewPly]);
  const displayLastMove =
    reviewPly === null
      ? lastMove
      : reviewPly > 0
        ? { from: moves[reviewPly - 1].from, to: moves[reviewPly - 1].to }
        : null;

  const counts = useMemo(() => {
    const result: Record<Color, Record<PieceSymbol, number>> = {
      w: { k: 0, q: 0, r: 0, b: 0, n: 0, p: 0 },
      b: { k: 0, q: 0, r: 0, b: 0, n: 0, p: 0 },
    };
    Object.values(board).forEach((p) => (result[p.color][p.type] += 1));
    return result;
  }, [board]);
  const dashboardCounts = useMemo(() => {
    if (reviewPly === null) return counts;
    const result: Record<Color, Record<PieceSymbol, number>> = {
      w: { k: 0, q: 0, r: 0, b: 0, n: 0, p: 0 },
      b: { k: 0, q: 0, r: 0, b: 0, n: 0, p: 0 },
    };
    Object.values(displayBoard).forEach((piece) => (result[piece.color][piece.type] += 1));
    return result;
  }, [counts, displayBoard, reviewPly]);

  const setupError = useMemo(() => validatePosition(board, turn), [board, turn]);
  const materialTotals = useMemo(() => {
    const score: Record<Color, number> = { w: 0, b: 0 };
    (["w", "b"] as Color[]).forEach((color) => {
      pieceOrder.forEach((type) => {
        score[color] += dashboardCounts[color][type] * pieceValue[type];
      });
    });
    return score;
  }, [dashboardCounts]);
  const materialDelta = useMemo(() => {
    const whiteLead = materialTotals.w - materialTotals.b;
    return {
      w: whiteLead,
      b: whiteLead === 0 ? 0 : -whiteLead,
    } satisfies Record<Color, number>;
  }, [materialTotals]);
  const shownFiles = isFlipped ? [...files].reverse() : files;
  const shownRanks = isFlipped ? [...ranks].reverse() : ranks;
  const topTrayColor: Color = isFlipped ? "w" : "b";
  const bottomTrayColor: Color = isFlipped ? "b" : "w";
  const currentTurn = phase === "setup" ? turn : chessRef.current?.turn() ?? turn;
  const canUndo = moves.some((move) => move.color === humanColor);
  const canRedo = redoTurns.length > 0;
  const canReviewBack = moves.length > 0 && (reviewPly ?? moves.length) > 0;
  const canReviewForward = reviewPly !== null;
  const winChances = useMemo(() => {
    const chess = chessRef.current;
    if (reviewPly === null && phase === "over" && chess?.isCheckmate()) {
      return chess.turn() === "w" ? { w: 0, b: 100 } : { w: 100, b: 0 };
    }
    if (reviewPly === null && phase === "over" && chess?.isDraw()) return { w: 50, b: 50 };

    if (reviewPly === null && phase !== "setup" && engineScoreWhite?.mate !== undefined) {
      if (engineScoreWhite.mate > 0) return { w: 99, b: 1 };
      if (engineScoreWhite.mate < 0) return { w: 1, b: 99 };
      return { w: 50, b: 50 };
    }

    const centipawns =
      reviewPly === null && phase !== "setup" && engineScoreWhite?.cp !== undefined
        ? engineScoreWhite.cp
        : materialDelta.w * 100;
    const rawWhite = 100 / (1 + Math.exp(-centipawns / 240));
    const white = Math.max(1, Math.min(99, Math.round(rawWhite)));
    return { w: white, b: 100 - white };
  }, [engineScoreWhite, materialDelta, moves, phase, reviewPly]);
  const chanceSource =
    reviewPly !== null
      ? `回看第 ${reviewPly}/${moves.length} 步`
      : phase === "over"
      ? "对局结果"
      : phase !== "setup" && engineScoreWhite
        ? "Stockfish 局面估算"
        : "按当前子力估算";
  const legalTargets = useMemo(() => {
    const chess = chessRef.current;
    if (!chess || phase !== "playing" || !selectedSquare || chess.turn() !== humanColor) {
      return new Set<Square>();
    }
    return new Set(
      chess
        .moves({ square: selectedSquare, verbose: true })
        .map((move) => move.to),
    );
  }, [board, humanColor, phase, selectedSquare]);

  const placePiece = (square: Square, piece: Piece) => {
    if (piece.type === "p" && (square[1] === "1" || square[1] === "8")) {
      setMessage("兵不能放在第一排或第八排");
      return;
    }
    const alreadyOnSquare = board[square];
    const available = pieceLimit[piece.type] - counts[piece.color][piece.type];
    if (available <= 0 && !(alreadyOnSquare?.color === piece.color && alreadyOnSquare.type === piece.type)) {
      setMessage(`${piece.color === "w" ? "白" : "黑"}${pieceNames[piece.type]}已经全部用完`);
      return;
    }
    setBoard((current) => ({ ...current, [square]: piece }));
    setIsStandardSetup(false);
    setEngineScoreWhite(null);
    setSelectedPiece(null);
    setSelectedSquare(null);
    setMessage(`${piece.color === "w" ? "白" : "黑"}${pieceNames[piece.type]}已放到 ${square}，可继续选择棋子`);
  };

  const moveSetupPiece = (from: Square, to: Square) => {
    const moving = board[from];
    if (!moving) return;
    if (moving.type === "p" && (to[1] === "1" || to[1] === "8")) {
      setMessage("兵不能移动到第一排或第八排");
      return;
    }
    const target = board[to];
    setBoard((current) => {
      const next = { ...current };
      delete next[from];
      next[to] = moving;
      if (target) next[from] = target;
      return next;
    });
    setIsStandardSetup(false);
    setEngineScoreWhite(null);
    setSelectedSquare(null);
    setMessage(target ? `已交换 ${from} 与 ${to} 的棋子` : `已将棋子从 ${from} 移到 ${to}`);
  };

  const handleSquareClick = (square: Square) => {
    if (phase === "setup") {
      if (selectedPiece) {
        placePiece(square, selectedPiece);
        return;
      }
      if (selectedSquare) {
        if (selectedSquare === square) {
          setSelectedSquare(null);
          return;
        }
        moveSetupPiece(selectedSquare, square);
        return;
      }
      if (board[square]) {
        setSelectedPiece(null);
        setSelectedSquare(square);
        const piece = board[square];
        setMessage(`已选中 ${square} 的${piece.color === "w" ? "白" : "黑"}${pieceNames[piece.type]}，点击目标格移动`);
      }
      return;
    }

    if (reviewPly !== null) {
      setMessage(`正在回看第 ${reviewPly}/${moves.length} 步，请用“下一步”回到当前局面`);
      return;
    }

    const chess = chessRef.current;
    if (!chess || phase !== "playing" || chess.turn() !== humanColor || engineState === "thinking") return;
    if (!selectedSquare) {
      if (board[square]?.color === humanColor) setSelectedSquare(square);
      return;
    }
    if (selectedSquare === square) {
      setSelectedSquare(null);
      return;
    }
    if (!legalTargets.has(square)) {
      if (board[square]?.color === humanColor) {
        setSelectedSquare(square);
      } else {
        setMessage("这不是一个合法棋步；兵不能后退");
        setSelectedSquare(null);
      }
      return;
    }
    try {
      const move = chess.move({ from: selectedSquare, to: square, promotion: "q" });
      setRedoTurns([]);
      setReviewPly(null);
      setBoard(chessToBoard(chess));
      setLastMove({ from: move.from, to: move.to });
      setMoves((current) => [...current, move]);
      setEngineScoreWhite(null);
      setEvaluation("等待引擎重新评估");
      setSelectedSquare(null);
      if (chess.isGameOver()) {
        setPhase("over");
        setMessage(describeEnding(chess));
      } else {
        setMessage("落子有效，轮到 AI");
      }
    } catch {
      setMessage("走法校验失败，请重新选择棋子");
      setSelectedSquare(null);
    }
  };

  const startGame = () => {
    if (setupError || engineState === "error") return;
    try {
      startingPositionRef.current = {
        board: cloneBoard(board),
        turn,
        isStandard: isStandardSetup,
      };
      const chess = new Chess(boardToFen(board, turn, isStandardSetup ? "KQkq" : "-"));
      chessRef.current = chess;
      stopEngine();
      setMoves([]);
      setRedoTurns([]);
      setReviewPly(null);
      setLastMove(null);
      setSelectedPiece(null);
      setSelectedSquare(null);
      setPhase(chess.isGameOver() ? "over" : "playing");
      setEngineScoreWhite(null);
      setEvaluation("等待引擎评估");
      if (chess.isGameOver()) {
        setMessage(describeEnding(chess));
      } else if (turn === winnerColor) {
        setMessage("局面已锁定，AI 准备落子");
      } else {
        setMessage(`请先模拟${humanColor === "w" ? "白方" : "黑方"}落子`);
      }
    } catch {
      setMessage("局面初始化失败，请检查摆法");
    }
  };

  const reset = () => {
    stopEngine();
    chessRef.current = null;
    startingPositionRef.current = null;
    if (engineState !== "error" && engineState !== "loading") setEngineState("ready");
    setBoard({});
    setPhase("setup");
    setMoves([]);
    setRedoTurns([]);
    setReviewPly(null);
    setLastMove(null);
    setSelectedPiece(null);
    setSelectedSquare(null);
    setIsStandardSetup(false);
    setEngineScoreWhite(null);
    setEvaluation("等待局面");
    setMessage("棋盘已清空，重新布置残局");
  };

  const editAgain = () => {
    stopEngine();
    chessRef.current = null;
    if (engineState !== "error" && engineState !== "loading") setEngineState("ready");
    const starting = startingPositionRef.current;
    if (starting) {
      setBoard(cloneBoard(starting.board));
      setTurn(starting.turn);
      setIsStandardSetup(starting.isStandard);
    } else {
      setIsStandardSetup(false);
    }
    startingPositionRef.current = null;
    setPhase("setup");
    setMoves([]);
    setRedoTurns([]);
    setReviewPly(null);
    setLastMove(null);
    setSelectedPiece(null);
    setSelectedSquare(null);
    setEngineScoreWhite(null);
    setEvaluation("等待局面");
    setMessage(starting ? "已恢复本局开始前的摆法，可重新调整" : "已返回摆棋模式");
  };

  const editFromCurrentPosition = () => {
    stopEngine();
    const currentChess = chessRef.current;
    const currentBoard = currentChess ? chessToBoard(currentChess) : board;
    const nextTurn = currentChess?.turn() ?? turn;
    chessRef.current = null;
    startingPositionRef.current = null;
    if (engineState !== "error" && engineState !== "loading") setEngineState("ready");
    setBoard(cloneBoard(currentBoard));
    setTurn(nextTurn);
    setPhase("setup");
    setMoves([]);
    setRedoTurns([]);
    setReviewPly(null);
    setLastMove(null);
    setSelectedPiece(null);
    setSelectedSquare(null);
    setIsStandardSetup(false);
    setEngineScoreWhite(null);
    setEvaluation("等待局面");
    setMessage("已将当前最新局面设为新起点，可继续摆棋");
  };

  const undoLastTurn = () => {
    const chess = chessRef.current;
    if (!chess || !canUndo) {
      setMessage("还没有可以撤销的己方棋步");
      return;
    }

    stopEngine();
    const undoneMoves: Move[] = [];
    let undone: Move | null = null;
    do {
      undone = chess.undo();
      if (undone) undoneMoves.unshift(undone);
    } while (undone && undone.color !== humanColor);

    const history = chess.history({ verbose: true }) as Move[];
    const previous = history.at(-1);
    setBoard(chessToBoard(chess));
    setMoves(history);
    setReviewPly(null);
    if (undoneMoves.length > 0) {
      setRedoTurns((current) => [...current, undoneMoves]);
    }
    setLastMove(previous ? { from: previous.from, to: previous.to } : null);
    setSelectedSquare(null);
    setPhase("playing");
    setEngineScoreWhite(null);
    setEvaluation("等待重新评估");
    if (engineState !== "error") setEngineState("ready");
    setMessage("已悔棋，轮到你重新落子");
  };

  const redoLastTurn = () => {
    const chess = chessRef.current;
    const redoTurn = redoTurns.at(-1);
    if (!chess || !redoTurn) {
      setMessage("已经恢复到最新一步");
      return;
    }

    stopEngine();
    let replayed = 0;
    try {
      redoTurn.forEach((move) => {
        chess.move({ from: move.from, to: move.to, promotion: move.promotion });
        replayed += 1;
      });
    } catch {
      while (replayed > 0) {
        chess.undo();
        replayed -= 1;
      }
      setMessage("前进记录无法恢复，请重新落子");
      return;
    }

    const history = chess.history({ verbose: true }) as Move[];
    const latest = history.at(-1);
    const needsAiReply = !chess.isGameOver() && chess.turn() === winnerColor;
    setRedoTurns(needsAiReply ? [] : redoTurns.slice(0, -1));
    setReviewPly(null);
    setBoard(chessToBoard(chess));
    setMoves(history);
    setLastMove(latest ? { from: latest.from, to: latest.to } : null);
    setSelectedSquare(null);
    setPhase(chess.isGameOver() ? "over" : "playing");
    setEngineScoreWhite(null);
    setEvaluation("等待重新评估");
    if (engineState !== "error") setEngineState("ready");
    setMessage(
      chess.isGameOver()
        ? describeEnding(chess)
        : needsAiReply
          ? "已前进，AI 将重新回应"
          : "已恢复被撤销的回合",
    );
  };

  const reviewPreviousMove = () => {
    const currentPly = reviewPly ?? moves.length;
    if (currentPly <= 0) {
      setMessage("已经回看到本局起始位置");
      return;
    }
    const previousPly = currentPly - 1;
    setReviewPly(previousPly);
    setSelectedSquare(null);
    setMessage(
      previousPly === 0
        ? `正在回看起始位置 · 共 ${moves.length} 步`
        : `正在回看第 ${previousPly}/${moves.length} 步 · ${moveLabel(moves[previousPly - 1])}`,
    );
  };

  const reviewNextMove = () => {
    if (reviewPly === null) {
      setMessage("已经位于最新局面");
      return;
    }
    const nextPly = reviewPly + 1;
    setSelectedSquare(null);
    if (nextPly >= moves.length) {
      setReviewPly(null);
      const latest = moves.at(-1);
      setMessage(latest ? `已回到当前局面 · 最近一步 ${moveLabel(latest)}` : "已回到当前局面");
      return;
    }
    setReviewPly(nextPly);
    setMessage(`正在回看第 ${nextPly}/${moves.length} 步 · ${moveLabel(moves[nextPly - 1])}`);
  };

  const loadStandardPosition = () => {
    stopEngine();
    chessRef.current = null;
    startingPositionRef.current = null;
    if (engineState !== "error" && engineState !== "loading") setEngineState("ready");
    setBoard(chessToBoard(new Chess()));
    setTurn("w");
    setPhase("setup");
    setMoves([]);
    setRedoTurns([]);
    setReviewPly(null);
    setLastMove(null);
    setSelectedPiece(null);
    setSelectedSquare(null);
    setIsStandardSetup(true);
    setEngineScoreWhite(null);
    setEvaluation("等待局面");
    setMessage("已加载标准开局：32 枚棋子就位，白方先走");
  };

  const returnPieceToTray = (square: Square | null) => {
    if (!square || phase !== "setup") return;
    const piece = board[square];
    setBoard((current) => {
      const next = { ...current };
      delete next[square];
      return next;
    });
    setIsStandardSetup(false);
    setEngineScoreWhite(null);
    setSelectedSquare(null);
    if (piece) setMessage(`${piece.color === "w" ? "白" : "黑"}${pieceNames[piece.type]}已放回棋子库`);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="逆转棋局首页">
          <span className="brand-mark"><PieceArt piece={{ color: "b", type: "n" }} className="brand-piece" /></span>
          <span>
            <strong>逆转棋局</strong>
            <small>POSITION LAB</small>
          </span>
        </a>
        <div className="engine-pill" data-state={engineState}>
          <span className="pulse" />
          {engineState === "loading" && "引擎载入中"}
          {engineState === "ready" && "Stockfish 17.1 已就绪"}
          {engineState === "thinking" && "Stockfish 正在思考"}
          {engineState === "error" && "引擎不可用"}
        </div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">CUSTOM CHESS SCENARIO</p>
          <h1>摆下残局，<em>推演逆转。</em></h1>
          <p className="hero-copy">
            自由布置棋子，指定你希望获胜的一方。AI 会寻找最佳路线，
            但不会把理论败局伪装成必胜。
          </p>
        </div>
        <div className="stepper" aria-label="操作步骤">
          {[
            ["01", "布置棋子"],
            ["02", "选择阵营"],
            ["03", "开始推演"],
          ].map(([number, label], index) => (
            <div className={phase === "setup" ? (index === 0 ? "active" : "") : index === 2 ? "active" : ""} key={number}>
              <span>{number}</span>
              <small>{label}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="workspace">
        <div className="board-column">
          <div className="turn-banner">
            <div>
              <span className={`turn-dot ${currentTurn}`} />
              <strong>
                {phase === "setup"
                  ? "摆棋模式"
                  : phase === "over"
                    ? "对局结束"
                    : currentTurn === winnerColor
                      ? "AI 回合"
                      : "你的回合"}
              </strong>
              <small>{message}</small>
            </div>
            <button
              className="flip-board-button"
              onClick={() => setIsFlipped((value) => !value)}
              aria-label="翻转棋盘视角，仅改变显示方向"
              title="仅改变棋盘观看方向，不会重置棋局"
            >
              <span className="flip-side-icon" aria-hidden="true">
                <PieceArt piece={{ color: "w", type: "p" }} className="flip-side-piece" />
                <b>⇅</b>
                <PieceArt piece={{ color: "b", type: "p" }} className="flip-side-piece" />
              </span>
              <span className="flip-label">翻转视角</span>
            </button>
          </div>

          {phase === "setup" && (
            <div className="board-preset-bar">
              <span>
                <strong>选择起始棋盘</strong>
                <small>之后仍可自由增删、移动棋子</small>
              </span>
              <div className="setup-presets" aria-label="棋盘预设">
                <button className="ghost-button" onClick={reset}>空棋盘</button>
                <button className="standard-setup-button" onClick={loadStandardPosition}>
                  <PieceArt piece={{ color: "b", type: "p" }} className="preset-piece" />
                  标准开局
                </button>
              </div>
            </div>
          )}

          {phase === "setup" && (
            <PieceTray
              color={topTrayColor}
              placement="top"
              phase={phase}
              selectedSquare={selectedSquare}
              board={board}
              selectedPiece={selectedPiece}
              counts={counts}
              onSelectPiece={setSelectedPiece}
              onClearSelection={() => setSelectedSquare(null)}
              onReturnPiece={returnPieceToTray}
              onMessage={setMessage}
            />
          )}

          <ChessBoard
            shownRanks={shownRanks}
            shownFiles={shownFiles}
            displayBoard={displayBoard}
            board={board}
            selectedSquare={selectedSquare}
            displayLastMove={displayLastMove}
            legalTargets={legalTargets}
            phase={phase}
            reviewPly={reviewPly}
            onSquareClick={handleSquareClick}
            onSelectSquare={setSelectedSquare}
            onClearPiece={() => setSelectedPiece(null)}
            onMoveSetupPiece={moveSetupPiece}
            onPlacePiece={placePiece}
          />

          {phase === "setup" && (
            <PieceTray
              color={bottomTrayColor}
              placement="bottom"
              phase={phase}
              selectedSquare={selectedSquare}
              board={board}
              selectedPiece={selectedPiece}
              counts={counts}
              onSelectPiece={setSelectedPiece}
              onClearSelection={() => setSelectedSquare(null)}
              onReturnPiece={returnPieceToTray}
              onMessage={setMessage}
            />
          )}

          {phase !== "setup" && (
            <div className="board-actions">
              <div className="play-actions">
                <div className="history-action-group">
                  <small>改变棋局</small>
                  <div className="history-action-row">
                    <button className="history-button undo-button" disabled={!canUndo} onClick={undoLastTurn}>
                      <span className="history-icon" aria-hidden="true">↶</span>
                      <span>悔棋</span>
                    </button>
                    <button className="history-button redo-button" disabled={!canRedo} onClick={redoLastTurn}>
                      <span className="history-icon" aria-hidden="true">↷</span>
                      <span>恢复</span>
                    </button>
                  </div>
                </div>
                <div className="history-action-group">
                  <small>回看棋谱</small>
                  <div className="history-action-row">
                    <button className="history-button review-button" disabled={!canReviewBack} onClick={reviewPreviousMove}>
                      <span className="history-icon compact" aria-hidden="true">←</span>
                      <span>上一步</span>
                    </button>
                    <button className="history-button review-button" disabled={!canReviewForward} onClick={reviewNextMove}>
                      <span>下一步</span>
                      <span className="history-icon compact" aria-hidden="true">→</span>
                    </button>
                  </div>
                </div>
                <div className="position-reset-actions compact">
                  <button className="ghost-button" onClick={editAgain}>重摆开局</button>
                  <button className="ghost-button current-position-button" onClick={editFromCurrentPosition}>
                    从当前局面重摆
                  </button>
                </div>
              </div>
              <span>{reviewPly === null ? "回看不会改变棋局" : `正在回看 ${reviewPly}/${moves.length} 步`}</span>
            </div>
          )}

          <PositionDashboard
            placement="board"
            dashboardCounts={dashboardCounts}
            materialDelta={materialDelta}
            winChances={winChances}
            chanceSource={chanceSource}
          />
        </div>

        <aside className={`control-panel ${phase}`}>
          <div className="control-heading">
            <span className="tiny-label">MATCH CONFIGURATION</span>
            <h2>{phase === "setup" ? "对局设置" : "局面状态"}</h2>
          </div>

          {phase === "setup" && (
            selectedSquare && board[selectedSquare] ? (
              <div className="selection-toolbar" aria-live="polite">
                <span className="selection-piece">
                  <PieceArt piece={board[selectedSquare]} className="selection-piece-art" />
                </span>
                <div>
                  <strong>已选中 {selectedSquare}</strong>
                  <small>点另一个格子移动；有棋子时会交换位置</small>
                </div>
                <button
                  className="cancel-button"
                  onClick={() => {
                    setSelectedSquare(null);
                    setMessage("已取消选择，可继续摆棋");
                  }}
                  aria-label="取消选择"
                >
                  ×
                </button>
                <button className="return-button" onClick={() => returnPieceToTray(selectedSquare)}>放回棋子库</button>
              </div>
            ) : (
              <div className="edit-hint-card">
                <strong>摆棋提示</strong>
                <small>棋子可自由挪动或放回棋子库，手机直接点按即可。</small>
              </div>
            )
          )}

          <PositionDashboard
            placement="control"
            dashboardCounts={dashboardCounts}
            materialDelta={materialDelta}
            winChances={winChances}
            chanceSource={chanceSource}
          />

          {phase === "setup" ? (
            <div className="setup-config">
              <fieldset>
                <legend>希望哪方获胜？</legend>
                <div className="segmented">
                  <label className={winnerColor === "w" ? "active" : ""}>
                    <input type="radio" name="winner" value="w" checked={winnerColor === "w"} onChange={() => setWinnerColor("w")} />
                    <PieceArt piece={{ color: "w", type: "k" }} className="mini-king" /> 白方
                  </label>
                  <label className={winnerColor === "b" ? "active" : ""}>
                    <input type="radio" name="winner" value="b" checked={winnerColor === "b"} onChange={() => setWinnerColor("b")} />
                    <PieceArt piece={{ color: "b", type: "k" }} className="mini-king" /> 黑方
                  </label>
                </div>
                <p>Stockfish 将控制这一方，并始终寻找最佳着法。</p>
              </fieldset>

              <fieldset>
                <legend>接下来谁走？</legend>
                <div className="turn-options">
                  <label>
                    <input type="radio" name="turn" checked={turn === "w"} onChange={() => setTurn("w")} />
                    <span><i className="turn-dot w" />白方先走</span>
                  </label>
                  <label>
                    <input type="radio" name="turn" checked={turn === "b"} onChange={() => setTurn("b")} />
                    <span><i className="turn-dot b" />黑方先走</span>
                  </label>
                </div>
              </fieldset>

              <fieldset>
                <div className="range-label">
                  <legend>AI 思考时间</legend>
                  <output>{(moveTime / 1000).toFixed(1)} 秒</output>
                </div>
                <input
                  className="range"
                  type="range"
                  min="400"
                  max="3000"
                  step="200"
                  value={moveTime}
                  onChange={(event) => setMoveTime(Number(event.target.value))}
                />
                <div className="range-scale"><span>快速</span><span>深入</span></div>
              </fieldset>

              <div className={`validation ${setupError ? "warning" : "ok"}`}>
                <span>{setupError ? "!" : "✓"}</span>
                <div>
                  <strong>{setupError ? "局面尚未就绪" : "局面可以开始"}</strong>
                  <small>{setupError || "基础合法性检查已通过"}</small>
                </div>
              </div>

              <button
                className="start-button"
                disabled={Boolean(setupError) || engineState === "loading" || engineState === "error"}
                onClick={startGame}
              >
                开始推演 <span>→</span>
              </button>
            </div>
          ) : (
            <div className="play-status">
              <div className="evaluation-card">
                <span className="tiny-label">ENGINE EVALUATION</span>
                <strong>{evaluation}</strong>
                <small>评估始终以指定获胜方为视角</small>
              </div>
              <div className="side-summary">
                <div>
                  <span>AI 控制</span>
                  <strong><PieceArt piece={{ color: winnerColor, type: "k" }} className="side-king" />{winnerColor === "w" ? "白方" : "黑方"}</strong>
                </div>
                <div>
                  <span>你模拟</span>
                  <strong><PieceArt piece={{ color: humanColor, type: "k" }} className="side-king" />{humanColor === "w" ? "白方" : "黑方"}</strong>
                </div>
              </div>
              <div className="move-list">
                <div className="move-list-heading"><span>行棋记录</span><small>{moves.length} 步</small></div>
                {moves.length === 0 ? (
                  <p>第一步尚未落下</p>
                ) : (
                  <ol>
                    {moves.map((move, index) => <li key={`${move.lan}-${index}`}><span>{index + 1}</span>{moveLabel(move)}</li>)}
                  </ol>
                )}
              </div>
              <div className="position-reset-actions panel-actions">
                <button className="start-button secondary" onClick={editAgain}>重摆开局 <span>↗</span></button>
                <button className="start-button secondary current-position-button" onClick={editFromCurrentPosition}>
                  从当前局面重摆 <span>↗</span>
                </button>
              </div>
            </div>
          )}
        </aside>
      </section>

      <footer>
        <div className="footer-meta">
          <span>仅用于自定义残局研究与本地推演</span>
          <span>Stockfish 17.1 · GPLv3 · 无法保证理论败势逆转</span>
        </div>
        <DonateButton />
      </footer>
    </main>
  );
}
