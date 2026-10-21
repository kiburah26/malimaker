"use client";

import { useMemo, useState } from "react";
import { SplitBar } from "@/components/AddSheet";
import { Loading, SectionTitle } from "@/components/ui";
import { useLoaded, type Loaded } from "@/lib/data";
import { monthKey, monthlyTarget, monthsBetween, simulate } from "@/lib/engine";
import { fmtMonthShort, kes, parseAmount } from "@/lib/format";
import type { Slice, Split, SurplusSlice } from "@/lib/types";

const DEEL_FEE = 0.015;
const SURPLUS: { key: SurplusSlice; label: string }[] = [
  { key: "lifestyle", label: "Lifestyle" },
  { key: "sinking", label: "Sinking funds" },
  { key: "debt", label: "Debt" },
  { key: "emergency", label: "Emergency fund" },
  { key: "invest", label: "Investments" },
];
const ROWS: { key: Slice; label: string }[] = [
  { key: "tax", label: "Tax set-aside" },
  { key: "needs", label: "Needs" },
  ...SURPLUS,
];

export function PlanScreen() {
  const m = useLoaded();
  if (!m) return <Loading />;
  return <Plan key={m.raw.settings.user_id} m={m} />;
}

function Plan({ m }: { m: Loaded }) {
  const s = m.raw.settings;
  const [tax, setTax] = useState(String(s.tax_pct));
  const [split, setSplit] = useState<Record<SurplusSlice, string>>(
    Object.fromEntries(SURPLUS.map(({ key }) => [key, String(s.split[key] ?? 0)])) as Record<SurplusSlice, string>,
  );
  const [ppm, setPpm] = useState(String(s.paychecks_per_month));
  const [pay, setPay] = useState("2000");
  const [otherKes, setOtherKes] = useState("");
  const [busy, setBusy] = useState(false);

  const draft: Split = Object.fromEntries(SURPLUS.map(({ key }) => [key, Number(split[key]) || 0])) as Split;
  const sum = SURPLUS.reduce((t, { key }) => t + draft[key], 0);
  const draftSettings = { tax_pct: Number(tax) || 0, split: draft, paychecks_per_month: Math.max(1, Number(ppm) || 1) };
  const changed =
    draftSettings.tax_pct !== s.tax_pct ||
    draftSettings.paychecks_per_month !== s.paychecks_per_month ||
    SURPLUS.some(({ key }) => draft[key] !== (s.split[key] ?? 0));

  const monthlyKes = (parseAmount(pay) || 0) * (1 - DEEL_FEE) * s.usd_kes + (parseAmount(otherKes) || 0);
  const { envelopes, groups } = m.raw;
  const goalEnd = envelopes.filter((e) => e.goal_date && !e.archived).map((e) => e.goal_date!.slice(0, 7)).sort().pop();
  const months = Math.min(24, Math.max(3, goalEnd ? monthsBetween(monthKey(m.now), goalEnd) : 6));

  const sim = useMemo(
    () =>
      simulate({
        monthlyKes,
        months,
        taxable: true,
        settings: draftSettings,
        groups,
        envelopes,
        balances: new Map([...m.derived.stats].map(([id, st]) => [id, st.balance])),
        debtOwed: m.derived.debtOwed,
      }),
    // draftSettings is rebuilt each render from these inputs
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthlyKes, months, tax, ppm, JSON.stringify(draft), groups, envelopes, m.derived],
  );

  async function save() {
    if (sum !== 100) return;
    setBusy(true);
    const ok = await m.actions.saveSettings(draftSettings);
    setBusy(false);
    if (ok) m.say("Split saved. Your next income uses it.");
  }

  return (
    <div className="pt-2">
      <h1 className="font-display text-3xl">Plan</h1>
      <p className="mt-1 text-ink-soft">See the full picture before you set the numbers. Nothing here moves money.</p>

      <SectionTitle>If you&rsquo;re paid…</SectionTitle>
      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          {[1000, 1500, 2000, 2500, 3000].map((v) => (
            <button key={v} type="button" className="chip" aria-pressed={pay === String(v)} onClick={() => setPay(String(v))}>
              ${v.toLocaleString()}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Deel pay per month ($)</span>
            <input className="field num" inputMode="decimal" value={pay} onChange={(e) => setPay(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Other income (KES/mo)</span>
            <input className="field num" inputMode="decimal" placeholder="0" value={otherKes} onChange={(e) => setOtherKes(e.target.value)} />
          </label>
        </div>
        <p className="text-[13px] text-ink-faint">
          After Deel&rsquo;s ~1.5% fee at {s.usd_kes.toFixed(2)} KES/$: about <strong className="num text-ink">{kes(monthlyKes)}</strong> a month.
        </p>
      </div>

      <SectionTitle>…a month splits like this</SectionTitle>
      <div className="card p-4">
        <SplitBar bySlice={sim.monthly} total={Math.max(1, sim.monthly.income)} />
        <table className="mt-3 w-full text-[15px]">
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.key}>
                <td className="py-1">
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="h-3 w-3 rounded-sm" style={{ background: `var(--s-${r.key})` }} />
                    {r.label}
                  </span>
                </td>
                <td className="num py-1 text-right font-bold">{kes(sim.monthly[r.key])}</td>
                <td className="num w-14 py-1 text-right text-[13px] text-ink-faint">
                  {sim.monthly.income > 0 ? `${Math.round((sim.monthly[r.key] / sim.monthly.income) * 100)}%` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sim.monthly.short > 0 && (
          <p className="mt-3 text-[14px] font-semibold text-over">
            Your envelopes want {kes(sim.monthly.short)} more than this pays each month. Raise Lifestyle&rsquo;s %, or lower some targets below.
          </p>
        )}
      </div>

      <SectionTitle>Where you&rsquo;d be</SectionTitle>
      <div className="card p-4">
        <ul className="ruled">
          {sim.goals
            .filter((g) => g.envelope.goal_amount)
            .sort((a, b) => (a.envelope.goal_date ?? "9999").localeCompare(b.envelope.goal_date ?? "9999"))
            .map((g) => (
              <li key={g.envelope.id} className="flex items-baseline justify-between gap-3 py-2 text-[15px]">
                <span>
                  <span className="block font-semibold">{g.envelope.name}</span>
                  <span className="text-[13px] text-ink-faint">
                    goal {kes(g.envelope.goal_amount!)}
                    {g.envelope.goal_date && ` by ${fmtMonthShort(g.envelope.goal_date.slice(0, 7))}`}
                  </span>
                </span>
                <span className="text-right">
                  {g.reached ? (
                    <span
                      className={`font-bold ${g.envelope.goal_date && g.reached > g.envelope.goal_date.slice(0, 7) ? "text-over" : "text-good"}`}
                    >
                      {g.reached === monthKey(m.now) ? "Already there" : fmtMonthShort(g.reached)}
                    </span>
                  ) : (
                    <span className="num font-bold text-over">{kes(g.end)} by then</span>
                  )}
                </span>
              </li>
            ))}
          <li className="flex items-baseline justify-between gap-3 py-2 text-[15px]">
            <span className="font-semibold">All debt paid</span>
            <span className={`font-bold ${sim.debtFree ? "text-good" : "text-over"}`}>
              {sim.debtFree ? fmtMonthShort(sim.debtFree) : `${kes(sim.debtLeft)} left after ${months} months`}
            </span>
          </li>
        </ul>
        <p className="mt-2 text-[13px] text-ink-faint">
          Projection over {months} months at this pay, assuming Needs and Lifestyle are spent each month. Fill order for sinking funds is set on each envelope.
        </p>
      </div>

      <SectionTitle>Your split</SectionTitle>
      <div className="card space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Tax set-aside % (of taxable income, first)</span>
            <input className="field num" inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Paychecks per month</span>
            <input className="field num" inputMode="numeric" value={ppm} onChange={(e) => setPpm(e.target.value)} />
          </label>
        </div>
        <p className="text-[14px] text-ink-soft">Then Needs get their fixed amounts. What&rsquo;s left splits:</p>
        <div className="grid grid-cols-2 gap-3">
          {SURPLUS.map(({ key, label }) => (
            <label key={key} className="block">
              <span className="label">{label} %</span>
              <input
                className="field num"
                inputMode="decimal"
                value={split[key]}
                onChange={(e) => setSplit((x) => ({ ...x, [key]: e.target.value }))}
              />
            </label>
          ))}
          <div className={`flex flex-col justify-end pb-3 font-bold ${sum === 100 ? "text-good" : "text-over"}`}>
            Total {sum}%{sum !== 100 && " (needs to be 100)"}
          </div>
        </div>
        <button type="button" className="btn btn-primary w-full" disabled={!changed || sum !== 100 || busy} onClick={save}>
          {busy ? "Saving…" : changed ? "Save this split" : "Saved"}
        </button>
      </div>

      <Targets m={m} />
    </div>
  );
}

/** Edit every spending envelope's target in one place. */
function Targets({ m }: { m: Loaded }) {
  const { groups, envelopes } = m.raw;
  const spendGroups = groups.filter((g) => g.slice === "needs" || g.slice === "lifestyle");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const active = envelopes.filter((e) => !e.archived && spendGroups.some((g) => g.id === e.group_id));
  const valueOf = (id: string, fallback: number) => (vals[id] !== undefined ? parseAmount(vals[id]) || 0 : fallback);
  const tierTotal = (slice: Slice) =>
    active
      .filter((e) => groups.find((g) => g.id === e.group_id)?.slice === slice)
      .reduce((t, e) => t + monthlyTarget({ target: valueOf(e.id, e.target), period: e.period }), 0);
  const dirty = Object.entries(vals).filter(([id, v]) => (parseAmount(v) || 0) !== envelopes.find((e) => e.id === id)?.target);

  async function save() {
    setBusy(true);
    for (const [id, v] of dirty) await m.actions.saveEnvelope(id, { target: Math.max(0, parseAmount(v) || 0) });
    setBusy(false);
    setVals({});
    m.say("Targets saved");
  }

  return (
    <>
      <SectionTitle>Envelope targets</SectionTitle>
      <p className="mb-2 text-[14px] text-ink-soft">
        Needs {kes(tierTotal("needs"))}/month · Lifestyle {kes(tierTotal("lifestyle"))}/month. Change a number and the projection above updates once saved.
      </p>
      <div className="space-y-3">
        {spendGroups.map((g) => (
          <div key={g.id} className="card px-4 py-2">
            <p className="py-1 text-[14px] font-bold">
              {g.emoji} {g.name}
            </p>
            {active
              .filter((e) => e.group_id === g.id)
              .map((e) => (
                <label key={e.id} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="min-w-0 truncate">{e.name}</span>
                  <span className="flex items-center gap-2">
                    <input
                      className="field num w-28 text-right"
                      inputMode="decimal"
                      value={vals[e.id] ?? String(e.target)}
                      onChange={(ev) => setVals((x) => ({ ...x, [e.id]: ev.target.value }))}
                    />
                    <span className="w-10 text-[13px] text-ink-faint">/{e.period === "week" ? "wk" : "mo"}</span>
                  </span>
                </label>
              ))}
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-primary mt-4 w-full" disabled={dirty.length === 0 || busy} onClick={save}>
        {busy ? "Saving…" : dirty.length ? `Save ${dirty.length} target${dirty.length > 1 ? "s" : ""}` : "No changes"}
      </button>
    </>
  );
}
