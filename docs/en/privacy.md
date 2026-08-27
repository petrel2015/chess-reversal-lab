# Privacy

Verified against the source code at v0.1.0. In short: gameplay data never leaves your browser, and the app barely stores anything at all.

## What the App Stores

| Item | Where | Lifetime |
| --- | --- | --- |
| Interface language (`locale`) | `localStorage` | Until you clear site data |

That is the only persistent record. Positions, moves, configuration choices (winner side, thinking time), and review state live only in memory; refreshing the page discards them.

## Network Behavior

- The application makes **no** runtime API calls: no backend exists, no analytics, no telemetry, no third-party fonts or CDNs.
- Static assets (HTML/JS/CSS, chess-piece images, Stockfish `stockfish.js` + `.wasm`, donate QR PNGs) are fetched from GitHub Pages same-origin when the page loads.
- Chess rules run via chess.js inside the page; engine search runs in a Web Worker on WASM — both fully local computations.

## Third-Party Interaction

- **Donate buttons** are the one intentional exit: tapping Alipay on mobile attempts to open the Alipay app via an `alipays://` URL scheme; desktop and WeChat show static QR images from this repository. Whether you complete any payment happens entirely between you and those platforms.
- Nothing else links out at runtime.

## Permissions

The app requests no browser permissions (no notifications, geolocation, camera, clipboard write, etc.).

## Cautions

- Do not treat "no tracking" as anonymity advice beyond this app's own behavior; GitHub's own serving infrastructure may log standard request metadata per its terms.
- Because there is no account system, nothing can be synced or restored across devices by design.

For implementation references see [Architecture](./architecture.md) and `app/lib/i18n.tsx` / `app/lib/use-engine.ts`.
