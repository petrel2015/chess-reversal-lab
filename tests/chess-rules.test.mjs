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

test("the standard preset contains all 32 pieces and castling rights", () => {
  const chess = new Chess();
  const pieces = chess.board().flat().filter(Boolean);
  assert.equal(pieces.length, 32);
  assert.equal(chess.turn(), "w");
  assert.match(chess.fen(), / w KQkq /);
});

test("undoing a turn removes the AI reply and the latest human move", () => {
  const chess = new Chess();
  chess.move("e4");
  chess.move("e5");

  let undone;
  do {
    undone = chess.undo();
  } while (undone && undone.color !== "w");

  assert.equal(chess.history().length, 0);
  assert.equal(chess.turn(), "w");
  assert.equal(chess.get("e2")?.type, "p");
});
