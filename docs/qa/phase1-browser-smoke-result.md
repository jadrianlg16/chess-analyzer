# Phase 1 Browser Smoke Result

Target checked: `http://127.0.0.1:5175/`

The chess Vite dev server used port `5175` because ports `5173` and `5174` were already occupied by unrelated Vite processes from another workspace. The server was started directly with the local Vite binary to avoid running package hooks that may modify scaffold-owned files.

## Result

- HTTP status: `200`
- Page title: `Chess Analyzer`
- Console errors: `0`
- Visible content: `Chess Analyzer` and `Phase 1 shell is ready. Analyzer components are being integrated.`
- Board square candidates found: `0`
- Buttons found: `0`
- FEN or engine text inputs found: `0`

## Phase 1 Smoke Status

- App shell load: pass
- Console error check: pass
- Chess board visibility: blocked, board is not implemented yet
- FEN input flow: blocked, FEN input is not implemented yet
- Setup-mode flow: blocked, setup controls are not implemented yet
- Engine-output parsing UI: blocked, engine-output input/rendering is not implemented yet

## Notes

The in-app browser screenshot capture timed out twice, so no screenshot artifact was saved. Re-run the browser smoke checks from `docs/qa/phase1-verification-checklist.md` once the Phase 1 UI components are integrated.
