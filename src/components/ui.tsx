"use client";

import { kes } from "@/lib/format";

export type Tone = "gold" | "good" | "over" | "warn" | "tier-1" | "tier-2" | "tier-3" | "soft";

const toneVar = (t: Tone) => (t === "soft" ? "var(--ink-faint)" : `var(--${t})`);

/** A thin progress bar. value/max are clamped; over-max shows full in the "over" tone. */
export function Bar({ value, max, tone = "gold", label }: { value: number; max: number; tone?: Tone; label?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div
      className="bar"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(Math.max(0, value))}
    >
      <span style={{ width: `${pct * 100}%`, background: toneVar(tone) }} />
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-full bg-sunk p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-10 flex-1 rounded-full px-2 text-[14px] font-bold ${
            value === o.value ? "bg-raised text-ink shadow" : "text-ink-soft"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Loading() {
  return (
    <div className="space-y-3 pt-4" aria-busy="true" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <div key={i} className="card h-24 animate-pulse opacity-60" />
      ))}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-end justify-between gap-3">
      <h2 className="font-display text-xl">{children}</h2>
      {action}
    </div>
  );
}

/** "1,350 left" / "450 over" for an envelope's available money. */
export function LeftLabel({ amount, className = "" }: { amount: number; className?: string }) {
  const over = amount < 0;
  return (
    <span className={`num font-bold ${over ? "text-over" : ""} ${className}`}>
      {over ? `${kes(-amount)} over` : `${kes(amount)} left`}
    </span>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3">
      <span>
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block text-[13px] text-ink-faint">{hint}</span>}
      </span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className="relative h-7 w-12 shrink-0 rounded-full bg-sunk ring-1 ring-[var(--rule-strong)] transition peer-checked:bg-[var(--gold)] peer-focus-visible:outline peer-focus-visible:outline-2 after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-[var(--ink-soft)] after:transition peer-checked:after:translate-x-5 peer-checked:after:bg-[var(--on-accent)]"
      />
    </label>
  );
}
