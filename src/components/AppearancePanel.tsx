import { Palette, Volume2, VolumeX } from "lucide-react";
import { boardThemes, pieceThemes, type BoardTheme, type PieceTheme } from "../lib/themes";
import { CollapsiblePanel } from "./CollapsiblePanel";
import { PieceIcon } from "./PieceIcon";

type AppearancePanelProps = {
  boardTheme: BoardTheme;
  pieceTheme: PieceTheme;
  soundOn: boolean;
  onBoardThemeChange: (theme: BoardTheme) => void;
  onPieceThemeChange: (theme: PieceTheme) => void;
  onSoundChange: (on: boolean) => void;
};

export function AppearancePanel({
  boardTheme,
  pieceTheme,
  soundOn,
  onBoardThemeChange,
  onPieceThemeChange,
  onSoundChange
}: AppearancePanelProps) {
  return (
    <CollapsiblePanel
      className="appearance-panel"
      eyebrow="Display"
      title="Appearance"
      defaultExpanded={false}
      actions={<Palette size={18} />}
    >
      <div className="theme-section">
        <span className="theme-label">Board</span>
        <div className="theme-grid">
          {boardThemes.map((theme) => (
            <button
              className={`theme-card board-swatch board-swatch-${theme.id} ${
                boardTheme === theme.id ? "active" : ""
              }`}
              key={theme.id}
              type="button"
              onClick={() => onBoardThemeChange(theme.id)}
            >
              <span className="theme-swatch" aria-hidden="true" />
              <strong>{theme.label}</strong>
              <small>{theme.description}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="theme-section">
        <span className="theme-label">Pieces</span>
        <div className="theme-grid">
          {pieceThemes.map((theme) => (
            <button
              className={`theme-card piece-swatch piece-theme-${theme.id} ${
                pieceTheme === theme.id ? "active" : ""
              }`}
              key={theme.id}
              type="button"
              onClick={() => onPieceThemeChange(theme.id)}
            >
              <span className="theme-piece-preview" aria-hidden="true">
                <PieceIcon piece={{ color: "w", type: "n" }} theme={theme.id} />
                <PieceIcon piece={{ color: "b", type: "k" }} theme={theme.id} />
              </span>
              <strong>{theme.label}</strong>
              <small>{theme.description}</small>
            </button>
          ))}
        </div>
      </div>

      <button
        className={`sound-toggle ${soundOn ? "active" : ""}`}
        type="button"
        onClick={() => onSoundChange(!soundOn)}
      >
        {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
        {soundOn ? "Move sounds on" : "Move sounds off"}
      </button>
    </CollapsiblePanel>
  );
}
