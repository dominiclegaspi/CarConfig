import type { ScoredVehicle, SubScores } from "../types";

const ROWS: { key: keyof SubScores; label: string }[] = [
  { key: "performance", label: "Performance" },
  { key: "reliability", label: "Reliability" },
  { key: "efficiency", label: "Efficiency" },
  { key: "cargoSpace", label: "Cargo/space" },
  { key: "safety", label: "Safety" },
  { key: "technology", label: "Technology" },
  { key: "comfort", label: "Comfort" },
  { key: "luxury", label: "Luxury" },
  { key: "value", label: "Value" },
];

export function CompareTable({ items, onClose }: { items: ScoredVehicle[]; onClose: () => void }) {
  if (items.length < 2) return null;
  return (
    <div className="compare-overlay">
      <div className="compare-panel">
        <div className="compare-header">
          <h2>Side-by-side comparison</h2>
          <button className="btn btn-ghost sm" onClick={onClose} type="button">
            Close
          </button>
        </div>
        <div className="compare-table-wrap">
          <table className="compare-table">
            <thead>
              <tr>
                <th></th>
                {items.map((sv) => (
                  <th key={sv.vehicle.id}>
                    {sv.vehicle.make} {sv.vehicle.model}
                  </th>
                ))}
              </tr>
              <tr className="compare-match-row">
                <td>Match</td>
                {items.map((sv) => (
                  <td key={sv.vehicle.id}>
                    <strong>{Math.round(sv.matchScore)}</strong>
                  </td>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const values = items.map((sv) => sv.subScores[row.key]);
                const best = Math.max(...values);
                return (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    {items.map((sv) => (
                      <td key={sv.vehicle.id} className={sv.subScores[row.key] === best ? "best" : ""}>
                        {Math.round(sv.subScores[row.key])}
                      </td>
                    ))}
                  </tr>
                );
              })}
              <tr>
                <td>Price range</td>
                {items.map((sv) => (
                  <td key={sv.vehicle.id}>
                    ${sv.vehicle.priceMin.toLocaleString()}–${sv.vehicle.priceMax.toLocaleString()}
                  </td>
                ))}
              </tr>
              <tr>
                <td>Est. cost to own/yr</td>
                {items.map((sv) => (
                  <td key={sv.vehicle.id}>${sv.ownership.estTotalPerYear.toLocaleString()}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
