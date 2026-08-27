# Architecture

Chess Reversal is a single-page, client-only application. This page describes the module boundaries, the data flow of a move, and how the browser talks to Stockfish.

## High-Level Shape

```text
┌────────────────────────── Browser ──────────────────────────┐
│                                                             │
│  React UI (app/page.tsx + components/*)                     │
│    ├─ setup mode: PieceTray, ChessBoard, validation card    │
│    ├─ playing/over: dashboard, evaluation, move list        │
│    └─ state: board map, phase, moves[], redoTurns[], review │
│                                                             │
│  app/lib/chess-utils.ts                                     │
│    board ⇄ FEN, validatePosition, endings, material math    │
│                │                                            │
│  app/lib/chess.js instance (rules)   app/lib/use-engine.ts  │
│    legal moves, check/mate/draw       new Worker(engine/)   │
│                                             │ postMessage   │
│                                     ┌───────────────▼──────┐ │
│                                     │ Stockfish 17.1 WASM  │ │
│                                     │ (UCI over Worker)    │ │
│                                     └──────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                    no runtime backend · no network calls
```

## State Model (`app/page.tsx`)

- `phase`: `setup → playing → over` state machine.
- `board`: a plain `{square: {color,type}}` map — the source of truth while editing; during a game it mirrors the chess.js instance.
- `chessRef`: the live `Chess` object from chess.js, carrying authoritative history/rules.
- `startingPositionRef`: snapshot (board + turn + standard flag) taken at start; powers "reset setup", review reconstruction, and castling-rights decisions.
- `moves`, `redoTurns`, `reviewPly`: linear history plus an undo stack of full turns and a nullable review cursor.
- Message strings are derived state; re-derived when locale changes so they never go stale.

## Rules Layer (`app/lib/chess-utils.ts`)

- `boardToFen(board, turn, castling)` serializes the editor's board into FEN. Custom setups pass `-`; the standard preset passes `KQkq`. Halfmove/fullmove counters are fixed at `0 1`.
- `validatePosition` implements the five pre-start checks (one king each, adjacency, pawn rank, both-in-check, wrong-side-in-check) and returns translation keys, not text.
- `describeEnding` maps chess.js predicates onto user-facing ending messages.
- Material values: p 1 / b 3 / n 3 / r 5 / q 9.

## Engine Integration (`app/lib/use-engine.ts`)

- One `Worker(`/engine/stockfish.js`)` is created for the whole page lifetime. All frequently-changing callbacks are read through refs; rebuilding the worker on locale/side changes used to kill the WASM compile mid-initialization (fixed in v0.1.0).
- Handshake: `uci` → on `uciok` set Hash=32 → `isready` → on `readyok` mark ready.
- Search request per engine turn: `stop` → `position fen <fen>` → `go movetime <ms>` with `ms` from the slider (400–3000).
- Result handling on `bestmove`:
  - `(none)` → surfaced as "no move" outcome.
  - If the position has changed since the search began (`activeSearchFenRef`), the reply is treated as *stale* and only its score is kept — this is what makes undo-during-thinking safe.
  - Otherwise `moved` with UCI, converted by the caller via `chess.move(...)` (promotion defaults to queen).
- `score cp|mate n` lines are captured continuously into a pending score and flushed into the white-perspective evaluation display on accepted bestmoves; win chances use a logistic curve (`100 / (1 + e^(−cp/240))`, clamped to 1–99%) or ≈99/1 on mate scores.

## Rendering Components

- `chess-board.tsx` renders the 8×8 grid (ranks/files reversed when flipped), aria-labels every square, highlights selection/legal targets/last move, and supports tap as well as HTML5 drag-and-drop (custom MIME types `application/chess-piece` and `application/board-square`).
- `piece-tray.tsx` owns per-color limits and returns-to-tray flows.
- `position-dashboard.tsx` renders twice (in-panel and under-board variants); CSS decides which one is visible per breakpoint/phase.

## Builds

Two build paths share the same application code:

1. **vinext/Vite pipeline** (`npm run dev`, `npm run build`, used by tests): RSC-style server bundle in `dist/server/index.js` targeted at workerd-like runtimes; the rendered-HTML test imports it directly.
2. **Static export** (`npm run build:pages`): `next.config.ts` flips to `output: "export"` with `basePath`/`assetPrefix` from `NEXT_PUBLIC_BASE_PATH`, producing the pure-static `out/` that GitHub Pages serves.

There is no server component in production: GitHub Pages serves files, everything else happens in the visitor's browser.
