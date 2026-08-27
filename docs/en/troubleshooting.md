# Troubleshooting

Real failure modes, what causes them, and fixes. Most status text appears in the top bar and the banner above the board.

## Page Stuck on "Loading Engine…"

**Symptoms:** the engine pill never turns to "ready"; pressing start leaves AI silent.

**Causes & fixes:**

1. `/engine/stockfish.js` or `stockfish.wasm` unreachable — check DevTools Network. On GitHub Pages this normally means a build/base-path mismatch; confirm the URL includes `/chess-reversal-lab/engine/stockfish.wasm`.
2. The device blocked WASM compilation (rare; some hardened browsers). Try another browser.
3. A stale cached HTML references old asset names. Hard-refresh (Cmd/Ctrl+Shift+R).

After fixing, reload the page — the worker is created once per load and there is currently no in-page retry button.

## "Engine unavailable"

The worker fired an error event during startup (load failure or abort). Reload; if persistent, check item 1 above.

## AI Doesn't Move

- Confirm it is actually the AI's turn: the banner shows *AI's turn*, and the side summary shows which color Stockfish controls.
- If you pressed Undo while it was thinking, that is expected: undo cancels the search and hands the move back to you.
- Reviewing? Moves are blocked while the review cursor is active — return to the latest position with **Next**.

## Start Button Disabled

Read the validation card directly above it. Typical blockers: missing second king, adjacent kings, a pawn on rank 1/8, or the not-to-move side already in check. Adjust the setup until it turns green.

## A Piece Won't Place

- That type/color combination may be used up — its tray button shows ×0 and is disabled.
- Pawns refuse ranks 1 and 8 by design.
- You might be dropping onto the opponent's tray; pieces belong to their own color tray only.

## Language Didn't Stick / Mixed Text

Your manual choice is stored under `localStorage` key `locale`. Clearing site data resets detection. If the status line lags behind after switching, reload — v0.1.0 re-derives standard messages automatically on locale change, but browser-cached HTML can briefly show the other language before scripts run.

## Build Failures

- `npm test` failed during build → fix the build first; tests intentionally require a fresh production bundle (`dist/`) before running assertions.
- Static export fails with TypeScript errors → builds use `tsconfig.pages.json`; make sure new code compiles under both configs.
- Pages deploy fails in CI → open the workflow log; the most common cause is a stale lockfile committed out of sync (run `npm ci` locally to verify), then re-push.

## Still Broken?

Please [open an issue](https://github.com/petrel2015/chess-reversal-lab/issues) with your browser, OS, whether the demo or local build is affected, and the exact status message shown.
