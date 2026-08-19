import { useState } from "react";
import type { Preferences, RecommendResponse } from "./types";
import { DEFAULT_PREFERENCES } from "./defaultPreferences";
import { fetchRecommendations } from "./api";
import { Landing } from "./components/Landing";
import { Wizard } from "./components/Wizard";
import { ChatIntake } from "./components/ChatIntake";
import { Results } from "./components/Results";

type Screen = "landing" | "wizard" | "chat" | "results";

export function App() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [results, setResults] = useState<RecommendResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRecommendations(preferences);
      setResults(data);
      setScreen("results");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <button className="brand" onClick={() => setScreen("landing")} type="button">
          🚗 CarConfig
        </button>
        {screen !== "landing" && (
          <span className="app-header-sub">
            {screen === "wizard" && "Guided questions"}
            {screen === "chat" && "Describe what you want"}
            {screen === "results" && "Your matches"}
          </span>
        )}
      </header>

      <main className="app-main">
        {screen === "landing" && (
          <Landing onStartWizard={() => setScreen("wizard")} onStartChat={() => setScreen("chat")} />
        )}

        {screen === "wizard" && (
          <Wizard
            preferences={preferences}
            onChange={setPreferences}
            onComplete={runSearch}
            onBack={() => setScreen("landing")}
          />
        )}

        {screen === "chat" && (
          <ChatIntake
            preferences={preferences}
            onChange={setPreferences}
            onFineTune={() => setScreen("wizard")}
            onSeeMatches={runSearch}
            onBack={() => setScreen("landing")}
          />
        )}

        {screen === "results" && results && (
          <Results data={results} preferences={preferences} onEdit={() => setScreen("wizard")} />
        )}

        {loading && (
          <div className="loading-overlay">
            <div className="spinner" />
            <p>Scoring candidates…</p>
          </div>
        )}
        {error && <div className="error-banner">{error}</div>}
      </main>
    </div>
  );
}
