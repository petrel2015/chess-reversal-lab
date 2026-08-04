import assert from "node:assert/strict";
import { access, readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the position lab shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>逆转棋局 · AI 国际象棋推演<\/title>/);
  assert.match(html, /<meta name="application-name" content="逆转棋局"\/>/);
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes"\/>/);
  assert.match(html, /<meta name="apple-mobile-web-app-title" content="逆转棋局"\/>/);
  assert.match(html, /<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"\/>/);
  assert.match(html, /<meta name="theme-color" content="#0c0e0c"\/>/);
  assert.match(html, /<link rel="manifest" href="[^"]*site\.webmanifest"\/>/);
  assert.match(html, /<link rel="apple-touch-icon" href="[^"]*apple-touch-icon\.png" sizes="180x180" type="image\/png"\/>/);
  assert.match(html, /摆下残局/);
  assert.match(html, /Stockfish 17\.1/);
  assert.match(html, /已加载标准开局，可直接开始或继续调整/);
  assert.match(html, /基础合法性检查已通过/);
  assert.match(html, /aria-label="a8 黑车"/);
  assert.match(html, /aria-label="e1 白王"/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});

test("ships installable iPhone and PWA metadata with correctly sized icons", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../public/site.webmanifest", import.meta.url), "utf8"),
  );

  assert.equal(manifest.name, "逆转棋局 · AI 残局推演");
  assert.equal(manifest.short_name, "逆转棋局");
  assert.equal(manifest.id, "./");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.background_color, "#0c0e0c");
  assert.equal(manifest.theme_color, "#0c0e0c");
  assert.deepEqual(
    manifest.icons.map(({ src, sizes, purpose }) => ({ src, sizes, purpose })),
    [
      { src: "icon-192.png", sizes: "192x192", purpose: "any maskable" },
      { src: "icon-512.png", sizes: "512x512", purpose: "any maskable" },
    ],
  );

  const pngSize = async (relativePath) => {
    const bytes = await readFile(new URL(relativePath, import.meta.url));
    assert.ok(bytes.length > 10_000, `${relativePath} should contain a detailed icon`);
    assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG");
    return {
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    };
  };

  assert.deepEqual(await pngSize("../public/apple-touch-icon.png"), { width: 180, height: 180 });
  assert.deepEqual(await pngSize("../public/icon-192.png"), { width: 192, height: 192 });
  assert.deepEqual(await pngSize("../public/icon-512.png"), { width: 512, height: 512 });
});

test("ships the browser engine and removes starter assets", async () => {
  const [worker, wasm] = await Promise.all([
    stat(new URL("../public/engine/stockfish.js", import.meta.url)),
    stat(new URL("../public/engine/stockfish.wasm", import.meta.url)),
  ]);
  assert.ok(worker.size > 10_000);
  assert.ok(wasm.size > 1_000_000);
  const socialPreview = await stat(new URL("../public/og.png", import.meta.url));
  assert.ok(socialPreview.size > 100_000);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));

  const [page, css, packageJson, pieces, pagesWorkflow] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readdir(new URL("../public/chess-pieces/", import.meta.url)),
    readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8"),
  ]);
  assert.match(page, /new Worker\(`\$\{basePath\}\/engine\/stockfish\.js`\)/);
  assert.match(page, /new Chess\(boardToFen\(board, turn, isStandardSetup \? "KQkq" : "-"\)\)/);
  assert.match(page, /chess-pieces\/w-k\.png/);
  assert.doesNotMatch(page, /[♔♕♖♗♘♙♚♛♜♝♞♟]/);
  assert.match(css, /grid-template-rows:\s*repeat\(8,\s*minmax\(0,\s*1fr\)\)/);
  assert.deepEqual(pieces.sort(), [
    "b-b.png", "b-k.png", "b-n.png", "b-p.png", "b-q.png", "b-r.png",
    "w-b.png", "w-k.png", "w-n.png", "w-p.png", "w-q.png", "w-r.png",
  ]);
  assert.match(pagesWorkflow, /actions\/deploy-pages@v4/);
  assert.match(page, /const moveSetupPiece =/);
  assert.match(page, /const returnPieceToTray =/);
  assert.match(page, /const legalTargets =/);
  assert.match(page, /\.moves\(\{ square: selectedSquare, verbose: true \}\)/);
  assert.match(page, /兵不能后退/);
  assert.match(page, /翻转棋盘视角，仅改变显示方向/);
  assert.match(page, /翻转视角/);
  assert.match(page, /className="flip-side-piece"/);
  assert.doesNotMatch(page, /className="flip-color/);
  assert.doesNotMatch(page, /className="icon-button"/);
  assert.match(page, /const loadStandardPosition =/);
  assert.match(page, /useState<BoardMap>\(\(\) => chessToBoard\(new Chess\(\)\)\)/);
  assert.match(page, /useState\(true\)/);
  assert.match(page, /setBoard\(chessToBoard\(new Chess\(\)\)\)/);
  assert.match(page, /isStandardSetup \? "KQkq" : "-"/);
  assert.match(page, /标准开局/);
  assert.match(page, /空棋盘/);
  assert.match(page, /选择起始棋盘/);
  assert.ok(
    page.indexOf('className="setup-presets"') < page.indexOf('className="board-wrap"'),
    "board presets should appear above the board",
  );
  assert.match(page, /const topTrayColor: Color = isFlipped \? "w" : "b"/);
  assert.match(page, /const bottomTrayColor: Color = isFlipped \? "b" : "w"/);
  assert.match(page, /renderPieceTray\(topTrayColor, "top"\)/);
  assert.match(page, /renderPieceTray\(bottomTrayColor, "bottom"\)/);
  assert.doesNotMatch(page, /className=\{`piece-panel/);
  assert.match(css, /\.board-piece-tray \.piece-grid/);
  assert.match(css, /\.setup-presets\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.board-preset-bar \.setup-presets > button\s*\{[\s\S]*?height:\s*42px/);
  assert.match(page, /双方子力与胜率/);
  assert.match(page, /Stockfish 局面估算/);
  assert.match(page, /子力与胜算/);
  assert.match(page, /const materialDelta = useMemo/);
  assert.match(page, /b: whiteLead === 0 \? 0 : -whiteLead/);
  assert.match(page, /子力差 \{formatMaterialDelta\(materialDelta\[color\]\)\}/);
  assert.match(page, /renderPositionDashboard\("control"\)/);
  assert.match(page, /renderPositionDashboard\("board"\)/);
  assert.match(css, /\.board-dashboard\s*\{[\s\S]*?display:\s*none/);
  assert.ok(
    page.indexOf('className="control-panel"') < page.indexOf('className="selection-toolbar"'),
    "selected-piece controls should live in the right control panel",
  );
  assert.match(page, /const undoLastTurn =/);
  assert.match(page, /const redoLastTurn =/);
  assert.match(page, /const reviewPreviousMove =/);
  assert.match(page, /const reviewNextMove =/);
  assert.match(page, /const displayBoard = useMemo/);
  assert.match(page, /disabled=\{!canRedo\}/);
  assert.match(page, /disabled=\{!canReviewBack\}/);
  assert.match(page, /disabled=\{!canReviewForward\}/);
  assert.match(page, /className="history-icon" aria-hidden="true">↶/);
  assert.match(page, /className="history-icon" aria-hidden="true">↷/);
  assert.match(page, /悔棋/);
  assert.match(page, /恢复/);
  assert.match(page, /回看棋谱/);
  assert.match(page, /上一步/);
  assert.match(page, /下一步/);
  assert.match(page, /回看不会改变棋局/);
  assert.match(page, /重摆开局/);
  assert.match(page, /const editFromCurrentPosition =/);
  assert.match(page, /const currentBoard = currentChess \? chessToBoard\(currentChess\) : board/);
  assert.match(page, /const nextTurn = currentChess\?\.turn\(\) \?\? turn/);
  assert.match(page, /setBoard\(cloneBoard\(currentBoard\)\)/);
  assert.match(page, /setTurn\(nextTurn\)/);
  assert.match(page, /setIsStandardSetup\(false\)/);
  assert.match(page, /已将当前最新局面设为新起点，可继续摆棋/);
  assert.equal(page.match(/从当前局面重摆/g)?.length, 2);
  assert.match(page, /startingPositionRef/);
  assert.match(page, /activeSearchFenRef/);
  assert.match(page, /放回棋子库/);
  assert.match(page, /className="tray-return-target"/);
  assert.match(page, /点这里放回已选棋子/);
  assert.match(page, /returnPieceToTray\(selectedSquare\)/);
  assert.match(css, /\.tray-return-target\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*0/);
  assert.match(page, /control-panel \$\{phase\}/);
  assert.match(page, /className="setup-config"/);
  assert.match(css, /\.control-panel\.setup\s*\{[\s\S]*?order:\s*1/);
  assert.match(css, /\.control-panel\.playing,[\s\S]*?\.control-panel\.over\s*\{[\s\S]*?order:\s*3/);
  assert.match(css, /\.control-dashboard\s*\{\s*display:\s*none/);
  assert.match(css, /\.board-dashboard\s*\{[\s\S]*?display:\s*block/);
  assert.match(page, /application\/board-square/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("mobile layout stays within viewport and keeps touch targets usable", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  // Mobile tray/piece grids must shrink instead of pinning a 40px+ min column.
  const mobileBlock = css.match(/@media \(max-width: 680px\)\s*\{([\s\S]*?)\n\}\n/);
  assert.ok(mobileBlock, "680px mobile block should exist");
  const mobile = mobileBlock[1];
  assert.doesNotMatch(
    mobile,
    /\.board-piece-tray \.piece-grid\s*\{[\s\S]*?minmax\(4[0-9]px/,
    "mobile tray piece-grid must not pin a 40px+ min column",
  );
  assert.match(
    mobile,
    /\.board-piece-tray \.piece-grid\s*\{[\s\S]*?minmax\(0,\s*1fr\)/,
    "mobile tray piece-grid must shrink with minmax(0, 1fr)",
  );
  assert.match(
    mobile,
    /\.piece-grid\s*\{[\s\S]*?minmax\(0,\s*1fr\)/,
    "mobile piece-grid must shrink with minmax(0, 1fr)",
  );

  // Horizontal overflow is clamped at the root on mobile.
  assert.match(mobile, /html, body\s*\{[\s\S]*?overflow-x:\s*hidden/);
  assert.match(mobile, /\.app-shell\s*\{[\s\S]*?overflow-x:\s*hidden/);
  assert.match(mobile, /\.app-shell\s*\{[\s\S]*?max-width:\s*100vw/);
  assert.match(mobile, /\.workspace\s*\{[\s\S]*?overflow-x:\s*hidden/);
  assert.match(mobile, /\.board-column\s*\{[\s\S]*?overflow-x:\s*hidden/);

  // Compact setup: decorative english labels and hint copy hidden on mobile.
  assert.match(mobile, /\.eyebrow\s*\{\s*display:\s*none/);
  assert.match(mobile, /\.control-panel \.tiny-label\s*\{\s*display:\s*none/);
  assert.match(mobile, /\.setup-config fieldset > p\s*\{\s*display:\s*none/);
  assert.match(mobile, /\.chance-note\s*\{\s*display:\s*none/);
  assert.match(mobile, /\.control-panel\.setup \.edit-hint-card\s*\{[\s\S]*?display:\s*none/);

  // Setup order preserved: setup config above board, dashboard moved down; playing keeps board first.
  assert.match(mobile, /\.control-panel\.setup\s*\{[\s\S]*?order:\s*1/);
  assert.match(mobile, /\.board-column\s*\{[\s\S]*?order:\s*2/);
  assert.match(mobile, /\.control-panel\.playing,[\s\S]*?order:\s*3/);
  assert.match(mobile, /\.turn-options\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2/);

  // Winner + turn still render two clear options each.
  assert.match(page, /name="winner"[\s\S]*?name="winner"/);
  assert.match(page, /name="turn"[\s\S]*?name="turn"/);

  // AI think-time range, legality validation, and start button remain present.
  assert.match(page, /type="range"/);
  assert.match(page, /`validation \$\{setupError \? "warning" : "ok"\}`/);
  assert.match(page, /className="start-button"/);

  // Touch target floors (>= 40px) on mobile.
  assert.match(mobile, /\.segmented label\s*\{[\s\S]*?min-height:\s*4[0-9]px/);
  assert.match(mobile, /\.turn-options label > span\s*\{[\s\S]*?min-height:\s*4[0-9]px/);
  assert.match(mobile, /\.history-action-row > button[\s\S]*?min-height:\s*4[0-9]px/);
  assert.match(mobile, /\.position-reset-actions\.compact \.ghost-button\s*\{[\s\S]*?min-height:\s*4[0-9]px/);
  assert.match(mobile, /\.start-button\s*\{[\s\S]*?min-height:\s*4[0-9]px/);

  // 360px-class (390px breakpoint) still clamps and keeps targets >= 40px.
  const narrowBlock = css.match(/@media \(max-width: 390px\)\s*\{([\s\S]*?)\n\}\n/);
  assert.ok(narrowBlock, "390px narrow block should exist");
  const narrow = narrowBlock[1];
  assert.match(narrow, /\.app-shell\s*\{[\s\S]*?padding/);
  assert.match(narrow, /\.hero-copy\s*\{\s*display:\s*none/);
  assert.match(narrow, /\.control-panel\.setup \.control-heading\s*\{\s*display:\s*none/);
  assert.match(narrow, /\.tray-piece\s*\{[\s\S]*?min-height:\s*4[0-9]px/);
  assert.match(narrow, /\.segmented label\s*\{[\s\S]*?min-height:\s*4[0-9]px/);
  assert.match(narrow, /\.start-button\s*\{[\s\S]*?min-height:\s*4[0-9]px/);

  // Desktop layout structure preserved (no accidental clobber of base columns).
  assert.match(css, /\.workspace\s*\{[\s\S]*?grid-template-columns:\s*minmax\(560px, 1fr\) minmax\(275px, 0\.42fr\)/);
  assert.match(css, /\.board-piece-tray\s*\{[\s\S]*?grid-template-columns:\s*112px 1fr/);
  assert.match(css, /\.board-piece-tray \.piece-grid\s*\{[\s\S]*?minmax\(46px, 1fr\)/);

  // Flip button exposes an icon-only mode on the narrowest screens via a labelled span.
  assert.match(page, /className="flip-label"/);
  assert.match(narrow, /\.flip-label\s*\{\s*display:\s*none/);
});
