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
  assert.match(html, /双方必须各有且只有一个王/);
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
  assert.match(page, /new Chess\(boardToFen\(board, turn\)\)/);
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
  assert.match(page, /放回棋子库/);
  assert.match(page, /application\/board-square/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
