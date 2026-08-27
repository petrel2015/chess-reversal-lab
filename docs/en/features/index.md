# Feature Documentation

This section documents major features, including their motivation, scope, design decisions, compatibility considerations, and release history. 版本号与 [CHANGELOG](../../../CHANGELOG.md) 保持一致。

| Feature | Introduced | Status | Description |
| --- | --- | --- | --- |
| [Custom Position Setup](./custom-position-setup.md) | v0.1.0 | Stable | Build any legal position with trays, presets, and live validation |
| [Engine-Driven Play](./engine-driven-play.md) | v0.1.0 | Stable | Stockfish 17.1 WASM in a Web Worker plays the designated winner |
| [Move History Controls](./move-history-controls.md) | v0.1.0 | Stable | Full-turn undo/redo plus non-destructive ply-by-ply review |
| [Position Insights](./position-insights.md) | v0.1.0 | Stable | Material tallies, delta, and a source-labeled win-chance bar |
| [Internationalization](./internationalization.md) | v0.1.0 | Stable | zh/en UI with detection, persistence, hydration safety |

All five shipped within the v0.1.0 window (first publish 2026-07-27 → current release 2026-08-27); finer-grained history is preserved in Git commits rather than separate version tags.
