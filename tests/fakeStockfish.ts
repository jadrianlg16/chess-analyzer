import { Chess } from "chess.js";
import type { WorkerLike } from "../src/lib/engine";

type Listener = (event: { data?: unknown; message?: string }) => void;

export type FakeOptions = {
  /** Score (cp, side to move's view) the fake reports for a position. */
  scoreFor?: (fen: string) => number;
  /** When false, a search only ends on `stop` (like `go infinite`). */
  autoFinish?: boolean;
  /** Crash as soon as the next search starts. */
  crashOnGo?: boolean;
  /** Never answer `stop` (a hung engine). */
  ignoreStop?: boolean;
};

/**
 * A scripted stand-in for the Stockfish worker. Like the real single-threaded
 * WASM build, it crashes when it receives anything other than `stop` or
 * `isready` while a search is running; `violations` records those commands.
 */
export class FakeStockfish implements WorkerLike {
  readonly received: string[] = [];
  readonly violations: string[] = [];
  terminated = false;
  crashed = false;
  goCount = 0;

  private readonly options: FakeOptions;
  private readonly listeners = { message: new Set<Listener>(), error: new Set<Listener>() };
  private inbox: string[] = [];
  private draining = false;
  private searching = false;
  private searchTimers: ReturnType<typeof setTimeout>[] = [];
  private fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  private multipv = 1;
  private pv: string[] = [];

  constructor(options: FakeOptions = {}) {
    this.options = options;
  }

  addEventListener(type: "message" | "error", listener: Listener): void {
    this.listeners[type].add(listener);
  }

  postMessage(command: string): void {
    this.received.push(command);
    if (this.terminated || this.crashed) return;
    this.inbox.push(command);
    if (!this.draining) {
      this.draining = true;
      setTimeout(() => this.drain(), 0);
    }
  }

  terminate(): void {
    this.terminated = true;
    this.clearSearch();
  }

  /** Crash from the outside, like a WASM `RuntimeError: unreachable`. */
  crash(message = "RuntimeError: unreachable"): void {
    if (this.crashed || this.terminated) return;
    this.crashed = true;
    this.clearSearch();
    for (const listener of this.listeners.error) listener({ message });
  }

  private drain() {
    while (this.inbox.length && !this.crashed && !this.terminated) {
      this.handle(this.inbox.shift()!);
    }
    this.draining = false;
  }

  private handle(command: string) {
    if (this.searching && command !== "stop" && command !== "isready") {
      this.violations.push(command);
      this.crash();
      return;
    }

    if (command === "uci") {
      this.emit("id name FakeStockfish");
      this.emit("uciok");
    } else if (command === "isready") {
      this.emit("readyok");
    } else if (command.startsWith("setoption name MultiPV value ")) {
      this.multipv = Number(command.split(" ").pop());
    } else if (command.startsWith("position fen ")) {
      this.fen = command.slice("position fen ".length).split(" moves ")[0];
    } else if (command.startsWith("go")) {
      this.startSearch();
    } else if (command === "stop") {
      if (this.searching && !this.options.ignoreStop) {
        this.clearSearch();
        this.searchTimers.push(setTimeout(() => this.finish(), 1));
      }
    }
  }

  private startSearch() {
    this.goCount += 1;
    this.searching = true;
    if (this.options.crashOnGo) {
      this.searchTimers.push(setTimeout(() => this.crash(), 1));
      return;
    }

    const moves = new Chess(this.fen).moves({ verbose: true }).map((move) => move.lan);
    this.pv = moves.slice(0, this.multipv);
    const cp = this.options.scoreFor?.(this.fen) ?? 25;
    for (let depth = 1; depth <= 3; depth += 1) {
      this.searchTimers.push(
        setTimeout(() => {
          this.pv.forEach((move, index) => {
            this.emit(
              `info depth ${depth} seldepth ${depth} multipv ${index + 1} score cp ${cp - index} nodes ${
                depth * 1000
              } nps 100000 pv ${move}`
            );
          });
        }, depth * 2)
      );
    }
    if (this.options.autoFinish !== false) {
      this.searchTimers.push(setTimeout(() => this.finish(), 8));
    }
  }

  private finish() {
    this.searching = false;
    this.emit(`bestmove ${this.pv[0] ?? "(none)"}`);
  }

  private clearSearch() {
    for (const timer of this.searchTimers) clearTimeout(timer);
    this.searchTimers = [];
  }

  private emit(line: string) {
    if (this.terminated || this.crashed) return;
    for (const listener of this.listeners.message) listener({ data: line });
  }
}

/** A worker factory that records every fake it creates. */
export function fakeFactory(optionsFor: (index: number) => FakeOptions = () => ({})) {
  const workers: FakeStockfish[] = [];
  const create = () => {
    const worker = new FakeStockfish(optionsFor(workers.length));
    workers.push(worker);
    return worker;
  };
  return { create, workers };
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll until `condition` holds; timer resolution varies a lot between machines. */
export async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await sleep(2);
  }
}
