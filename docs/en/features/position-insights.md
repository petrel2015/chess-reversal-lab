# Position Insights

## Summary

Position Insights is the always-visible analysis panel: per-side piece tallies, material delta, and a win-chance bar whose estimation source is labeled explicitly as the game evolves (material estimate → engine evaluation → reviewed ply → final result).

## Background

Custom scenarios vary wildly in balance; without a live readout, users cannot tell whether a setup they just built is a fair fight, a torture test, or trivially won.

## Problem

Raw engine scores ("+2.3") are opaque to non-engine users, while pure material counts ignore actual play. Showing either number alone — or worse, switching between them silently — would mislead people into treating estimates as guarantees.

## Goals

- One glance answers: who has more wood, and who is more likely to win *right now*.
- Never present an estimate as truth: label its source at all times.
- Keep evaluation phrased from the scenario's own perspective (the designated winner), not abstract white/black.
- Work identically during setup, play, review, and after game over.

## Non-Goals

This feature does not aim to:

- display full MultiPV lines or principal variations
- provide hoverable engine commentary per move
- show depth/node counters
- model tablebase-perfect values

## Solution Overview

- Tallies come from counting `board`; delta applies fixed values (p1 b3 n3 r5 q9) and reports both sides symmetrically (`+3 / −3`).
- Win chance `W = 100 / (1 + e^(−cp/240))`, rounded and clamped to 1–99%, deliberately never 0/100 except for real results:
  - playing with mate score: ≈99/1
  - playing with cp score: logistic above
  - before first evaluation (or during setup): same curve over material-delta×100
  - reviewing: recomputed for that historical ply's context
  - game over: exact 100/0 on checkmate, 50/50 on any draw
- Evaluation text buckets (from `use-engine`): ±0.6 and ±2.5 pawn thresholds, plus explicit mate wording. All strings translate per locale.

## Detailed Behavior

The panel renders in two placements (control panel during setup/play; compact strip under the board where layout allows); CSS shows exactly one per breakpoint. During review the cursor position drives tallies/chances even though the live game continues.

![Dashboard during an active game](../../img/match-analysis-zh.webp)

A footnote states the estimate caveat in the UI itself ("Win chance is an estimate, not a theoretical guarantee").

## User Experience

No configuration exists — insights are ambient. The source label doubles as honest provenance ("Stockfish position estimate" vs "Estimated by material").

## Compatibility and Historical Impact

No historical behavior affected; part of v0.1.0 founding UI.

## Data and Privacy Impact

Pure computation over in-memory state; no persistence or transmission.

## Performance Impact

O(pieces) recomputation via memoization per board change; negligible.

## Current Limitations

- The sigmoid constant (240) is a chosen heuristic, not fitted data.
- Material-only fallback can disagree sharply with the engine for tactical positions until the first evaluation lands.
- No per-piece tooltip breakdown beyond counts + values.

## Release Information

Introduced: v0.1.0 · Status: Stable

## Related Documentation

[Usage guide](../usage.md#read-the-position-dashboard) · [engine-driven-play](./engine-driven-play.md)

## Feature Changelog

### v0.1.0

Initial release: tallies, delta, source-labeled chance bar, bucketed evaluation text.
