import assert from "node:assert/strict";
import test from "node:test";
import { Chess } from "chess.js";

function destinations(fen, square) {
  return new Chess(fen)
    .moves({ square, verbose: true })
    .map((move) => move.to);
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
