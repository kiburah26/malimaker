"use client";

import { useMemo, useState } from "react";
import { useLoaded } from "@/lib/data";
import { kesShort } from "@/lib/format";
import type { Slice } from "@/lib/types";

/**
 * Envelope chooser: the ones you use most as chips, everything else one tap away,
 * grouped the way the Envelopes screen is.
 */
export function EnvelopePicker({
  value,
  onChange,
  slices,
  exclude,
  label = "From envelope",
}: {
  value: string | null;
  onChange: (id: string) => void;
  /** Limit to these slices (e.g. spending only). */
  slices?: Slice[];
  exclude?: string;
  label?: string;
}) {
  const m = useLoaded()!;
  const [all, setAll] = useState(false);
  const { envelopes, groups, txns } = m.raw;
  const { stats, groupById } = m.derived;

  const usable = useMemo(
    () =>
      envelopes.filter((e) => {
        if (e.archived || e.id === exclude) return false;
        const g = groupById.get(e.group_id);
        return g && (!slices || slices.includes(g.slice));
      }),
    [envelopes, groupById, slices, exclude],
  );

  const recent = useMemo(() => {
    const seen: string[] = [];
    for (const t of txns) {
      if (t.kind !== "expense" || !t.envelope_id || seen.includes(t.envelope_id)) continue;
      if (usable.some((e) => e.id === t.envelope_id)) seen.push(t.envelope_id);
      if (seen.length >= 6) break;
    }
    for (const name of ["Weekly", "Fare", "Night out", "Ordering out", "Airtime & bundles", "Food shopping"]) {
      if (seen.length >= 6) break;
      const e = usable.find((x) => x.name === name);
      if (e && !seen.includes(e.id)) seen.push(e.id);
    }
    if (value && !seen.includes(value)) seen.unshift(value);
    return seen.map((id) => usable.find((e) => e.id === id)!).filter(Boolean);
  }, [txns, usable, value]);

  const chip = (id: string, name: string, emoji: string) => {
    const bal = stats.get(id)?.balance ?? 0;
    return (
      <button
        key={id}
        type="button"
        aria-pressed={value === id}
        onClick={() => {
          onChange(id);
          setAll(false);
        }}
        className="chip"
      >
        <span aria-hidden>{emoji}</span>
        {name}
        <span className={`num text-[12px] font-semibold ${bal < 0 ? "text-over" : "opacity-70"}`}>{kesShort(bal)}</span>
      </button>
    );
  };

  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-2">
        {recent.map((e) => chip(e.id, e.name, groupById.get(e.group_id)?.emoji ?? ""))}
        <button type="button" className="chip text-ink-soft" onClick={() => setAll((v) => !v)} aria-expanded={all}>
          {all ? "Fewer" : "All envelopes…"}
        </button>
      </div>
      {all && (
        <div className="mt-3 space-y-3 rounded-2xl bg-sunk p-3">
          {groups
            .filter((g) => usable.some((e) => e.group_id === g.id))
            .map((g) => (
              <div key={g.id}>
                <p className="mb-1.5 text-[13px] font-semibold text-ink-faint">
                  {g.emoji} {g.name}
                </p>
                <div className="flex flex-wrap gap-2">
                  {usable.filter((e) => e.group_id === g.id).map((e) => chip(e.id, e.name, ""))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
