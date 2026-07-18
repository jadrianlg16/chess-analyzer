# Chess Analyzer

A chess analysis board where the engine runs **entirely in your browser** —
Stockfish 18 compiled to WebAssembly, no server, no account, no data leaving
your machine.

**▶ Try it live:** the real app is embedded at
[adriangaona.dev](https://adriangaona.dev) (Selected work → Chess Analyzer →
Launch app), or run it locally in one command below.

## What it does

- **Analysis board** — set up any position by dragging pieces, playing moves,
  or pasting a FEN; legality, promotion, and en-passant handled by a
  chess.js-backed domain layer.
- **Engine analysis** — evaluation bar, up to 3 principal variations
  (MultiPV), adjustable depth, best-move arrows. Score shown from White's
  perspective with mate-in-N detection.
- **Game review** — load a PGN, step through moves, and run whole-game
  analysis move by move.
- **Position tools** — FEN import/export with validation, side-to-move /
  castling / en-passant editing, board themes.

## Why in-browser Stockfish

The interesting constraint: the single-threaded `stockfish-18-lite-single`
WASM build needs no SharedArrayBuffer, which means **no COOP/COEP headers, no
cross-origin isolation** — the app can be embedded anywhere (it runs inside a
plain same-origin `<iframe>` on my portfolio). The engine speaks UCI over a
Web Worker; the adapter layer (`src/lib/stockfishAdapter.ts`) handles the
handshake, MultiPV parsing, and lifecycle so the UI never touches raw UCI.

## Architecture

```
src/
  lib/
    chessDomain.ts       FEN validation + move rules (chess.js under the hood)
    stockfishAdapter.ts  UCI worker adapter: init, MultiPV, snapshots, errors
    analysis.ts          High-level StockfishClient for the analysis panel
    gameAnalysis.ts      Whole-game (PGN) analysis driver
    gameTree.ts          Move tree / navigation
  components/            Board, eval bar, analysis panel, setup panel, …
  types/chess.ts         Shared domain + engine types
tests/                   Vitest: FEN cases, UCI parsing fixtures
scripts/copy-stockfish.mjs  Copies the WASM engine from node_modules → public/
```

Engine asset paths are `import.meta.env.BASE_URL`-aware, so the app builds
cleanly under any subpath (e.g. `--base=/demos/chess/`).

## Run it

```bash
npm install
npm run dev        # http://127.0.0.1:5173

# production build + serve (any static host works)
npm run build
npx vite preview

# or Docker (nginx)
docker build -t chess-analyzer .
docker run --rm -p 5016:80 chess-analyzer
```

## Test

```bash
npm test           # vitest: domain rules + engine-output parsing
```

## Stack

React 18 · TypeScript · Vite · chess.js · Stockfish 18 WASM (single-threaded
lite build via the [`stockfish`](https://www.npmjs.com/package/stockfish) npm
package)

---

Built by [Adrián Gaona](https://adriangaona.dev).
