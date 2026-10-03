# Changelog

All notable, user-visible changes to this project are documented here.
Format inspired by [Keep a Changelog](https://keepachangelog.com/); versions are plain milestone markers at this stage. The Chinese counterpart lives in [CHANGELOG.zh.md](./CHANGELOG.zh.md).

> 早期开发（2026-07-27 首次公开发布前后的细粒度提交）没有打标签或发布 Release，
> 因此只保留一个汇总的初始版本条目；更细的历史请查阅 Git 提交记录。

## [Unreleased]

### Added

- Mobile in-game redesign (≤680px): once the simulation starts, the pre-game configuration (designated winner / first mover / AI time / layout) collapses into a summary bar above the board; tapping "Reconfigure" opens a menu (reset to starting setup / edit from current position) — the only way back to editing. The AI coach no longer covers the board with a full-screen drawer: it docks as a persistent bottom strip showing only the latest Q&A plus the input box; tap ⌃ to expand it into a ~half-screen sheet with the full history, quick questions and streaming thinking (the board shrinks to a live preview), while auto-briefs keep running in the background. The in-game screen is viewport-locked, the board sizes itself to the remaining space (container queries), undo / redo / review merge into one row of four buttons, and the move list becomes a single auto-scrolling horizontal strip. Design comps live in `docs/mockups/mobile-coach/`.
- Mobile setup-phase ordering: the board and presets move above the configuration card, the marketing hero is hidden on phones in all phases, and short landscape windows (height <500px) fall back to the previous scrolling layout with the drawer coach.
- AI coach drawer: a topbar entry opens a right-side slide-in drawer for asking an LLM "why was this move played" in natural language. Users configure their own OpenAI-compatible service in-page (Base URL / API key / model, stored only in the browser's localStorage; requests go directly to the provider with no server relay). Every question automatically carries the full context of the currently viewed position (FEN, complete move list, last-move attribution, Stockfish evaluation, review position), with quick-question chips (explain last move / evaluate position / what should I play) and an opt-in per-move auto-brief toggle (off by default).
- Docked coach panel: on wide screens (≥1240px) the coach becomes a third workspace column beside the board — no backdrop, so you can chat while playing; the conversation persists across open/close. Narrow screens keep the slide-in drawer.
- Streaming replies with visible thinking: chat now uses SSE streaming; reasoning models (GLM / DeepSeek R series etc.) surface `reasoning_content` as a collapsible "Thought for Ns" row with a live scrolling marquee while thinking — click to expand the full chain of thought. The answer renders incrementally as it streams.
- Markdown rendering for coach replies (bold, lists, tables, inline code via GFM plus single-newline line breaks), so `**xx**` no longer shows as literal asterisks.
- Serialized request queue: auto-briefs and manual questions run one at a time instead of aborting each other.
- "Test connection" button in the settings form: sends a minimal request using the current draft values — shows ✓ on success or the specific failure reason (invalid key / bad endpoint / rate limit / network or CORS) without needing to save first.
- Zhipu GLM Coding Plan compatibility: reasoning models (GLM-5.3-FlashX etc.) fall back to `reasoning_content` when `content` is empty; "test connection" treats HTTP 200 with a valid shape as connected (reasoning models may return empty content under a small `max_tokens`); an OpenAI Response-protocol endpoint (e.g. Zhipu `/api/v1`) gets a targeted fix-the-URL hint; unreadable responses now carry a raw snippet for debugging.

### Changed

- Default coach provider is now Zhipu GLM: Base URL prefilled as `https://open.bigmodel.cn/api/coding/paas/v4` (Zhipu Coding Plan) with default model `glm-5.3-flashx`; existing configurations are untouched — just paste an API key to start.
- Auto-brief rules: instead of "only while the drawer is open, engine moves only", every move by either side now gets a brief, running in the background even when the panel is closed (briefs accumulate in the conversation); the toggle label and hint were updated accordingly.

### Fixed

- AI coach: the "AI is not configured yet" empty-state card kept showing after saving settings even though the configuration had actually applied; it now swaps to the conversation hint once configured.
- A failing settings write to the browser's storage (e.g. private mode) is no longer silent — an explicit warning explains the settings will be lost on reload.

## [0.1.0] - 2026-08-27

Initial public release. First published on 2026-07-27; this entry describes the complete current v0.1.0 feature set as deployed at <https://petrel2015.github.io/chess-reversal-lab/>.

### Added

- Custom endgame setup: tap-or-drag piece placement from per-color trays with piece-count limits, square-to-square moves and swaps, return-to-tray, empty-board and standard-opening presets.
- Live legality validation: exactly one king per side, no adjacent kings, pawns restricted from first/eighth rank, no mutually-in-check or wrong-side-in-check states.
- Scenario configuration: designate the winning side (Stockfish takes it), choose the first mover, adjust AI thinking time (0.4–3.0 s slider, default 1.2 s).
- Engine-driven play: Stockfish 17.1 single-threaded WASM in a page-lifetime Web Worker speaking UCI; stale-search guarding so responses to outdated positions are discarded safely.
- Full-turn undo/redo: undoing removes your move and the engine's reply; redo replays them, triggering a fresh engine answer when due.
- Non-destructive move review: step through any earlier ply without altering the live game; board interaction is blocked with guidance while reviewing.
- Position insights dashboard: per-side piece tallies, material delta, win-chance estimate bar whose source switches between material estimate, engine evaluation, reviewed ply, and final result.
- Automatic ending detection: checkmate, stalemate, threefold repetition, insufficient material, fifty-move rule.
- Board view flip (display only), mobile-responsive layout down to narrow phones, iPhone home-screen/PWA install metadata.
- Bilingual interface (简体中文 / English) with browser-language detection, manual toggle persisted in `localStorage`, and hydration-safe SSR default.
- Donate footer: Alipay QR modal on desktop, `alipays://` scheme attempt with modal fallback on mobile, WeChat QR modal.

### Fixed

- Engine reliability: hold changing callbacks in refs so the Stockfish Worker is created once per page; recreating it mid-WASM-compilation previously left the engine stuck in "loading".

[Unreleased]: https://github.com/petrel2015/chess-reversal-lab/compare/main...HEAD
