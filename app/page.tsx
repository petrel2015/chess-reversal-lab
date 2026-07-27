"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Color, type Move, type PieceSymbol, type Square } from "chess.js";

type Piece = { color: Color; type: PieceSymbol };
type BoardMap = Record<string, Piece>;
type Phase = "setup" | "playing" | "over";
type EngineState = "loading" | "ready" | "thinking" | "error";
type EngineScore = { cp?: number; mate?: number };
type StartingPosition = { board: BoardMap; turn: Color; isStandard: boolean };

const files = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const ranks = [8, 7, 6, 5, 4, 3, 2, 1] as const;
const pieceOrder: PieceSymbol[] = ["k", "q", "r", "b", "n", "p"];
const pieceLimit: Record<PieceSymbol, number> = { k: 1, q: 1, r: 2, b: 2, n: 2, p: 8 };
const pieceValue: Record<PieceSymbol, number> = { k: 0, q: 9, r: 5, b: 3, n: 3, p: 1 };
const pieceNames: Record<PieceSymbol, string> = {
  k: "王",
  q: "后",
  r: "车",
  b: "象",
  n: "马",
  p: "兵",
};
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const pieceImages: Record<Color, Record<PieceSymbol, string>> = {
  w: {
    k: `${basePath}/chess-pieces/w-k.png`,
    q: `${basePath}/chess-pieces/w-q.png`,
    r: `${basePath}/chess-pieces/w-r.png`,
    b: `${basePath}/chess-pieces/w-b.png`,
    n: `${basePath}/chess-pieces/w-n.png`,
    p: `${basePath}/chess-pieces/w-p.png`,
  },
  b: {
    k: `${basePath}/chess-pieces/b-k.png`,
    q: `${basePath}/chess-pieces/b-q.png`,
    r: `${basePath}/chess-pieces/b-r.png`,
    b: `${basePath}/chess-pieces/b-b.png`,
    n: `${basePath}/chess-pieces/b-n.png`,
    p: `${basePath}/chess-pieces/b-p.png`,
  },
};

function PieceArt({ piece, className }: { piece: Piece; className: string }) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={className}
      draggable={false}
      src={pieceImages[piece.color][piece.type]}
    />
  );
}

function boardToFen(board: BoardMap, turn: Color, castling = "-") {
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

function chessToBoard(chess: Chess): BoardMap {
  const next: BoardMap = {};
  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece) next[piece.square] = { color: piece.color, type: piece.type };
    }
  }
  return next;
}

function cloneBoard(board: BoardMap): BoardMap {
  return Object.fromEntries(
    Object.entries(board).map(([square, piece]) => [square, { ...piece }]),
  );
}

function validatePosition(board: BoardMap, turn: Color) {
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

function describeEnding(chess: Chess) {
  if (chess.isCheckmate()) return `${chess.turn() === "w" ? "黑方" : "白方"}将死获胜`;
  if (chess.isStalemate()) return "逼和";
  if (chess.isThreefoldRepetition()) return "三次重复，和棋";
  if (chess.isInsufficientMaterial()) return "子力不足，和棋";
  if (chess.isDrawByFiftyMoves()) return "五十回合规则，和棋";
  if (chess.isDraw()) return "和棋";
  return "对局结束";
}

function moveLabel(move: Move) {
  return `${move.color === "w" ? "白" : "黑"} · ${move.san}`;
}

export default function Home() {
  const [board, setBoard] = useState<BoardMap>(() => chessToBoard(new Chess()));
  const [phase, setPhase] = useState<Phase>("setup");
  const [winnerColor, setWinnerColor] = useState<Color>("w");
  const [turn, setTurn] = useState<Color>("w");
  const [selectedPiece, setSelectedPiece] = useState<Piece | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [moves, setMoves] = useState<Move[]>([]);
  const [message, setMessage] = useState("已加载标准开局，可直接开始或继续调整");
  const [engineState, setEngineState] = useState<EngineState>("loading");
  const [evaluation, setEvaluation] = useState("等待局面");
  const [moveTime, setMoveTime] = useState(1200);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isStandardSetup, setIsStandardSetup] = useState(true);
  const [engineScoreWhite, setEngineScoreWhite] = useState<EngineScore | null>(null);
  const chessRef = useRef<Chess | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const activeSearchFenRef = useRef<string | null>(null);
  const pendingScoreRef = useRef<EngineScore>({});
  const startingPositionRef = useRef<StartingPosition | null>(null);

  const counts = useMemo(() => {
    const result: Record<Color, Record<PieceSymbol, number>> = {
      w: { k: 0, q: 0, r: 0, b: 0, n: 0, p: 0 },
      b: { k: 0, q: 0, r: 0, b: 0, n: 0, p: 0 },
    };
    Object.values(board).forEach((p) => (result[p.color][p.type] += 1));
    return result;
  }, [board]);

  const setupError = useMemo(() => validatePosition(board, turn), [board, turn]);
  const material = useMemo(() => {
    const score: Record<Color, number> = { w: 0, b: 0 };
    (["w", "b"] as Color[]).forEach((color) => {
      pieceOrder.forEach((type) => {
        score[color] += counts[color][type] * pieceValue[type];
      });
    });
    return score;
  }, [counts]);
  const shownFiles = isFlipped ? [...files].reverse() : files;
  const shownRanks = isFlipped ? [...ranks].reverse() : ranks;
  const topTrayColor: Color = isFlipped ? "w" : "b";
  const bottomTrayColor: Color = isFlipped ? "b" : "w";
  const humanColor = winnerColor === "w" ? "b" : "w";
  const currentTurn = phase === "setup" ? turn : chessRef.current?.turn() ?? turn;
  const canUndo = moves.some((move) => move.color === humanColor);
  const winChances = useMemo(() => {
    const chess = chessRef.current;
    if (phase === "over" && chess?.isCheckmate()) {
      return chess.turn() === "w" ? { w: 0, b: 100 } : { w: 100, b: 0 };
    }
    if (phase === "over" && chess?.isDraw()) return { w: 50, b: 50 };

    if (phase !== "setup" && engineScoreWhite?.mate !== undefined) {
      if (engineScoreWhite.mate > 0) return { w: 99, b: 1 };
      if (engineScoreWhite.mate < 0) return { w: 1, b: 99 };
      return { w: 50, b: 50 };
    }

    const centipawns =
      phase !== "setup" && engineScoreWhite?.cp !== undefined
        ? engineScoreWhite.cp
        : (material.w - material.b) * 100;
    const rawWhite = 100 / (1 + Math.exp(-centipawns / 240));
    const white = Math.max(1, Math.min(99, Math.round(rawWhite)));
    return { w: white, b: 100 - white };
  }, [engineScoreWhite, material, moves, phase]);
  const chanceSource =
    phase === "over"
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

  const updateEvaluation = useCallback((score: { cp?: number; mate?: number }) => {
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
  }, [winnerColor]);

  const makeEngineMove = useCallback(() => {
    const chess = chessRef.current;
    const worker = workerRef.current;
    if (!chess || chess.isGameOver() || chess.turn() !== winnerColor) return;
    if (!worker || engineState === "error") {
      setMessage("引擎未能载入，请刷新页面重试");
      return;
    }
    activeSearchFenRef.current = chess.fen();
    pendingScoreRef.current = {};
    setEngineState("thinking");
    setSelectedSquare(null);
    setMessage(`${winnerColor === "w" ? "白方" : "黑方"} AI 正在计算最佳走法…`);
    worker.postMessage("stop");
    worker.postMessage(`position fen ${chess.fen()}`);
    worker.postMessage(`go movetime ${moveTime}`);
  }, [engineState, moveTime, winnerColor]);

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
          return;
        }
        const searchedFen = activeSearchFenRef.current;
        activeSearchFenRef.current = null;
        if (!searchedFen || chess.fen() !== searchedFen) {
          setEngineState("ready");
          return;
        }
        try {
          const move = chess.move({
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            promotion: uci[4] || "q",
          });
          setBoard(chessToBoard(chess));
          setLastMove({ from: move.from, to: move.to });
          setMoves((current) => [...current, move]);
          updateEvaluation(pendingScoreRef.current);
          setEngineState("ready");
          if (chess.isGameOver()) {
            setPhase("over");
            setMessage(describeEnding(chess));
          } else {
            setMessage(`轮到你模拟${humanColor === "w" ? "白方" : "黑方"}落子`);
          }
        } catch {
          setEngineState("error");
          setMessage("引擎返回了无法执行的棋步");
        }
      }
    };
    worker.onerror = () => {
      setEngineState("error");
      setMessage("Stockfish 载入失败，请刷新页面重试");
    };
    worker.postMessage("uci");
    return () => {
      worker.postMessage("quit");
      worker.terminate();
    };
  }, [humanColor, updateEvaluation]);

  useEffect(() => {
    if (phase === "playing" && chessRef.current?.turn() === winnerColor && engineState === "ready") {
      const timer = window.setTimeout(makeEngineMove, 180);
      return () => window.clearTimeout(timer);
    }
  }, [board, engineState, makeEngineMove, phase, winnerColor]);

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
      activeSearchFenRef.current = null;
      setMoves([]);
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
    workerRef.current?.postMessage("stop");
    chessRef.current = null;
    activeSearchFenRef.current = null;
    startingPositionRef.current = null;
    if (engineState !== "error" && engineState !== "loading") setEngineState("ready");
    setBoard({});
    setPhase("setup");
    setMoves([]);
    setLastMove(null);
    setSelectedPiece(null);
    setSelectedSquare(null);
    setIsStandardSetup(false);
    setEngineScoreWhite(null);
    setEvaluation("等待局面");
    setMessage("棋盘已清空，重新布置残局");
  };

  const editAgain = () => {
    workerRef.current?.postMessage("stop");
    chessRef.current = null;
    activeSearchFenRef.current = null;
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
    setLastMove(null);
    setSelectedPiece(null);
    setSelectedSquare(null);
    setEngineScoreWhite(null);
    setEvaluation("等待局面");
    setMessage(starting ? "已恢复本局开始前的摆法，可重新调整" : "已返回摆棋模式");
  };

  const undoLastTurn = () => {
    const chess = chessRef.current;
    if (!chess || !canUndo) {
      setMessage("还没有可以撤销的己方棋步");
      return;
    }

    workerRef.current?.postMessage("stop");
    activeSearchFenRef.current = null;
    let undone: Move | null = null;
    do {
      undone = chess.undo();
    } while (undone && undone.color !== humanColor);

    const history = chess.history({ verbose: true }) as Move[];
    const previous = history.at(-1);
    setBoard(chessToBoard(chess));
    setMoves(history);
    setLastMove(previous ? { from: previous.from, to: previous.to } : null);
    setSelectedSquare(null);
    setPhase("playing");
    setEngineScoreWhite(null);
    setEvaluation("等待重新评估");
    if (engineState !== "error") setEngineState("ready");
    setMessage("已悔棋，轮到你重新落子");
  };

  const loadStandardPosition = () => {
    workerRef.current?.postMessage("stop");
    chessRef.current = null;
    activeSearchFenRef.current = null;
    startingPositionRef.current = null;
    if (engineState !== "error" && engineState !== "loading") setEngineState("ready");
    setBoard(chessToBoard(new Chess()));
    setTurn("w");
    setPhase("setup");
    setMoves([]);
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

  const renderPieceTray = (color: Color, placement: "top" | "bottom") => {
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
            setMessage(`请将${piece.color === "w" ? "白" : "黑"}棋放回对应颜色的棋子库`);
            return;
          }
          returnPieceToTray(source);
        }}
      >
        <div className="inline-tray-label">
          <span className={`color-dot ${color}`} />
          <span>
            <strong>{color === "w" ? "白方棋子库" : "黑方棋子库"}</strong>
            <small>点按或拖动</small>
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
                  setSelectedSquare(null);
                  setSelectedPiece(isSelected ? null : { color, type });
                  setMessage(
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
              <span>翻转视角</span>
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

          {phase === "setup" && renderPieceTray(topTrayColor, "top")}

          <div className="board-wrap">
            <div className="chessboard" role="grid" aria-label="国际象棋棋盘">
              {shownRanks.flatMap((rank, rankIndex) =>
                shownFiles.map((file, fileIndex) => {
                  const square = `${file}${rank}` as Square;
                  const piece = board[square];
                  const dark = (files.indexOf(file) + ranks.indexOf(rank)) % 2 === 1;
                  const selected = selectedSquare === square;
                  const moved = lastMove?.from === square || lastMove?.to === square;
                  const legalTarget = legalTargets.has(square);
                  return (
                    <button
                      className={`square ${dark ? "dark" : "light"} ${selected ? "selected" : ""} ${moved ? "last-move" : ""} ${legalTarget ? "legal-target" : ""}`}
                      key={square}
                      role="gridcell"
                      data-square={square}
                      onClick={() => handleSquareClick(square)}
                      draggable={phase === "setup" && Boolean(piece)}
                      onDragStart={(event) => {
                        if (phase === "setup" && piece) {
                          event.dataTransfer.setData("application/board-square", square);
                          setSelectedPiece(null);
                          setSelectedSquare(square);
                        }
                      }}
                      onDragOver={(event) => phase === "setup" && event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        const source = event.dataTransfer.getData("application/board-square") as Square;
                        if (source && board[source]) {
                          moveSetupPiece(source, square);
                          return;
                        }
                        const data = event.dataTransfer.getData("application/chess-piece");
                        if (data.length === 2) placePiece(square, { color: data[0] as Color, type: data[1] as PieceSymbol });
                      }}
                      aria-label={`${square}${piece ? ` ${piece.color === "w" ? "白" : "黑"}${pieceNames[piece.type]}` : " 空"}`}
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

          {phase === "setup" && renderPieceTray(bottomTrayColor, "bottom")}

          {phase !== "setup" && (
            <div className="board-actions">
              <div className="play-actions">
                <button className="undo-button" disabled={!canUndo} onClick={undoLastTurn}>悔棋重走</button>
                <button className="ghost-button" onClick={editAgain}>重摆开局</button>
              </div>
              <span>悔棋会撤销 AI 回应和你的上一手 · 重摆会恢复开局摆法</span>
            </div>
          )}
        </div>

        <aside className="control-panel">
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

          <section className="position-dashboard" aria-label="双方子力与胜率">
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
                    <small>子力 {material[color]}</small>
                  </div>
                  <div className="material-pieces" aria-label={`${color === "w" ? "白方" : "黑方"}当前棋子`}>
                    {pieceOrder.map((type) => (
                      counts[color][type] > 0 && (
                        <span className="material-piece" key={type}>
                          <PieceArt piece={{ color, type }} className="material-piece-art" />
                          <b>{counts[color][type]}</b>
                        </span>
                      )
                    ))}
                    {Object.values(counts[color]).every((count) => count === 0) && <em>暂无棋子</em>}
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

          {phase === "setup" ? (
            <>
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
            </>
          ) : (
            <>
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
              <button className="start-button secondary" onClick={editAgain}>重摆开局 <span>↗</span></button>
            </>
          )}
        </aside>
      </section>

      <footer>
        <span>仅用于自定义残局研究与本地推演</span>
        <span>Stockfish 17.1 · GPLv3 · 无法保证理论败势逆转</span>
      </footer>
    </main>
  );
}
