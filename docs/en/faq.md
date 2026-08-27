# FAQ

Short answers to questions that come up about scope and behavior. Deeper background lives in the [Feature Index](./features/index.md).

**Can it actually reverse a theoretically lost position?**
No — and the app says so itself. "Reversal" refers to exploring whether *you* can find a way out; Stockfish always plays the strongest move for the side you designated. If that side is lost, the evaluation will show you losing.

**Why can't I castle or capture en passant in my custom position?**
A freshly invented position has no move history, so those rights cannot be derived consistently. Custom setups therefore start without castling rights and en passant availability. The standard-opening preset keeps full castling rights. See [custom-position-setup](./features/custom-position-setup.md).

**Can I choose what a pawn promotes to?**
Not currently; promotion is always to a queen.

**Can I import or export FEN/PGN?**
Not in v0.1.0. Positions are built by hand via the trays; there is no file import, clipboard integration, or URL sharing.

**Does undo only take back my own half-move?**
No. Undo removes a full turn: your latest move plus the engine's reply. Redo replays the pair; if redo ends on the engine's turn it recomputes its answer instead of restoring the old one. See [move-history-controls](./features/move-history-controls.md).

**Does reviewing moves let me change something in the past?**
Review is read-only — stepping back shows earlier boards but any attempt to play during review is rejected. To branch, undo (or use *Reset from current position* in setup mode).

**Which side does the AI play?**
Exactly one: whichever color you designate as the winner. You simulate the other side yourself.

**How strong is the engine here?**
It is the single-threaded WASM build of Stockfish 17.1 with a 32 MB hash and a per-move think time capped at 3 seconds — strong for a browser tool, but not comparable to long-time-control multi-core analysis.

**Is my game saved if I refresh?**
No. Nothing about a game is persisted; only your interface language survives reloads. See [Privacy](./privacy.md).

**Does it work offline / as an installed app?**
You can add it to an iPhone home screen and it carries web-app metadata, but there is no Service Worker, so offline behavior is not guaranteed.

**Can I link positions to friends?**
Not currently. The URL never encodes board state.

**Will it play on chess.com/lichess for me?**
No, and that is an explicit non-goal: this tool never interacts with third-party chess platforms.
