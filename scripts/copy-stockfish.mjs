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
