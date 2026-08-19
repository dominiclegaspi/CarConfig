import { useState } from "react";
import type { ScoredVehicle, Preferences } from "../types";
import { ScoreBar } from "./ScoreBar";
import { fetchListings, type ListingLink } from "../api";

const MEDALS = ["🥇", "🥈", "🥉"];

export function ResultCard({
  sv,
  rank,
  preferences,
  compareChecked,
  onToggleCompare,
  compareDisabled,
}: {
  sv: ScoredVehicle;
  rank: number;
  preferences: Preferences;
  compareChecked: boolean;
  onToggleCompare: () => void;
  compareDisabled: boolean;
}) {
  const [expanded, setExpanded] = useState(rank === 0);
  const [listings, setListings] = useState<ListingLink[] | null>(null);
  const [loadingListings, setLoadingListings] = useState(false);
  const v = sv.vehicle;

  async function loadListings() {
    if (listings || loadingListings) return;
    setLoadingListings(true);
    try {
      const links = await fetchListings(v.id, preferences.zip, preferences.radiusMiles, preferences.budgetMax, preferences.condition);
      setListings(links);
    } finally {
      setLoadingListings(false);
    }
  }

  return (
    <div className="result-card">
      <div className="result-card-header">
        <div className="result-card-title">
          {rank < 3 && <span className="medal">{MEDALS[rank]}</span>}
          <div>
            <h3>
              {v.year} {v.make} {v.model}
            </h3>
            <p className="result-card-price">
              ${v.priceMin.toLocaleString()}&ndash;${v.priceMax.toLocaleString()} &middot; {v.bodyType} &middot; {v.fuelType}
            </p>
          </div>
        </div>
        <div className="match-score">
          <div className="match-score-ring">{Math.round(sv.matchScore)}</div>
          <span>match</span>
        </div>
      </div>

      <ul className="reasons-list">
        {sv.reasons.map((r, i) => (
          <li key={i}>✓ {r}</li>
        ))}
        {sv.tradeoffs.map((t, i) => (
          <li key={`t${i}`} className="tradeoff">△ {t}</li>
        ))}
      </ul>

      <button className="link-button" onClick={() => setExpanded((e) => !e)} type="button">
        {expanded ? "Hide score breakdown" : "Show score breakdown"}
      </button>

      {expanded && (
        <div className="score-grid">
          <ScoreBar label="Performance" value={sv.subScores.performance} />
          <ScoreBar label="Reliability" value={sv.subScores.reliability} />
          <ScoreBar label="Efficiency" value={sv.subScores.efficiency} />
          <ScoreBar label="Cargo/space" value={sv.subScores.cargoSpace} />
          <ScoreBar label="Safety" value={sv.subScores.safety} />
          <ScoreBar label="Technology" value={sv.subScores.technology} />
          <ScoreBar label="Comfort" value={sv.subScores.comfort} />
          <ScoreBar label="Value" value={sv.subScores.value} />
        </div>
      )}

      <div className="ownership-line">
        Est. cost to own: <strong>${sv.ownership.estTotalPerYear.toLocaleString()}/yr</strong>
        <span className="ownership-breakdown">
          {" "}
          (fuel/energy ${sv.ownership.estFuelCostPerYear.toLocaleString()}, maintenance $
          {sv.ownership.estMaintenancePerYear.toLocaleString()}, insurance $
          {sv.ownership.estInsurancePerYear.toLocaleString()})
        </span>
      </div>

      <div className="result-card-actions">
        <label className="compare-toggle">
          <input type="checkbox" checked={compareChecked} disabled={compareDisabled && !compareChecked} onChange={onToggleCompare} />
          Compare
        </label>
        <button className="btn btn-secondary sm" onClick={loadListings} type="button">
          {loadingListings ? "Loading…" : "See available listings"}
        </button>
      </div>

      {listings && (
        <div className="listing-links">
          {listings.map((l) => (
            <a key={l.site} href={l.url} target="_blank" rel="noopener noreferrer">
              {l.label} ↗
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
