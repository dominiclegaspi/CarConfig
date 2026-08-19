import { useState } from "react";
import type { ReactNode } from "react";
import type { Preferences, PriorityKey } from "../types";
import {
  PRIORITY_OPTIONS,
  BODY_TYPE_OPTIONS,
  MILEAGE_OPTIONS,
  ENVIRONMENT_OPTIONS,
  DRIVETRAIN_OPTIONS,
  FUEL_OPTIONS,
  CONDITION_OPTIONS,
} from "../constants";

interface WizardProps {
  preferences: Preferences;
  onChange: (p: Preferences) => void;
  onComplete: () => void;
  onBack: () => void;
}

const TOTAL_STEPS = 9;

export function Wizard({ preferences, onChange, onComplete, onBack }: WizardProps) {
  const [step, setStep] = useState(0);

  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
    onChange({ ...preferences, [key]: value });

  const togglePriority = (key: PriorityKey) => {
    const exists = preferences.priorities.includes(key);
    const next = exists ? preferences.priorities.filter((p) => p !== key) : [...preferences.priorities, key];
    set("priorities", next);
  };

  const toggleBodyType = (key: string) => {
    const exists = preferences.bodyTypes.includes(key);
    const next = exists ? preferences.bodyTypes.filter((b) => b !== key) : [...preferences.bodyTypes, key];
    set("bodyTypes", next);
  };

  const next = () => (step < TOTAL_STEPS - 1 ? setStep(step + 1) : onComplete());
  const back = () => (step > 0 ? setStep(step - 1) : onBack());

  return (
    <div className="wizard">
      <div className="wizard-progress">
        <div className="wizard-progress-fill" style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }} />
      </div>
      <p className="wizard-step-count">
        Step {step + 1} of {TOTAL_STEPS}
      </p>

      {step === 0 && (
        <StepShell title="What's your budget?">
          <div className="budget-row">
            <label>
              Min
              <input
                type="number"
                value={preferences.budgetMin}
                min={0}
                step={500}
                onChange={(e) => set("budgetMin", Number(e.target.value))}
              />
            </label>
            <label>
              Max
              <input
                type="number"
                value={preferences.budgetMax}
                min={0}
                step={500}
                onChange={(e) => set("budgetMax", Number(e.target.value))}
              />
            </label>
          </div>
        </StepShell>
      )}

      {step === 1 && (
        <StepShell title="New, used, or either?">
          <ChipGroup
            options={CONDITION_OPTIONS}
            selected={[preferences.condition]}
            onToggle={(k) => set("condition", k as Preferences["condition"])}
            single
          />
        </StepShell>
      )}

      {step === 2 && (
        <StepShell title="What matters most to you?" subtitle="Pick as many as apply — order matters, first pick weighs most.">
          <div className="priority-grid">
            {PRIORITY_OPTIONS.map((opt) => {
              const rank = preferences.priorities.indexOf(opt.key);
              return (
                <button
                  key={opt.key}
                  className={`priority-card ${rank !== -1 ? "selected" : ""}`}
                  onClick={() => togglePriority(opt.key)}
                  type="button"
                >
                  {rank !== -1 && <span className="priority-rank">{rank + 1}</span>}
                  <strong>{opt.label}</strong>
                  <span>{opt.blurb}</span>
                </button>
              );
            })}
          </div>
        </StepShell>
      )}

      {step === 3 && (
        <StepShell title="How important is performance to you?" subtitle="1 = don't care at all, 10 = it's everything">
          <div className="slider-row">
            <input
              type="range"
              min={1}
              max={10}
              value={preferences.performanceImportance}
              onChange={(e) => set("performanceImportance", Number(e.target.value))}
            />
            <span className="slider-value">{preferences.performanceImportance}</span>
          </div>
        </StepShell>
      )}

      {step === 4 && (
        <StepShell title="How much do you drive?">
          <ChipGroup
            options={MILEAGE_OPTIONS}
            selected={[preferences.annualMileage]}
            onToggle={(k) => set("annualMileage", k as Preferences["annualMileage"])}
            single
          />
        </StepShell>
      )}

      {step === 5 && (
        <StepShell title="Where do you mostly drive?">
          <ChipGroup
            options={ENVIRONMENT_OPTIONS}
            selected={[preferences.environment]}
            onToggle={(k) => set("environment", k as Preferences["environment"])}
            single
          />
        </StepShell>
      )}

      {step === 6 && (
        <StepShell title="Drivetrain preference?">
          <ChipGroup
            options={DRIVETRAIN_OPTIONS}
            selected={[preferences.drivetrain]}
            onToggle={(k) => set("drivetrain", k as Preferences["drivetrain"])}
            single
          />
          <div className="spacer" />
          <h3 className="sub-question">Fuel type?</h3>
          <ChipGroup
            options={FUEL_OPTIONS}
            selected={[preferences.fuelType]}
            onToggle={(k) => set("fuelType", k as Preferences["fuelType"])}
            single
          />
        </StepShell>
      )}

      {step === 7 && (
        <StepShell title="Body type?" subtitle="Pick any that would work — leave blank for no preference.">
          <ChipGroup
            options={BODY_TYPE_OPTIONS}
            selected={preferences.bodyTypes}
            onToggle={toggleBodyType}
          />
          <div className="spacer" />
          <label className="inline-label">
            Minimum seats needed
            <input
              type="number"
              min={2}
              max={9}
              value={preferences.seatsMin}
              onChange={(e) => set("seatsMin", Number(e.target.value))}
            />
          </label>
        </StepShell>
      )}

      {step === 8 && (
        <StepShell title="Anything you absolutely don't want? And where should we search for real listings?">
          <label className="inline-label full">
            Dealbreakers
            <input
              type="text"
              placeholder="e.g. no trucks, not electric, no Ford"
              value={preferences.dealbreakers}
              onChange={(e) => set("dealbreakers", e.target.value)}
            />
          </label>
          <div className="budget-row">
            <label>
              ZIP code
              <input
                type="text"
                placeholder="e.g. 90210"
                value={preferences.zip}
                onChange={(e) => set("zip", e.target.value)}
              />
            </label>
            <label>
              Search radius (mi)
              <input
                type="number"
                min={10}
                max={500}
                step={10}
                value={preferences.radiusMiles}
                onChange={(e) => set("radiusMiles", Number(e.target.value))}
              />
            </label>
          </div>
          <p className="hint">ZIP is optional but unlocks real search links to live inventory in your results.</p>
        </StepShell>
      )}

      <div className="wizard-nav">
        <button className="btn btn-ghost" onClick={back} type="button">
          Back
        </button>
        <button className="btn btn-primary" onClick={next} type="button">
          {step === TOTAL_STEPS - 1 ? "See my matches" : "Next"}
        </button>
      </div>
    </div>
  );
}

function StepShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="wizard-step">
      <h2>{title}</h2>
      {subtitle && <p className="step-subtitle">{subtitle}</p>}
      {children}
    </div>
  );
}

function ChipGroup({
  options,
  selected,
  onToggle,
  single,
}: {
  options: { key: string; label: string }[];
  selected: string[];
  onToggle: (key: string) => void;
  single?: boolean;
}) {
  return (
    <div className="chip-group">
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          className={`chip ${selected.includes(opt.key) ? "selected" : ""}`}
          onClick={() => onToggle(opt.key)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
