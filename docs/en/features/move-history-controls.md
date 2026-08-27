# Move History Controls

## Summary

Move History Controls give players agency over a running scenario: undo/redo that operates on *full turns* (your move plus the engine's reply), and a separate read-only review mode that steps through every ply without touching the live game.

## Background

Human scenarios fail iteratively — you try an attack, get refuted, and want to repair one decision rather than replaying the whole setup.

## Problem

Half-move undo is the wrong primitive here. Taking back only your own move would strand the game on the engine's turn with no reply to take back, and re-triggering the engine makes "what if I try something else" wasteful or confusing; naive time travel also invites applying engine answers to positions they were never computed for.

## Goals

- One action returns the game to *your* decision point, engine reply included.
- Redo restores the exact line, or honestly recomputes when the engine must speak again.
- Review any earlier board instantly, even mid-game, with zero risk to the live position.
- Interrupting a running search (by undoing) must be safe.

## Non-Goals

This feature does not aim to:

- provide per-half-move undo granularity
- allow editing history in place (branch by undo instead)
- keep multiple variation trees or named lines
- persist history across page reloads

## Solution Overview

Built directly on chess.js state:

- **Undo** pops moves until it has removed one human move (which also removes the engine's reply found beneath it) and pushes the popped pair onto a redo stack.
- **Redo** replays a popped pair verbatim via `chess.move`. If after replay it's the winner color's turn again (i.e., you redid up to your own move), the redo stack entry is consumed but the old engine answer is discarded — the engine recomputes live.
- **Review** keeps `reviewPly`, a cursor into `moves[]`; display boards are reconstructed from the starting-position snapshot (`startingPositionRef` + FEN with correct castling flag), so the authoritative live `Chess` instance is never mutated during review.

## Detailed Behavior

- Undo is enabled once you have made at least one move; each press removes one full turn.
- While the engine is thinking, undo first sends UCI `stop`; any late bestmove then fails the stale-FEN guard and is dropped (its score may still inform the evaluation).
- Redo replays exactly what was undone, including promotions (queen).
- Review ←/→ walks plies 0…n; at ply < n the board, last-move highlight, dashboard counts, and win-chance bar all reflect the historical position; the banner shows "reviewing x/y".
- Attempting to play while reviewing is rejected with guidance rather than silently switching modes.

## User Experience

All controls sit in a labeled group under the board ("Change game": undo/redo · "Review moves": prev/next), each disabled when inapplicable — no hidden traps.

## Compatibility and Historical Impact

No historical behavior affected; shipped as part of v0.1.0. It composes with, rather than changes, setup/reset flows ("Reset setup" restores the pre-game snapshot; "Reset from current position" converts the live position into an editable setup with correct turn).

## Data and Privacy Impact

History lives only in memory (`moves`, `redoTurns`); nothing here introduces persistence or transfers.

## Performance Impact

Review reconstruction replays ≤ n moves through chess.js per cursor change — trivial for realistic game lengths.

## Current Limitations

- No branching tree: two undos followed by a different move discards the earlier line permanently.
- History disappears on refresh (no persistence, consistent with project privacy posture).
- Review cannot jump arbitrarily via a scrubber; stepping is one ply at a time.

## Release Information

Introduced: v0.1.0 · Status: Stable

## Related Documentation

[Usage guide](../usage.md#change-the-course-of-the-game) · [engine-driven-play](./engine-driven-play.md) (stale-search guard detail)

## Feature Changelog

### v0.1.0

Initial release with full-turn undo/redo semantics and non-destructive review.
