import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";

function destinations(fen, square) {
  return new Chess(fen)
    .moves({ square, verbose: true })
    .map((move) => move.to);
}

const pieceValue = { k: 0, q: 9, r: 5, b: 3, n: 3, p: 1 };

function materialDelta(chess) {
  const totals = { w: 0, b: 0 };
  chess.board().flat().filter(Boolean).forEach((piece) => {
    totals[piece.color] += pieceValue[piece.type];
  });
  const whiteLead = totals.w - totals.b;
  return { w: whiteLead, b: whiteLead === 0 ? 0 : -whiteLead };
}

test("white pawns cannot move toward a lower rank", () => {
  const moves = destinations("4k3/8/8/8/3P4/8/8/4K3 w - - 0 1", "d4");
  assert.ok(moves.includes("d5"));
  assert.ok(!moves.includes("d3"));
});

test("black pawns cannot move toward a higher rank", () => {
  const moves = destinations("4k3/8/8/3p4/8/8/8/4K3 b - - 0 1", "d5");
  assert.ok(moves.includes("d4"));
  assert.ok(!moves.includes("d6"));
});

test("the standard preset contains all 32 pieces and castling rights", () => {
  const chess = new Chess();
  const pieces = chess.board().flat().filter(Boolean);
  assert.equal(pieces.length, 32);
  assert.equal(chess.turn(), "w");
  assert.match(chess.fen(), / w KQkq /);
  assert.deepEqual(materialDelta(chess), { w: 0, b: 0 });
});

test("capturing a pawn shows equal and opposite material differences", () => {
  const chess = new Chess();
  chess.move("e4");
  chess.move("d5");
  chess.move("exd5");

  assert.deepEqual(materialDelta(chess), { w: 1, b: -1 });
});

test("undoing a turn removes the AI reply and the latest human move", () => {
  const chess = new Chess();
  chess.move("e4");
  chess.move("e5");

  const removed = [];
  let undone;
  do {
    undone = chess.undo();
    if (undone) removed.unshift(undone);
  } while (undone && undone.color !== "w");

  assert.equal(chess.history().length, 0);
  assert.equal(chess.turn(), "w");
  assert.equal(chess.get("e2")?.type, "p");

  removed.forEach((move) => {
    chess.move({ from: move.from, to: move.to, promotion: move.promotion });
  });
  assert.deepEqual(chess.history(), ["e4", "e5"]);
  assert.equal(chess.turn(), "w");
});
