import type { Color, PieceSymbol } from "chess.js";
import type { Piece } from "../lib/chess-utils";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const pieceImages: Record<Color, Record<PieceSymbol, string>> = {
  w: {
    k: `${basePath}/chess-pieces/w-k.png`,
    q: `${basePath}/chess-pieces/w-q.png`,
    r: `${basePath}/chess-pieces/w-r.png`,
    b: `${basePath}/chess-pieces/w-b.png`,
    n: `${basePath}/chess-pieces/w-n.png`,
    p: `${basePath}/chess-pieces/w-p.png`,
  },
  b: {
    k: `${basePath}/chess-pieces/b-k.png`,
    q: `${basePath}/chess-pieces/b-q.png`,
    r: `${basePath}/chess-pieces/b-r.png`,
    b: `${basePath}/chess-pieces/b-b.png`,
    n: `${basePath}/chess-pieces/b-n.png`,
    p: `${basePath}/chess-pieces/b-p.png`,
  },
};

export function PieceArt({ piece, className }: { piece: Piece; className: string }) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={className}
      draggable={false}
      src={pieceImages[piece.color][piece.type]}
    />
  );
}
