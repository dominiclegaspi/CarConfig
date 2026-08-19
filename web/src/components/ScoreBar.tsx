export function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const tone = pct >= 75 ? "high" : pct >= 50 ? "mid" : "low";
  return (
    <div className="score-bar">
      <div className="score-bar-label">
        <span>{label}</span>
        <span className="score-bar-value">{Math.round(pct)}</span>
      </div>
      <div className="score-bar-track">
        <div className={`score-bar-fill tone-${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
