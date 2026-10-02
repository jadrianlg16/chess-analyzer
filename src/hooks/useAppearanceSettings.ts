import { useEffect, useState } from "react";
import { readSetting, writeSetting } from "../lib/storage";
import { normalizeBoardTheme, normalizePieceTheme, type BoardTheme, type PieceTheme } from "../lib/themes";

const KEYS = {
  boardTheme: "chess-board-theme",
  pieceTheme: "chess-piece-theme",
  sound: "chess-sound"
} as const;

/** Board theme, piece set and move sounds, remembered between visits. */
export function useAppearanceSettings() {
  const [boardTheme, setBoardTheme] = useState<BoardTheme>(() => normalizeBoardTheme(readSetting(KEYS.boardTheme)));
  const [pieceTheme, setPieceTheme] = useState<PieceTheme>(() => normalizePieceTheme(readSetting(KEYS.pieceTheme)));
  const [soundOn, setSoundOn] = useState(() => readSetting(KEYS.sound) !== "off");

  // Writing on mount too stores ids migrated by normalize*Theme.
  useEffect(() => writeSetting(KEYS.boardTheme, boardTheme), [boardTheme]);
  useEffect(() => writeSetting(KEYS.pieceTheme, pieceTheme), [pieceTheme]);
  useEffect(() => writeSetting(KEYS.sound, soundOn ? "on" : "off"), [soundOn]);

  return { boardTheme, pieceTheme, soundOn, setBoardTheme, setPieceTheme, setSoundOn };
}
