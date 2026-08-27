# Custom Position Setup

## Summary

Custom Position Setup is the core editing experience: users assemble any legal chess position from an empty board or the standard opening, using per-color piece trays with tap or drag interactions, while legality validation runs continuously and gates the start button.

![A K+Q vs K endgame being assembled](../../img/custom-endgame-setup-zh.webp)

## Background

The tool exists to answer "what if" moments, so position creation has to be the primary flow rather than a hidden mode behind FEN import.

## Problem

Before this feature there was simply no product: existing tools either require typing FEN strings — unintuitive for casual learners — or bury board editors behind thick analysis UIs designed for full-game study. On phones those editors are particularly hostile.

## Goals

- Assemble a legal position with taps only (mobile-first) and with drag-and-drop (desktop convenience).
- Keep realistic chess constraints enforced *while editing*, not only at start time.
- Offer a zero-thought default (standard opening) alongside the free-form path.
- Make failure reasons visible instead of silently normalizing inputs.

## Non-Goals

This feature deliberately does not aim to:

- parse or accept FEN/PGN input
- support positions requiring en-passant availability or specific castling history
- provide a library of named endgames or puzzles
- allow unbalanced or illegal curiosities (two kings per side, adjacent kings, pawns on the back ranks)

## Solution Overview

- The board is a plain `{square → {color,type}}` map in React state; edits are pure map transformations.
- Trays derive remaining counts from `pieceLimit − currentCount`, which means captures during play automatically return availability — no extra bookkeeping.
- Board-to-FEN serialization (`boardToFen`) and `validatePosition` (in `app/lib/chess-utils.ts`) reuse the exact same code at edit time and game-start time, guaranteeing that what you see validated is what gets played.
- Validation returns translation keys; the UI decides how to present them (card + start button gating).

## Detailed Behavior

- Tap tray piece → tap square to place; drag tray→square also places; drag square→own tray removes.
- Clicking a board piece selects it; clicking another square moves, swapping when occupied.
- Placement constraints applied immediately: pawn rank rule, piece-count limits, own-tray-only returns.
- Start gating conditions: one king each; kings not adjacent; no pawns on ranks 1/8; not both kings in check; non-mover not already in check.
- Presets: **Empty board** clears everything; **Standard opening** loads 32 pieces with castling rights (`KQkq`). Any manual edit after loading marks the setup as custom (castling `-`).

## User Experience

Status messages narrate every accepted/rejected action ("White queen placed on c7…", "Pawns can't be placed on the first or eighth rank"). A selection toolbar in the side panel offers cancel / return-to-tray for the currently selected board piece.

## Compatibility and Historical Impact

No historical behavior affected — this shipped with the initial release as the founding interaction model. URL schemes, storage, and output formats did not exist before it.

## Data and Privacy Impact

All placement data stays in memory; nothing about setups is persisted or uploaded.

## Performance Impact

Operations are O(1) map updates plus an O(pieces) validation pass on each render cycle; irrelevant at human interaction scale.

## Current Limitations

- Promotion and castling-history semantics are out of reach by design (see Non-Goals).
- No copy/paste or share of a built position.
- Piece limits mirror a standard set exactly (e.g., you cannot place 3 queens even though promotion could produce them in a real game).

## Release Information

Introduced: v0.1.0 · Status: Stable

## Related Documentation

[Usage guide](../usage.md#set-up-a-custom-position) · [Architecture](../architecture.md)

## Feature Changelog

### v0.1.0

Initial release with trays, presets, live validation, drag + tap paths.
