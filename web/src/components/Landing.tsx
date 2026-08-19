export function Landing({
  onStartWizard,
  onStartChat,
}: {
  onStartWizard: () => void;
  onStartChat: () => void;
}) {
  return (
    <div className="landing">
      <div className="landing-hero">
        <p className="eyebrow">Explainable vehicle recommendation engine</p>
        <h1>Find the car that actually fits you.</h1>
        <p className="lede">
          Answer a few questions (or just describe what you want), and a deterministic weighted-scoring
          engine ranks real vehicles against your priorities &mdash; with the exact reasoning behind every
          match, and real search links to live inventory near you.
        </p>
        <div className="landing-actions">
          <button className="btn btn-primary" onClick={onStartWizard}>
            Answer guided questions
          </button>
          <button className="btn btn-secondary" onClick={onStartChat}>
            Describe what you want
          </button>
        </div>
        <p className="landing-footnote">
          150 current-generation vehicles &middot; no account, no tracking, nothing sent to a paid API by default
        </p>
      </div>
    </div>
  );
}
