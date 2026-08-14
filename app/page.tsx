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
  type Piece,
  type BoardMap,
} from "./lib/chess-utils";
import { useEngine, type EngineOutcome } from "./lib/use-engine";
import {
  colorKey,
  pieceKey,
  sideKey,
  translate,
  useI18n,
  type Locale,
  type TranslateFn,
} from "./lib/i18n";
import { PieceArt } from "./components/piece-art";
import { PieceTray } from "./components/piece-tray";
import { PositionDashboard } from "./components/position-dashboard";
import { ChessBoard } from "./components/chess-board";
import { DonateButton } from "./components/donate-button";
import { LanguageToggle } from "./components/language-toggle";

type Phase = "setup" | "playing" | "over";
type StartingPosition = { board: BoardMap; turn: Color; isStandard: boolean };

export default function Home() {
  const { t, locale } = useI18n();
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
  const [message, setMessage] = useState(() => translate("zh", "msg.loadedStandard"));
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
    locale,
    t,
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
            setMessage(describeEnding(chess, t));
          } else {
            const human = winnerColor === "w" ? "b" : "w";
            setMessage(t("msg.simulateTurn", { side: t(sideKey(human)) }));
          }
        } catch {
          setEngineState("error");
          setMessage(t("msg.engineIllegal"));
        }
      }
    },
    [t, winnerColor, setEngineState],
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
      ? t("chance.review", { ply: reviewPly, total: moves.length })
      : phase === "over"
        ? t("chance.result")
        : phase !== "setup" && engineScoreWhite
          ? t("chance.engine")
          : t("chance.material");
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

  // When the active language changes, re-derive the status line so it doesn't
  // keep showing a stale string from the previous language. Runs only on locale
  // change (not on every phase/message update) to avoid clobbering user messages.
  const statusMessage = useCallback(
    (loc: Locale): string => {
      const chess = chessRef.current;
      if ((phase === "over" || phase === "playing") && chess?.isGameOver()) {
        const locT: TranslateFn = (k, p) => translate(loc, k, p);
        return describeEnding(chess, locT);
      }
      if (phase === "setup") {
        return translate(loc, isStandardSetup ? "msg.loadedStandard" : "msg.cleared");
      }
      const turnNow = chess?.turn() ?? turn;
      if (turnNow === winnerColor) return translate(loc, "msg.positionLocked");
      return translate(loc, "msg.simulateTurn", { side: translate(loc, sideKey(humanColor)) });
    },
    [humanColor, isStandardSetup, phase, turn, winnerColor],
  );
  useEffect(() => {
    setMessage(statusMessage(locale));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  const placePiece = (square: Square, piece: Piece) => {
    if (piece.type === "p" && (square[1] === "1" || square[1] === "8")) {
      setMessage(t("msg.pawnRankPlace"));
      return;
    }
    const alreadyOnSquare = board[square];
    const available = pieceLimit[piece.type] - counts[piece.color][piece.type];
    if (available <= 0 && !(alreadyOnSquare?.color === piece.color && alreadyOnSquare.type === piece.type)) {
      setMessage(
        t("msg.pieceUsedUp", { color: t(colorKey(piece.color)), name: t(pieceKey(piece.type)) }),
      );
      return;
    }
    setBoard((current) => ({ ...current, [square]: piece }));
    setIsStandardSetup(false);
    setEngineScoreWhite(null);
    setSelectedPiece(null);
    setSelectedSquare(null);
    setMessage(
      t("msg.piecePlaced", { color: t(colorKey(piece.color)), name: t(pieceKey(piece.type)), square }),
    );
  };

  const moveSetupPiece = (from: Square, to: Square) => {
    const moving = board[from];
    if (!moving) return;
    if (moving.type === "p" && (to[1] === "1" || to[1] === "8")) {
      setMessage(t("msg.pawnRankMove"));
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
    setMessage(target ? t("msg.swapped", { from, to }) : t("msg.moved", { from, to }));
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
        setMessage(
          t("msg.selectedSquare", {
            square,
            color: t(colorKey(piece.color)),
            name: t(pieceKey(piece.type)),
          }),
        );
      }
      return;
    }

    if (reviewPly !== null) {
      setMessage(t("msg.reviewingBlocked", { ply: reviewPly, total: moves.length }));
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
        setMessage(t("msg.illegalMove"));
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
      setEvaluation(t("msg.evalWaitingReeval"));
      setSelectedSquare(null);
      if (chess.isGameOver()) {
        setPhase("over");
        setMessage(describeEnding(chess, t));
      } else {
        setMessage(t("msg.moveValid"));
      }
    } catch {
      setMessage(t("msg.moveValidateFail"));
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
      setEvaluation(t("msg.evalWaiting"));
      if (chess.isGameOver()) {
        setMessage(describeEnding(chess, t));
      } else if (turn === winnerColor) {
        setMessage(t("msg.positionLocked"));
      } else {
        setMessage(t("msg.pleaseSimulate", { side: t(sideKey(humanColor)) }));
      }
    } catch {
      setMessage(t("msg.initFailed"));
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
    setEvaluation(t("eval.waiting"));
    setMessage(t("msg.cleared"));
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
    setEvaluation(t("eval.waiting"));
    setMessage(starting ? t("msg.restoredSetup") : t("msg.backToSetup"));
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
    setEvaluation(t("eval.waiting"));
    setMessage(t("msg.setCurrentStart"));
  };

  const undoLastTurn = () => {
    const chess = chessRef.current;
    if (!chess || !canUndo) {
      setMessage(t("msg.nothingToUndo"));
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
    setEvaluation(t("msg.evalWaitingReeval"));
    if (engineState !== "error") setEngineState("ready");
    setMessage(t("msg.undone"));
  };

  const redoLastTurn = () => {
    const chess = chessRef.current;
    const redoTurn = redoTurns.at(-1);
    if (!chess || !redoTurn) {
      setMessage(t("msg.alreadyLatest"));
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
      setMessage(t("msg.redoFail"));
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
    setEvaluation(t("msg.evalWaitingReeval"));
    if (engineState !== "error") setEngineState("ready");
    setMessage(
      chess.isGameOver()
        ? describeEnding(chess, t)
        : needsAiReply
          ? t("msg.redoneAi")
          : t("msg.redoneTurn"),
    );
  };

  const reviewPreviousMove = () => {
    const currentPly = reviewPly ?? moves.length;
    if (currentPly <= 0) {
      setMessage(t("msg.reviewStart"));
      return;
    }
    const previousPly = currentPly - 1;
    setReviewPly(previousPly);
    setSelectedSquare(null);
    setMessage(
      previousPly === 0
        ? t("msg.reviewAtStart", { total: moves.length })
        : t("msg.reviewPly", { ply: previousPly, total: moves.length, move: moveLabel(moves[previousPly - 1], t) }),
    );
  };

  const reviewNextMove = () => {
    if (reviewPly === null) {
      setMessage(t("msg.atLatest"));
      return;
    }
    const nextPly = reviewPly + 1;
    setSelectedSquare(null);
    if (nextPly >= moves.length) {
      setReviewPly(null);
      const latest = moves.at(-1);
      setMessage(
        latest ? t("msg.backToCurrent", { move: moveLabel(latest, t) }) : t("msg.backToCurrentPlain"),
      );
      return;
    }
    setReviewPly(nextPly);
    setMessage(t("msg.reviewPly", { ply: nextPly, total: moves.length, move: moveLabel(moves[nextPly - 1], t) }));
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
    setEvaluation(t("eval.waiting"));
    setMessage(t("msg.loadedStandardFull"));
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
    if (piece)
      setMessage(
        t("msg.returnedToTray", { color: t(colorKey(piece.color)), name: t(pieceKey(piece.type)) }),
      );
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label={t("brand.homeAria")}>
          <span className="brand-mark"><PieceArt piece={{ color: "b", type: "n" }} className="brand-piece" /></span>
          <span>
            <strong>{t("brand.name")}</strong>
            <small>{t("brand.tagline")}</small>
          </span>
        </a>
        <div className="topbar-tools">
          <div className="engine-pill" data-state={engineState}>
            <span className="pulse" />
            {engineState === "loading" && t("engine.loading")}
            {engineState === "ready" && t("engine.ready")}
            {engineState === "thinking" && t("engine.thinking")}
            {engineState === "error" && t("engine.error")}
          </div>
          <LanguageToggle />
        </div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">{t("hero.eyebrow")}</p>
          <h1>{t("hero.titleLead")}<em>{t("hero.titleEm")}</em></h1>
          <p className="hero-copy">{t("hero.copy")}</p>
        </div>
        <div className="stepper" aria-label={t("stepper.aria")}>
          {[
            ["01", t("stepper.place")],
            ["02", t("stepper.side")],
            ["03", t("stepper.start")],
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
                  ? t("turn.setup")
                  : phase === "over"
                    ? t("turn.over")
                    : currentTurn === winnerColor
                      ? t("turn.ai")
                      : t("turn.you")}
              </strong>
              <small>{message}</small>
            </div>
            <button
              className="flip-board-button"
              onClick={() => setIsFlipped((value) => !value)}
              aria-label={t("flip.aria")}
              title={t("flip.title")}
            >
              <span className="flip-side-icon" aria-hidden="true">
                <PieceArt piece={{ color: "w", type: "p" }} className="flip-side-piece" />
                <b>⇅</b>
                <PieceArt piece={{ color: "b", type: "p" }} className="flip-side-piece" />
              </span>
              <span className="flip-label">{t("flip.label")}</span>
            </button>
          </div>

          {phase === "setup" && (
            <div className="board-preset-bar">
              <span>
                <strong>{t("preset.title")}</strong>
                <small>{t("preset.hint")}</small>
              </span>
              <div className="setup-presets" aria-label={t("preset.title")}>
                <button className="ghost-button" onClick={reset}>{t("preset.empty")}</button>
                <button className="standard-setup-button" onClick={loadStandardPosition}>
                  <PieceArt piece={{ color: "b", type: "p" }} className="preset-piece" />
                  {t("preset.standard")}
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
                  <small>{t("action.changeGame")}</small>
                  <div className="history-action-row">
                    <button className="history-button undo-button" disabled={!canUndo} onClick={undoLastTurn}>
                      <span className="history-icon" aria-hidden="true">↶</span>
                      <span>{t("action.undo")}</span>
                    </button>
                    <button className="history-button redo-button" disabled={!canRedo} onClick={redoLastTurn}>
                      <span className="history-icon" aria-hidden="true">↷</span>
                      <span>{t("action.redo")}</span>
                    </button>
                  </div>
                </div>
                <div className="history-action-group">
                  <small>{t("action.review")}</small>
                  <div className="history-action-row">
                    <button className="history-button review-button" disabled={!canReviewBack} onClick={reviewPreviousMove}>
                      <span className="history-icon compact" aria-hidden="true">←</span>
                      <span>{t("action.prev")}</span>
                    </button>
                    <button className="history-button review-button" disabled={!canReviewForward} onClick={reviewNextMove}>
                      <span>{t("action.next")}</span>
                      <span className="history-icon compact" aria-hidden="true">→</span>
                    </button>
                  </div>
                </div>
                <div className="position-reset-actions compact">
                  <button className="ghost-button" onClick={editAgain}>{t("action.resetSetup")}</button>
                  <button className="ghost-button current-position-button" onClick={editFromCurrentPosition}>
                    {t("action.resetFromCurrent")}
                  </button>
                </div>
              </div>
              <span>{reviewPly === null ? t("review.idle") : t("review.active", { ply: reviewPly, total: moves.length })}</span>
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
            <span className="tiny-label">{t("panel.configLabel")}</span>
            <h2>{phase === "setup" ? t("panel.setupHeading") : t("panel.statusHeading")}</h2>
          </div>

          {phase === "setup" && (
            selectedSquare && board[selectedSquare] ? (
              <div className="selection-toolbar" aria-live="polite">
                <span className="selection-piece">
                  <PieceArt piece={board[selectedSquare]} className="selection-piece-art" />
                </span>
                <div>
                  <strong>{t("select.selected", { square: selectedSquare })}</strong>
                  <small>{t("select.hint")}</small>
                </div>
                <button
                  className="cancel-button"
                  onClick={() => {
                    setSelectedSquare(null);
                    setMessage(t("msg.cancelSelectContinue"));
                  }}
                  aria-label={t("select.cancelAria")}
                >
                  ×
                </button>
                <button className="return-button" onClick={() => returnPieceToTray(selectedSquare)}>{t("select.return")}</button>
              </div>
            ) : (
              <div className="edit-hint-card">
                <strong>{t("editHint.title")}</strong>
                <small>{t("editHint.body")}</small>
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
                <legend>{t("config.winnerLegend")}</legend>
                <div className="segmented">
                  <label className={winnerColor === "w" ? "active" : ""}>
                    <input type="radio" name="winner" value="w" checked={winnerColor === "w"} onChange={() => setWinnerColor("w")} />
                    <PieceArt piece={{ color: "w", type: "k" }} className="mini-king" /> {t("side.white")}
                  </label>
                  <label className={winnerColor === "b" ? "active" : ""}>
                    <input type="radio" name="winner" value="b" checked={winnerColor === "b"} onChange={() => setWinnerColor("b")} />
                    <PieceArt piece={{ color: "b", type: "k" }} className="mini-king" /> {t("side.black")}
                  </label>
                </div>
                <p>{t("config.winnerHelp")}</p>
              </fieldset>

              <fieldset>
                <legend>{t("config.turnLegend")}</legend>
                <div className="turn-options">
                  <label>
                    <input type="radio" name="turn" checked={turn === "w"} onChange={() => setTurn("w")} />
                    <span><i className="turn-dot w" />{t("config.turnWhite")}</span>
                  </label>
                  <label>
                    <input type="radio" name="turn" checked={turn === "b"} onChange={() => setTurn("b")} />
                    <span><i className="turn-dot b" />{t("config.turnBlack")}</span>
                  </label>
                </div>
              </fieldset>

              <fieldset>
                <div className="range-label">
                  <legend>{t("config.timeLegend")}</legend>
                  <output>{t("config.timeValue", { seconds: (moveTime / 1000).toFixed(1) })}</output>
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
                <div className="range-scale"><span>{t("config.timeFast")}</span><span>{t("config.timeDeep")}</span></div>
              </fieldset>

              <div className={`validation ${setupError ? "warning" : "ok"}`}>
                <span>{setupError ? "!" : "✓"}</span>
                <div>
                  <strong>{setupError ? t("validate.notReady") : t("validate.ready")}</strong>
                  <small>{setupError ? t(setupError) : t("validate.ok")}</small>
                </div>
              </div>

              <button
                className="start-button"
                disabled={Boolean(setupError) || engineState === "loading" || engineState === "error"}
                onClick={startGame}
              >
                {t("start.label")} <span>→</span>
              </button>
            </div>
          ) : (
            <div className="play-status">
              <div className="evaluation-card">
                <span className="tiny-label">{t("eval.label")}</span>
                <strong>{evaluation}</strong>
                <small>{t("eval.note")}</small>
              </div>
              <div className="side-summary">
                <div>
                  <span>{t("side.aiControl")}</span>
                  <strong><PieceArt piece={{ color: winnerColor, type: "k" }} className="side-king" />{t(sideKey(winnerColor))}</strong>
                </div>
                <div>
                  <span>{t("side.youSimulate")}</span>
                  <strong><PieceArt piece={{ color: humanColor, type: "k" }} className="side-king" />{t(sideKey(humanColor))}</strong>
                </div>
              </div>
              <div className="move-list">
                <div className="move-list-heading"><span>{t("moves.heading")}</span><small>{t("moves.count", { count: moves.length })}</small></div>
                {moves.length === 0 ? (
                  <p>{t("moves.empty")}</p>
                ) : (
                  <ol>
                    {moves.map((move, index) => <li key={`${move.lan}-${index}`}><span>{index + 1}</span>{moveLabel(move, t)}</li>)}
                  </ol>
                )}
              </div>
              <div className="position-reset-actions panel-actions">
                <button className="start-button secondary" onClick={editAgain}>{t("action.resetSetup")} <span>↗</span></button>
                <button className="start-button secondary current-position-button" onClick={editFromCurrentPosition}>
                  {t("action.resetFromCurrent")} <span>↗</span>
                </button>
              </div>
            </div>
          )}
        </aside>
      </section>

      <footer>
        <div className="footer-meta">
          <span>{t("footer.note")}</span>
          <span>{t("footer.engine")}</span>
        </div>
        <DonateButton />
      </footer>
    </main>
  );
}
