export type PieceTheme = "modern" | "line" | "native";
export type BoardTheme = "tournament" | "walnut" | "ocean" | "slate" | "midnight" | "coral";

export type ThemeOption<T extends string> = {
  id: T;
  label: string;
  description: string;
};

export const pieceThemeIds: PieceTheme[] = ["modern", "line", "native"];
export const boardThemeIds: BoardTheme[] = [
  "tournament",
  "walnut",
  "ocean",
  "slate",
  "midnight",
  "coral"
];

/** Migrate older persisted ids to the current set. */
export function normalizePieceTheme(value: string | null): PieceTheme {
  switch (value) {
    case "modern":
    case "line":
    case "native":
      return value;
    case "neo":
    case "classic":
      return "modern";
    case "glass":
      return "line";
    case "minimal":
      return "native";
    default:
      return "modern";
  }
}

export function normalizeBoardTheme(value: string | null): BoardTheme {
  return boardThemeIds.includes(value as BoardTheme) ? (value as BoardTheme) : "tournament";
}

export const pieceThemes: ThemeOption<PieceTheme>[] = [
  {
    id: "modern",
    label: "Modern",
    description: "Crisp filled vector pieces"
  },
  {
    id: "line",
    label: "Line",
    description: "Minimal outline pieces"
  },
  {
    id: "native",
    label: "Native",
    description: "System Unicode glyphs"
  }
];

export const boardThemes: ThemeOption<BoardTheme>[] = [
  {
    id: "tournament",
    label: "Tournament",
    description: "Green and ivory"
  },
  {
    id: "walnut",
    label: "Walnut",
    description: "Warm wooden board"
  },
  {
    id: "ocean",
    label: "Ocean",
    description: "Blue tournament board"
  },
  {
    id: "slate",
    label: "Slate",
    description: "Quiet high contrast"
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "Deep indigo night board"
  },
  {
    id: "coral",
    label: "Coral",
    description: "Warm sunset tones"
  }
];
