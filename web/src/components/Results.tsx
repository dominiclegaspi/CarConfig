import { useState } from "react";
import type { RecommendResponse, Preferences, ScoredVehicle } from "../types";
import { ResultCard } from "./ResultCard";
import { CompareTable } from "./CompareTable";

export function Results({
  data,
  preferences,
  onEdit,
}: {
  data: RecommendResponse;
  preferences: Preferences;
  onEdit: () => void;
}) {
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  const toggleCompare = (id: string) => {
    setCompareIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : ids.length < 3 ? [...ids, id] : ids));
  };

  const compareItems: ScoredVehicle[] = data.results.filter((r) => compareIds.includes(r.vehicle.id));

  return (
    <div className="results">
      <div className="results-header">
        <div>
          <h2>Your top matches</h2>
          <p className="hint">
            Ranked {data.candidatesConsidered} candidates that passed your filters using a weighted, percentile-normalized
            scoring model built from your priorities.
          </p>
          {data.relaxedConstraints.length > 0 && (
            <div className="relaxed-note">
              {data.relaxedConstraints.map((r, i) => (
                <p key={i}>ℹ️ {r}</p>
              ))}
            </div>
          )}
        </div>
        <button className="btn btn-ghost" onClick={onEdit} type="button">
          Edit preferences
        </button>
      </div>

      {compareIds.length >= 2 && (
        <button className="btn btn-primary compare-cta" onClick={() => setShowCompare(true)} type="button">
          Compare {compareIds.length} selected →
        </button>
      )}

      <div className="results-list">
        {data.results.map((sv, i) => (
          <ResultCard
            key={sv.vehicle.id}
            sv={sv}
            rank={i}
            preferences={preferences}
            compareChecked={compareIds.includes(sv.vehicle.id)}
            onToggleCompare={() => toggleCompare(sv.vehicle.id)}
            compareDisabled={compareIds.length >= 3}
          />
        ))}
      </div>

      {showCompare && <CompareTable items={compareItems} onClose={() => setShowCompare(false)} />}
    </div>
  );
}
