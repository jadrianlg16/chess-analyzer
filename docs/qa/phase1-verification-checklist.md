# Phase 1 Verification Checklist

Owner: Agent C
Scope: focused verification for a React + TypeScript + Vite chess analyzer.
Status: scaffold-safe. Wire the todo tests in `tests/` after the app modules exist.

## Assumptions to Confirm

- FEN validation exposes a deterministic result, ideally `{ valid, errors, normalizedFen? }`.
- Setup mode can import a FEN, edit the board, edit side/castling/en-passant metadata, and export/apply the resulting FEN.
- Engine-output parsing accepts UCI-style output from a chess engine and separates `info` lines from `bestmove`.
- The browser smoke target is the Vite dev server at `http://127.0.0.1:5173/` unless the scaffold chooses another port.

## Automation Gates

Run these once the scaffold is available:

```powershell
npm install
npm run typecheck
npm test -- --run
npm run build
npm run dev -- --host 127.0.0.1
```

If `typecheck` or `test` scripts are not present yet, use `npx tsc --noEmit` and the chosen test runner equivalent.

## FEN Validation Coverage

- Accept standard start position with all six FEN fields.
- Accept valid no-castling positions with only kings and legal counters.
- Accept castling subsets when matching kings and rooks are on original squares.
- Accept legal en-passant targets on rank 3 or 6 when the side to move can plausibly capture.
- Reject missing or extra fields.
- Reject ranks that do not sum to eight files.
- Reject invalid piece symbols, side-to-move values, castling tokens, and en-passant squares.
- Reject negative halfmove clocks and fullmove number `0`.
- Reject semantic setup errors: missing kings, duplicate kings, adjacent kings, pawns on first/eighth rank, and impossible castling rights.
- Verify the UI reports field-specific errors instead of a single generic failure.

## Setup-Mode Flow Coverage

- Enter setup mode from the initial board without losing the current position.
- Import a valid FEN and confirm the board, side to move, castling rights, en-passant target, halfmove, and fullmove fields match.
- Attempt to apply an invalid FEN and confirm the app blocks the action, keeps prior board state, and displays actionable errors.
- Add, move, and remove pieces with pointer interactions and keyboard-accessible controls if provided.
- Toggle side to move and castling rights, then confirm the exported FEN changes immediately.
- Remove or move a king/rook and confirm impossible castling rights are cleared or flagged.
- Reset setup mode and confirm it returns to the expected baseline position.
- Apply a setup position into analysis mode and confirm the analyzer receives the exact exported FEN.

## Engine-Output Parsing Coverage

- Parse centipawn scores from `info ... score cp N ... pv ...`.
- Parse mate scores from `info ... score mate N ... pv ...`.
- Preserve the sign of scores exactly as emitted by the engine.
- Parse `multipv` lines and keep variations ordered by `multipv` index.
- Parse `bestmove` with and without `ponder`.
- Ignore non-analysis lines such as `id`, `option`, `readyok`, blank lines, and `info string`.
- Handle missing `pv`, `lowerbound`, and `upperbound` tokens without throwing.
- Report malformed analysis lines as recoverable parse warnings when possible.

## Browser Smoke Checks

- Page loads at the Vite dev server URL with no console errors.
- Main board is visible, has 64 squares, and is not visually collapsed.
- FEN input accepts the standard start position and surfaces validation state.
- Setup mode can be opened, edited, reset, and applied without navigation errors.
- Engine-output paste/import area accepts representative UCI text and renders at least one parsed line.
- Invalid FEN entry blocks apply/analyze actions and shows a visible error.
- The main workflow remains usable at desktop width around `1440x900` and mobile width around `390x844`.
- `npm run build` succeeds after the smoke flow.

## Files to Wire After Scaffold

- `tests/fixtures/fenCases.ts`: FEN fixtures for validator and setup-mode integration tests.
- `tests/fixtures/engineOutputCases.ts`: UCI engine-output fixtures for parser tests.
- `tests/phase1-verification.todo.test.ts`: Vitest-compatible todo skeleton and fixture quality checks.
