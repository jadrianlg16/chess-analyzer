type VariationBannerProps = {
  multipv: number;
  ply: number;
  total: number;
  playedSans: string[];
};

/** Shown above the board while an engine line is being previewed. */
export function VariationBanner({ multipv, ply, total, playedSans }: VariationBannerProps) {
  return (
    <div className="preview-banner">
      <div>
        <span>Previewing line {multipv}</span>
        <strong>
          {ply} / {total}
        </strong>
      </div>
      <p>{playedSans.join(" ") || "Current position"}</p>
    </div>
  );
}
