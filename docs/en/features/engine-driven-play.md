# Engine-Driven Play

## Summary

Engine-Driven Play makes Stockfish 17.1 (single-threaded WASM) act as the side the user designated to win. It searches inside a Web Worker via the UCI protocol and always plays its best move; a slider controls how long it thinks per move.

## Background

Practicing against best defense is what turns "I'm up material" into "I can actually convert it". A weak or random opponent would defeat the tool's purpose.

## Problem

Browsers can't run native analysis binaries, most cloud engine services need accounts/tokens and network round-trips, and naive WASM embedding tends to freeze the UI thread during deep searches.

## Goals

- Zero-install, zero-account engine opposition that runs entirely client-side.
- Never block interaction: search must live off the main thread.
- Predictable pace: user-visible thinking time from 0.4 s to 3.0 s.
- Correctness under interruption: undoing while the engine thinks must never apply an answer computed for a position that no longer exists.

## Non-Goals

This feature does not aim to:

- provide multi-line (MultiPV) analysis or tablebase lookups
- use multi-core or NNUE-large configurations
- offer difficulty levels or intentional blunders — the designated side is always trying its best
- import opening books or endgame syzygy tables

## Solution Overview

`app/lib/use-engine.ts` creates exactly one `Worker('/engine/stockfish.js')` for the page lifetime:

```text
uci ─▶ uciok ─▶ setoption Hash 32 ─▶ isready ─▶ readyok ⇒ ready
每回合: stop → position fen <fen> → go movetime <400–3000>
结果:  bestmove <uci> → moved | (none) | stale(仅保留评分)
```

Three deliberate choices:

1. **Refs over deps.** Changing callbacks are read through refs so React re-renders never recreate the worker; recreating mid-WASM-compile used to wedge the engine in "loading" forever (this bug shipped briefly and was fixed within v0.1.0).
2. **Stale-search guard.** Every search records its starting FEN (`activeSearchFenRef`). If `bestmove` arrives after the game moved on (user undid/captured etc.), the move is discarded as *stale* and only the accompanying score updates the evaluation. This single guard makes undo-during-thinking safe without any cancellation protocol beyond UCI `stop`.
3. **White-perspective score normalization.** Scores arrive relative to the mover; they're transformed to white perspective once, so downstream win-chance math has one consistent frame.

## Detailed Behavior

- Turn trigger: when phase = playing, it's the winner color's turn, state = ready → ~180 ms scheduling delay → `go movetime <slider ms>` (default 1200).
- Promotion defaults to queen on application of the returned UCI string.
- `(none)` bestmoves surface a "no move" outcome instead of hanging.
- Evaluation buckets map centipawns to friendly text at ±0.6 / ±2.5 pawns plus mate scores ("can force mate · M5").
- Engine failure sets an error state; setup remains usable but AI play stops.

## User Experience

The top-bar pill communicates loading → ready → thinking → error. The turn banner announces whose move it is, and evaluation wording always speaks from the designated winner's viewpoint.

![Engine thinking results in the dashboard](../../img/match-analysis-zh.webp)

## Compatibility and Historical Impact

No historical behavior affected; this is part of the founding release. The worker-lifetime fix changed internal lifecycle only, not any observable interface.

## Data and Privacy Impact

The engine runs same-origin WASM locally; search transmits nothing off-device.

## Performance Impact

Search occupies one Worker thread with a 32 MB hash; main thread stays free. Think time is capped at 3 s by design for pacing, not by platform limits.

## Current Limitations

- Single-threaded build: no parallel search even on many-core devices.
- No persistent skill/difficulty parameterization.
- Fixed Hash size (32 MB); very long sessions won't grow tables adaptively.

## Release Information

Introduced: v0.1.0 · Status: Stable

## Related Documentation

[Usage guide](../usage.md#play-the-scenario) · [Architecture](../architecture.md) · [Troubleshooting](../troubleshooting.md)

## Feature Changelog

### v0.1.0

Initial release; includes the worker-lifetime reliability fix (callbacks held via refs).
