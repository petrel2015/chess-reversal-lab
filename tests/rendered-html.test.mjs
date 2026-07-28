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
  assert.match(html, /<title>逆转棋局｜自定义残局推演<\/title>/);
  assert.match(html, /摆下残局/);
  assert.match(html, /Stockfish 17\.1/);
  assert.match(html, /已加载标准开局，可直接开始或继续调整/);
  assert.match(html, /基础合法性检查已通过/);
  assert.match(html, /aria-label="a8 黑车"/);
  assert.match(html, /aria-label="e1 白王"/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
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
  assert.ok(
    page.indexOf('className="control-panel"') < page.indexOf('className="position-dashboard"'),
    "material and win-chance dashboard should live in the right control panel",
  );
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
  assert.match(css, /\.control-panel\.setup \.position-dashboard\s*\{[\s\S]*?order:\s*4/);
  assert.match(page, /application\/board-square/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
