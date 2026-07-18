import { AlertTriangle, Flag, Handshake, Swords } from "lucide-react";

export type GameStatus =
  | { type: "checkmate"; winner: "w" | "b" }
  | { type: "stalemate" }
  | { type: "draw"; reason: string }
  | { type: "check" };

type GameStatusBannerProps = {
  status: GameStatus;
};

export function GameStatusBanner({ status }: GameStatusBannerProps) {
  if (status.type === "check") {
    return (
      <div className="status-banner status-check" role="status">
        <AlertTriangle size={16} />
        <span>Check</span>
      </div>
    );
  }

  if (status.type === "checkmate") {
    const winner = status.winner === "w" ? "White" : "Black";
    return (
      <div className="status-banner status-mate" role="status">
        <Swords size={18} />
        <div>
          <strong>Checkmate</strong>
          <span>{winner} wins</span>
        </div>
      </div>
    );
  }

  if (status.type === "stalemate") {
    return (
      <div className="status-banner status-draw" role="status">
        <Flag size={18} />
        <div>
          <strong>Stalemate</strong>
          <span>Draw</span>
        </div>
      </div>
    );
  }

  return (
    <div className="status-banner status-draw" role="status">
      <Handshake size={18} />
      <div>
        <strong>Draw</strong>
        <span>{status.reason}</span>
      </div>
    </div>
  );
}
