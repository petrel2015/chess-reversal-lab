# Deployment

The site deploys to **GitHub Pages** automatically on every push to `main` via [.github/workflows/pages.yml](https://github.com/petrel2015/chess-reversal-lab/blob/main/.github/workflows/pages.yml). Typical end-to-end time is 1–2 minutes. The workflow also supports manual runs (`workflow_dispatch`).

## Pipeline

1. Checkout → Node 22 with npm cache.
2. `npm ci --ignore-scripts`.
3. `actions/configure-pages` (also enables Pages if an admin has not yet done so).
4. Static export:
   ```bash
   GITHUB_PAGES=true \
   NEXT_PUBLIC_BASE_PATH=/chess-reversal-lab \
   NEXT_PUBLIC_SITE_URL=https://<owner>.github.io/chess-reversal-lab/ \
   npm run build:pages
   ```
5. `touch out/.nojekyll` so GitHub serves the `_/`-prefixed Next.js assets as-is.
6. Upload + deploy the `out/` artifact via `actions/upload-pages-artifact` / `actions/deploy-pages`.

Concurrency is keyed to `pages` and cancels superseded runs.

## Base Path Handling

Pages serves the site under `/chess-reversal-lab/`, so path handling is baked in at build time:

- `NEXT_PUBLIC_BASE_PATH` becomes both `basePath` and `assetPrefix` in `next.config.ts`, affecting HTML, JS, CSS, images, `site.webmanifest`, and — importantly — the engine URLs constructed in code (`${basePath}/engine/stockfish.js`).
- `trailingSlash: true` matches Pages-style directory URLs (`/chess-reversal-lab/foo/`).
- Images are unoptimized in export mode.
- There are no client-side routes beyond `/`; the 404 page is exported by Next.js and deep links to other paths do not exist.

## Custom Domain

Not configured. If you add one later you must:

1. Add a `CNAME` file to the deployed artifact (extend the workflow between build and upload).
2. Update `NEXT_PUBLIC_SITE_URL` accordingly.
3. Configure DNS and the repository's Pages settings.

## First-Time Enablement

If Actions reports *"Pages not enabled"*, open the repository's Settings → Pages once and set Source to *GitHub Actions*; afterwards pushes deploy without intervention (`configure-pages` also attempts enablement with the provided permissions).

## Verifying a Release

After a push:

1. Watch the *Deploy GitHub Pages* workflow run in the Actions tab.
2. Open <https://petrel2015.github.io/chess-reversal-lab/> (hard-refresh to bypass cache).
3. Confirm the top-bar pill reaches "Stockfish 17.1 已就绪 / ready" — this proves the WASM assets resolve under the subpath.
4. Play one move against the engine as a smoke test.

Local pre-verification steps are described in [Development Guide](./development.md#verifying-a-pages-build-locally).
