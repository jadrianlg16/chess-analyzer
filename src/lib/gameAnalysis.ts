import { ENGINE_PATH, parseInfoLine, type EngineScore } from "./analysis";

/**
 * A single-position evaluator used for the "analyze whole game" pass. It owns a
 * dedicated Stockfish worker so it never interferes with the live analysis
 * engine, and resolves each position once the engine returns `bestmove`.
 */
class GameEvaluator {
  private worker: Worker | null = null;

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(ENGINE_PATH);
      this.worker.postMessage("uci");
      this.worker.postMessage("setoption name MultiPV value 1");
    }
    return this.worker;
  }

  evaluate(fen: string, depth: number): Promise<EngineScore | null> {
    const worker = this.ensureWorker();
    return new Promise((resolve) => {
      let last: EngineScore | null = null;
      const onMessage = (event: MessageEvent) => {
        const message = String(event.data);
        const parsed = parseInfoLine(message, fen);
        if (parsed && parsed.multipv === 1) last = parsed.score;
        if (message.startsWith("bestmove")) {
          worker.removeEventListener("message", onMessage);
          resolve(last);
        }
      };
      worker.addEventListener("message", onMessage);
      worker.postMessage("stop");
      worker.postMessage("ucinewgame");
      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(`go depth ${depth}`);
    });
  }

  dispose() {
    if (!this.worker) return;
    try {
      this.worker.postMessage("quit");
    } catch {
      /* worker may already be gone */
    }
    this.worker.terminate();
    this.worker = null;
  }
}

/**
 * Evaluate a list of unique FENs sequentially, reporting progress. Honours a
 * cancellation check between positions so the user can stop a long pass.
 */
export async function evaluateFens(
  fens: string[],
  depth: number,
  onProgress?: (done: number, total: number) => void,
  isCancelled?: () => boolean
): Promise<Map<string, EngineScore>> {
  const evaluator = new GameEvaluator();
  const map = new Map<string, EngineScore>();

  try {
    for (let index = 0; index < fens.length; index += 1) {
      if (isCancelled?.()) break;
      const score = await evaluator.evaluate(fens[index], depth);
      if (score) map.set(fens[index], score);
      onProgress?.(index + 1, fens.length);
    }
  } finally {
    evaluator.dispose();
  }

  return map;
}
