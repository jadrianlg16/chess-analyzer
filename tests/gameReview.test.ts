import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { reviewGame } from "../src/lib/gameAnalysis";
import type { ReviewedMove } from "../src/lib/review";
import { fakeFactory } from "./fakeStockfish";

function line(...sans: string[]) {
  const game = new Chess();
  const root = game.fen();
  const moves: ReviewedMove[] = sans.map((san, index) => {
    const parentFen = game.fen();
    const made = game.move(san);
    return { id: `m${index}`, color: made.color, uci: made.lan, fen: game.fen(), parentFen };
  });
  return { root, moves };
}

describe("reviewGame", () => {
  const { root, moves } = line("Nf3", "e5");
  const [nf3, e5] = moves;

  it("clears a move that only looked bad from the search after it", async () => {
    const fake = fakeFactory(() => ({
      // Before Nf3 White is +0.30; after it the search thinks Black is +2.00 ...
      scoreFor: (fen) => (fen === root ? 30 : fen === nf3.fen ? 200 : -200),
      // ... but searching Nf3 itself from the start position says +0.25.
      scoreForMove: () => 25
    }));
    const progress: [number, number][] = [];

    const result = await reviewGame(moves, root, 1000, {
      createWorker: fake.create,
      onProgress: (done, total) => progress.push([done, total])
    });

    expect(result.review.moves[nf3.id].judgement).toBe("good");
    expect(result.review.moves[e5.id]).toBeDefined();
    expect(result.positions).toBe(3);
    // 3 positions + 1 second look at the one move that was flagged.
    expect(progress.at(-1)).toEqual([4, 4]);
    expect(fake.workers[0].received.some((command) => command.endsWith(`searchmoves ${nf3.uci}`))).toBe(true);
    expect(fake.workers[0].terminated).toBe(true);
  });

  it("keeps the flag when the second look agrees", async () => {
    const fake = fakeFactory(() => ({
      scoreFor: (fen) => (fen === root ? 30 : fen === nf3.fen ? 200 : -200),
      scoreForMove: () => -180
    }));

    const result = await reviewGame(moves, root, 1000, { createWorker: fake.create });

    expect(result.review.moves[nf3.id]).toMatchObject({ judgement: "blunder", bestSan: expect.any(String) });
    expect(result.review.white.blunders).toBe(1);
  });

  it("stops early when cancelled and reports it", async () => {
    const fake = fakeFactory(() => ({}));
    let checks = 0;

    const result = await reviewGame(moves, root, 1000, {
      createWorker: fake.create,
      isCancelled: () => ++checks > 1
    });

    expect(result.cancelled).toBe(true);
    expect(result.evals.size).toBe(1);
    expect(Object.keys(result.review.moves)).toHaveLength(0);
  });
});
