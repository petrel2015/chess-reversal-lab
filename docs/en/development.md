# Development Guide

Everything needed to run, test, and build the project locally. Environment: macOS/Linux/Windows with **Node.js >= 22.13.0** and npm (the repo commits `package-lock.json`; use `npm ci` for reproducible installs).

## Commands

| Command | What it does |
| --- | --- |
| `npm install` / `npm ci` | Install dependencies |
| `npm run dev` | Dev server at <http://localhost:3000/> (via vinext + local worker runtime) |
| `npm test` | Production build, then runs 10 integration tests with `node --test tests/*.test.mjs` |
| `npm run lint` | ESLint over the repo (see known issues below) |
| `npm run build` | vinext production build (Cloudflare-style server bundle in `dist/`, consumed by the rendered-HTML test) |
| `npm run build:pages` | Static export to `out/` for GitHub Pages (`GITHUB_PAGES=true next build --webpack`) |

There is no separate type-check script; TypeScript is checked during builds.

### Tests

`npm test` first performs a full build (so failures there surface early), then executes:

- `tests/chess-rules.test.mjs` — pure-rule checks with chess.js: pawn direction, standard preset integrity (32 pieces + castling rights), material-delta math, undo-a-full-turn semantics, review-reconstruction semantics.
- `tests/rendered-html.test.mjs` — imports the built server bundle (`dist/server/index.js`), renders the page shell, and asserts PWA metadata, engine assets, piece images, i18n dictionaries, key integration points in source, CSS layout rules (including mobile touch-target minimums), and the Pages workflow configuration.

Test status as of v0.1.0 documentation: **10/10 passing**.

### Lint status

`npm run lint` currently reports pre-existing issues unrelated to documentation:

- 8 errors inside the vendored minified `public/engine/stockfish.js` (third-party build; not project code)
- ~38 errors in app sources under strict rules

They are tracked as-is; running the linter after changing code will show whether you added anything new.

## Project Layout

```text
app/
  layout.tsx            # Root layout: I18nProvider, PWA metadata
  page.tsx              # Game state machine and all screens (client component)
  globals.css           # Tailwind v4 entry + all hand-written styles
  components/
    chess-board.tsx     # Board grid rendering, selection/legal highlighting
    piece-tray.tsx      # Per-color trays with limits, drag/tap interactions
    position-dashboard.tsx  # Material tallies, delta, win-chance bar
    piece-art.tsx       # Piece image helper
    language-toggle.tsx # 中/EN switch
    donate-button.tsx   # Alipay/WeChat donate modal
  lib/
    chess-utils.ts      # FEN conversion, validation, endings, material math
    use-engine.ts       # Web Worker lifecycle + UCI handling for Stockfish
    i18n.tsx            # zh/en dictionaries, detection, translate()
public/
  chess-pieces/         # 12 transparent PNG stickers (w-/b- × k q r b n p)
  engine/               # stockfish.js + stockfish.wasm + GPLv3 COPYING.txt
  donate/               # alipay-qr.png, wechat-qr.png
build/sites-vite-plugin.ts  # Vite plugin used by the vinext dev/build path
worker/index.ts         # Cloudflare Workers entry for non-Pages runtime
db/, drizzle/, examples/d1/ # Template leftovers from the starter; unused by the app
scripts/                # Asset tooling (see below)
tests/                  # node --test suites described above
.github/workflows/pages.yml # Pages deployment on push to main
```

## Asset Scripts

Helper scripts regenerate committed assets; run them only when changing assets:

- `python3 scripts/slice_piece_sheet.py` — slices the original piece sheet into normalized transparent PNGs in `public/chess-pieces/`
- `node scripts/generate-app-icons.mjs` — produces icon-192/512, apple-touch-icon
- `node scripts/generate-donate-qr.mjs` — regenerates the donate QR PNGs
- `node scripts/compress-images.mjs` — recompresses repository images

## Local Development Notes

- `npm run dev` serves through the vinext/Vite pipeline (same RSC app code) rather than the static export; behavior of the app itself is identical.
- The engine must be reachable at `/engine/stockfish.js` (+ `.wasm`). In dev and Pages builds the public folder provides this automatically; a custom base path is honored via `NEXT_PUBLIC_BASE_PATH`.
- Environment variables read by the app/build:
  - `GITHUB_PAGES=true` — switches `next.config.ts` to static-export mode (`out/`, trailing slash, unoptimized images)
  - `NEXT_PUBLIC_BASE_PATH` — subpath prefix (e.g. `/chess-reversal-lab`)
  - `NEXT_PUBLIC_SITE_URL` — canonical site URL used for metadata
- The default UI language for server render is Simplified Chinese; client-side detection may switch to English after mount.

## Verifying a Pages Build Locally

Build and serve `out/` from the same subpath used in production:

```bash
GITHUB_PAGES=true \
NEXT_PUBLIC_BASE_PATH=/chess-reversal-lab \
NEXT_PUBLIC_SITE_URL=https://petrel2015.github.io/chess-reversal-lab/ \
npm run build:pages
# then serve out/ under http://127.0.0.1:<port>/chess-reversal-lab/
```

Serving from the filesystem root instead will break asset URLs, because the export bakes in the base path. See [Deployment](./deployment.md) for the CI pipeline details.
