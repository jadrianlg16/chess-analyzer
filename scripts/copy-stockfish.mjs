import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const sourceDir = join(root, "node_modules", "stockfish", "bin");
const targetDir = join(root, "public", "vendor", "stockfish");

mkdirSync(targetDir, { recursive: true });

for (const file of ["stockfish-18-lite-single.js", "stockfish-18-lite-single.wasm"]) {
  copyFileSync(join(sourceDir, file), join(targetDir, file));
}

// Stockfish is GPL-3.0, so its license text ships next to the engine files
// (and from there into every build, Docker image and the portfolio demo).
copyFileSync(join(root, "node_modules", "stockfish", "Copying.txt"), join(targetDir, "LICENSE"));
