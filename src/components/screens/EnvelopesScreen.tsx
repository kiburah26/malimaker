"use client";

import { useState } from "react";
import { EnvelopeRow, EnvelopeSheet } from "@/components/EnvelopeSheet";
import { Sheet } from "@/components/Sheet";
import { Loading } from "@/components/ui";
import { useLoaded, type Loaded } from "@/lib/data";
import { dayKey, monthlyTarget, planSweeps } from "@/lib/engine";
import { kes, parseAmount } from "@/lib/format";
import type { Group } from "@/lib/types";

const TIERS: { tier: 1 | 2 | 3; title: string; blurb: string; tone: string }[] = [
  { tier: 1, title: "Essentials", blurb: "Fixed amounts, filled first from every paycheck. Protected.", tone: "var(--tier-1)" },
  { tier: 2, title: "Building your future", blurb: "Tax, debt, emergency, investments and sinking funds. Protected.", tone: "var(--tier-2)" },
  { tier: 3, title: "Lifestyle", blurb: "For enjoying life. Capped; it shrinks first in a lean month.", tone: "var(--tier-3)" },
];

export function EnvelopesScreen() {
  const m = useLoaded();
  const [openEnv, setOpenEnv] = useState<string | null>(null);
  const [newIn, setNewIn] = useState<Group | null>(null);
  if (!m) return <Loading />;
  const { groups, envelopes } = m.raw;
  const { stats, rta } = m.derived;
  const active = envelopes.filter((e) => !e.archived);
  const total = (tier: number) =>
    active.filter((e) => groups.find((g) => g.id === e.group_id)?.tier === tier).reduce((s, e) => s + monthlyTarget(e), 0);

  return (
    <div className="pt-2">
      <h1 className="font-display text-3xl">Envelopes</h1>
      <p className="mt-1 text-ink-soft">What every shilling is for. Tap one to see it, move money, or edit it.</p>
      <div className="mt-3 flex flex-wrap gap-2 text-[14px]">
        <span className="chip">Ready to assign · <span className="num">{kes(rta)}</span></span>
        <span className="chip">Essentials · <span className="num">{kes(total(1))}</span>/mo</span>
        <span className="chip">Lifestyle · <span className="num">{kes(total(3))}</span>/mo</span>
      </div>

      <MonthEnd m={m} />

      {TIERS.map((t) => (
        <section key={t.tier} className="mt-6">
          <h2 className="font-display text-xl" style={{ color: t.tone }}>
            {t.title}
          </h2>
          <p className="mb-2 text-[14px] text-ink-faint">{t.blurb}</p>
          <div className="space-y-3">
            {groups
              .filter((g) => g.tier === t.tier)
              .map((g) => {
                const list = active.filter((e) => e.group_id === g.id);
                const sum = list.reduce((s, e) => s + (stats.get(e.id)?.balance ?? 0), 0);
                return (
                  <div key={g.id} className="card px-4 pt-3">
                    <div className="flex items-baseline justify-between">
                      <h3 className="font-bold">
                        <span aria-hidden>{g.emoji}</span> {g.name}
                      </h3>
                      <span className="num text-[14px] text-ink-faint">{kes(sum)}</span>
                    </div>
                    <div className="ruled">
                      {list.map((e) => (
                        <EnvelopeRow key={e.id} m={m} env={e} onOpen={setOpenEnv} />
                      ))}
                    </div>
                    <button type="button" className="mb-2 min-h-11 text-[14px] font-semibold text-ink-soft" onClick={() => setNewIn(g)}>
                      + Add envelope
                    </button>
                  </div>
                );
              })}
          </div>
        </section>
      ))}

      <EnvelopeSheet envelopeId={openEnv} onClose={() => setOpenEnv(null)} />
      <NewEnvelope m={m} group={newIn} onClose={() => setNewIn(null)} />
    </div>
  );
}

/** In the first days of a month, offer to move last month's leftovers (e.g. Night out → trip). */
function MonthEnd({ m }: { m: Loaded }) {
  const lines = planSweeps(m.raw.envelopes, m.derived.stats, m.raw.allocations);
  const early = Number(dayKey(m.now).slice(8)) <= 10;
  if (!early || lines.length === 0) return null;
  const moves = lines.filter((l) => l.amount > 0);
  return (
    <div className="card mt-4 p-4">
      <p className="font-bold">New month: move last month&rsquo;s leftovers?</p>
      <ul className="mt-1 text-[15px] text-ink-soft">
        {moves.map((l) => (
          <li key={l.envelope_id + l.note}>
            {l.note} → {m.derived.envById.get(l.envelope_id)?.name}: <span className="num font-bold text-ink">{kes(l.amount)}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-primary btn-small mt-3" onClick={async () => (await m.actions.runSweeps(lines)) && m.say("Leftovers moved")}>
        Move them
      </button>
    </div>
  );
}

function NewEnvelope({ m, group, onClose }: { m: Loaded; group: Group | null; onClose: () => void }) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [period, setPeriod] = useState<"month" | "week">("month");
  const [goal, setGoal] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const goalish = group && ["sinking", "emergency", "invest"].includes(group.slice);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!group || !name.trim()) return;
    setBusy(true);
    const ok = await m.actions.saveEnvelope(null, {
      group_id: group.id,
      name: name.trim(),
      target: parseAmount(target) || 0,
      period,
      goal_amount: parseAmount(goal) > 0 ? parseAmount(goal) : null,
      goal_date: date || null,
      priority: 99,
      protected: group.tier < 3,
      sort: 99,
    });
    setBusy(false);
    if (ok) {
      setName("");
      setTarget("");
      setGoal("");
      setDate("");
      onClose();
      m.say("Envelope added");
    }
  }

  return (
    <Sheet open={!!group} onClose={onClose} title={group ? `New in ${group.name}` : ""}>
      <form onSubmit={save} className="space-y-3">
        <label className="block">
          <span className="label">Name</span>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">{goalish ? "Steady amount" : "Target"}</span>
            <input className="field num" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0" />
          </label>
          <label className="block">
            <span className="label">Per</span>
            <select className="field" value={period} onChange={(e) => setPeriod(e.target.value as "month" | "week")}>
              <option value="month">Month</option>
              <option value="week">Week</option>
            </select>
          </label>
        </div>
        {goalish && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Goal amount</span>
              <input className="field num" inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} />
            </label>
            <label className="block">
              <span className="label">By</span>
              <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>
        )}
        <button className="btn btn-primary w-full" disabled={busy || !name.trim()}>
          {busy ? "Adding…" : "Add envelope"}
        </button>
      </form>
    </Sheet>
  );
}
