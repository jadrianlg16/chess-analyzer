import { chmodSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const sourceDir = join(root, "node_modules", "stockfish", "bin");
const targetDir = join(root, "public", "vendor", "stockfish");

// The npm package ships the .wasm as executable (0755). The copies are plain
// data files, and on Linux and macOS git would otherwise report a mode change.
function copy(from, to) {
  copyFileSync(from, to);
  chmodSync(to, 0o644);
}

mkdirSync(targetDir, { recursive: true });

for (const file of ["stockfish-18-lite-single.js", "stockfish-18-lite-single.wasm"]) {
  copy(join(sourceDir, file), join(targetDir, file));
}

// Stockfish is GPL-3.0, so its license text ships next to the engine files
// (and from there into every build, Docker image and the portfolio demo).
copy(join(root, "node_modules", "stockfish", "Copying.txt"), join(targetDir, "LICENSE"));
