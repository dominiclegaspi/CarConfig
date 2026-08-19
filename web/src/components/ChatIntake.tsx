import { useState } from "react";
import type { Preferences } from "../types";
import { sendChatMessage } from "../api";

interface ChatIntakeProps {
  preferences: Preferences;
  onChange: (p: Preferences) => void;
  onFineTune: () => void;
  onSeeMatches: () => void;
  onBack: () => void;
}

interface Turn {
  role: "user" | "assistant";
  text: string;
  source?: string;
}

const EXAMPLE = "I'm a college student, drive about 12k miles a year, want something sporty but reliable, and don't want to spend more than $25k. No trucks.";

export function ChatIntake({ preferences, onChange, onFineTune, onSeeMatches, onBack }: ChatIntakeProps) {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([
    {
      role: "assistant",
      text: "Tell me what you're looking for in plain English — budget, how you'll use it, what you care about. I'll turn that into structured filters you can double-check before seeing matches.",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [hasExtracted, setHasExtracted] = useState(false);

  async function submit(text: string) {
    if (!text.trim() || loading) return;
    setTurns((t) => [...t, { role: "user", text }]);
    setInput("");
    setLoading(true);
    try {
      const res = await sendChatMessage(text, preferences);
      onChange({ ...preferences, ...res.preferences } as Preferences);
      setTurns((t) => [...t, { role: "assistant", text: res.assistantReply, source: res.source }]);
      setHasExtracted(true);
    } catch (err) {
      setTurns((t) => [...t, { role: "assistant", text: "Something went wrong reaching the parser — you can still continue and adjust filters manually." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-intake">
      <div className="chat-log">
        {turns.map((t, i) => (
          <div key={i} className={`chat-bubble ${t.role}`}>
            <p>{t.text}</p>
            {t.source && (
              <span className={`chat-source source-${t.source}`}>
                parsed via {t.source === "rules" ? "local rule-based parser" : t.source}
              </span>
            )}
          </div>
        ))}
        {loading && <div className="chat-bubble assistant loading">thinking…</div>}
      </div>

      <form
        className="chat-input-row"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <input
          type="text"
          value={input}
          placeholder={EXAMPLE}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="btn btn-primary" type="submit" disabled={loading}>
          Send
        </button>
      </form>

      {hasExtracted && (
        <div className="extracted-summary">
          <h3>Here's what I picked up so far</h3>
          <ul>
            <li>Budget: ${preferences.budgetMin.toLocaleString()} – ${preferences.budgetMax.toLocaleString()}</li>
            <li>Condition: {preferences.condition}</li>
            {preferences.bodyTypes.length > 0 && <li>Body types: {preferences.bodyTypes.join(", ")}</li>}
            {preferences.priorities.length > 0 && <li>Priorities: {preferences.priorities.join(", ")}</li>}
            {preferences.dealbreakers && <li>Avoiding: {preferences.dealbreakers}</li>}
          </ul>
          <p className="hint">You can fine-tune every one of these with the guided questions before seeing matches.</p>
        </div>
      )}

      <div className="wizard-nav">
        <button className="btn btn-ghost" onClick={onBack} type="button">
          Back
        </button>
        <button className="btn btn-secondary" onClick={onFineTune} type="button">
          Fine-tune with guided questions
        </button>
        <button className="btn btn-primary" onClick={onSeeMatches} type="button">
          See my matches
        </button>
      </div>
    </div>
  );
}
