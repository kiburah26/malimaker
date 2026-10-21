"use client";

import { useState } from "react";
import { useAdd } from "@/components/AppShell";
import { EnvelopeSheet } from "@/components/EnvelopeSheet";
import { Sheet } from "@/components/Sheet";
import { Bar, Loading, SectionTitle, Toggle } from "@/components/ui";
import { useLoaded, type Loaded } from "@/lib/data";
import { addMonths, dayKey, goalProgress, hasPaceHistory, monthKey, paceOf } from "@/lib/engine";
import { fmtDate, fmtMonthShort, kes, kesSigned, parseAmount } from "@/lib/format";
import type { Debt, Snapshot } from "@/lib/types";

export function GoalsScreen() {
  const m = useLoaded();
  const add = useAdd();
  const [openEnv, setOpenEnv] = useState<string | null>(null);
  const [editDebt, setEditDebt] = useState<Debt | "new" | null>(null);
  if (!m) return <Loading />;
  const { worth, debtBal, stats, sliceOf, debtOwed } = m.derived;
  const { debts, envelopes, allocations, snapshots, txns } = m.raw;

  const goalEnvs = envelopes.filter((e) => !e.archived && e.goal_amount);
  const order = ["emergency", "invest", "sinking"];
  goalEnvs.sort((a, b) => order.indexOf(sliceOf(a) ?? "") - order.indexOf(sliceOf(b) ?? "") || a.priority - b.priority);
  const taxEnv = envelopes.find((e) => !e.archived && sliceOf(e) === "tax");
  const debtEnv = envelopes.find((e) => !e.archived && sliceOf(e) === "debt");
  const debtReady = debtEnv ? stats.get(debtEnv.id)?.balance ?? 0 : 0;

  const open = debts.filter((d) => !d.closed).sort((a, b) => a.priority - b.priority);
  const closed = debts.filter((d) => d.closed);
  const borrowed = (d: Debt) => txns.filter((t) => t.debt_id === d.id && t.kind === "borrow").reduce((s, t) => s + t.amount, 0);
  // pace = money given to the Debt envelope per month, once there's a month of history
  const pace = debtEnv ? paceOf(allocations.filter((a) => a.envelope_id === debtEnv.id), allocations, m.now) ?? 0 : 0;
  const paceKnown = hasPaceHistory(allocations, m.now);
  const nextUp = open.find((d) => (debtBal.get(d.id) ?? 0) > 0);
  const mum = open.find((d) => /mum|mom/i.test(d.name));
  const owedExMum = debtOwed - (mum ? Math.max(0, debtBal.get(mum.id) ?? 0) : 0);
  const freeBy = (owed: number) => (pace > 0 ? addMonths(monthKey(m.now), Math.ceil(owed / pace)) : null);

  return (
    <div className="pt-2">
      <h1 className="font-display text-3xl">Goals</h1>
      <p className="mt-1 text-ink-soft">Your wealth-building progress: net worth, debt and every goal.</p>

      <div className="card mt-4 p-4">
        <p className="text-[14px] text-ink-soft">Net worth</p>
        <p className={`num font-display text-4xl ${worth.net < 0 ? "text-over" : "text-good"}`}>{kesSigned(worth.net)}</p>
        <p className="text-[14px] text-ink-faint">
          {kes(worth.assets)} you have − {kes(worth.liabilities)} you owe
        </p>
        <Trend snapshots={snapshots} />
        <p className="mt-2 text-[13px] text-ink-faint">Paying debt and saving both push this line up. Business money isn&rsquo;t counted.</p>
      </div>

      <SectionTitle action={<button type="button" className="text-[14px] font-semibold text-ink-soft underline" onClick={() => setEditDebt("new")}>+ Add debt</button>}>
        Debt-free
      </SectionTitle>
      <div className="card p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[13px] text-ink-soft">Everyone but Mum</p>
            <p className="num text-xl font-bold">{kes(owedExMum)}</p>
            <p className="text-[13px] text-ink-faint">{owedExMum <= 0 ? "Done 🎉" : freeBy(owedExMum) ? `on pace for ${fmtMonthShort(freeBy(owedExMum)!)}` : paceKnown ? "no debt money lately" : "a date appears after a month of income"}</p>
          </div>
          <div>
            <p className="text-[13px] text-ink-soft">All debt</p>
            <p className="num text-xl font-bold">{kes(debtOwed)}</p>
            <p className="text-[13px] text-ink-faint">{freeBy(debtOwed) ? `on pace for ${fmtMonthShort(freeBy(debtOwed)!)}` : "see Plan for projections"}</p>
          </div>
        </div>
        {debtEnv && (
          <div className="mt-3 rounded-2xl bg-sunk p-3 text-[15px]">
            <p>
              <strong className="num">{kes(debtReady)}</strong> is ready in Debt payments.
              {nextUp && debtReady >= 100 && (
                <>
                  {" "}
                  Next up: <strong>{nextUp.name}</strong>.
                </>
              )}
            </p>
            {nextUp && debtReady >= 100 && (
              <button
                type="button"
                className="btn btn-primary btn-small mt-2"
                onClick={() => add({ mode: "debt", debtMode: "pay", debtId: nextUp.id, amount: Math.round(Math.min(debtReady, debtBal.get(nextUp.id) ?? 0)) })}
              >
                Pay {nextUp.name} {kes(Math.min(debtReady, debtBal.get(nextUp.id) ?? 0))}
              </button>
            )}
          </div>
        )}
        <ul className="ruled mt-3">
          {open.map((d, i) => {
            const bal = debtBal.get(d.id) ?? 0;
            const start = d.opening_balance + borrowed(d);
            const overdue = d.due_date && d.due_date < dayKey(m.now);
            return (
              <li key={d.id} className="py-3">
                <button type="button" className="block w-full text-left" onClick={() => setEditDebt(d)}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">
                      <span className="mr-1.5 text-ink-faint">{i + 1}.</span>
                      {d.name}
                    </span>
                    <span className="num font-bold">{kes(bal)}</span>
                  </div>
                  <div className="mt-1.5">
                    <Bar value={start - bal} max={start} tone="good" label={`${d.name} paid`} />
                  </div>
                  <p className="mt-1 text-[13px] text-ink-faint">
                    {start > 0 ? `${Math.round(((start - bal) / start) * 100)}% paid` : ""}
                    {d.interest > 0 && ` · includes ${kes(d.interest)} interest`}
                    {d.installment && ` · ${kes(d.installment)}/instalment`}
                    {d.due_date && (overdue ? ` · was due ${fmtDate(d.due_date)}` : ` · due ${fmtDate(d.due_date)}`)}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
        {closed.length > 0 && <p className="mt-2 text-[13px] text-ink-faint">Paid off: {closed.map((d) => d.name).join(", ")} 🎉</p>}
      </div>

      <SectionTitle>Savings goals</SectionTitle>
      <div className="space-y-3">
        {goalEnvs.map((e) => {
          const g = goalProgress(e, stats.get(e.id), allocations);
          return (
            <button key={e.id} type="button" onClick={() => setOpenEnv(e.id)} className="card block w-full p-4 text-left">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-bold">{e.name}</span>
                <span className="num font-bold">{Math.round(g.pct * 100)}%</span>
              </div>
              <div className="my-2">
                <Bar value={g.saved} max={g.goal} tone="good" label={`${e.name} progress`} />
              </div>
              <p className="num text-[14px]">
                {kes(g.saved)} <span className="text-ink-faint">of {kes(g.goal)}</span>
                {e.goal_date && <span className="text-ink-faint"> · by {fmtDate(e.goal_date)}</span>}
              </p>
              {g.pct < 1 && g.neededPerMonth !== null && (
                <p className={`mt-1 text-[13px] font-semibold ${g.onTrack ? "text-good" : "text-ink-soft"}`}>
                  {g.onTrack ? "On track ✓ " : g.onTrack === false ? "Behind pace · " : ""}
                  needs {kes(g.neededPerMonth)}/month
                  {g.onTrack !== null && g.pacePerMonth > 0 && ` · recent pace ${kes(g.pacePerMonth)}/month`}
                  {g.projectedMonth && g.pacePerMonth > 0 && ` · reaches it ${fmtMonthShort(g.projectedMonth)}`}
                </p>
              )}
              {g.pct >= 1 && <p className="mt-1 text-[13px] font-semibold text-good">Reached 🎉</p>}
            </button>
          );
        })}
      </div>

      {taxEnv && (
        <div className="card mt-3 p-4">
          <p className="font-bold">🧾 Tax set aside</p>
          <p className="num font-display text-2xl">{kes(stats.get(taxEnv.id)?.balance ?? 0)}</p>
          <p className="text-[13px] text-ink-faint">
            {m.raw.settings.tax_fixed != null
              ? `${kes(m.raw.settings.tax_fixed)} a month while you clear debt, kept for filing. Change it on the Plan screen.`
              : `${m.raw.settings.tax_pct}% of taxable income, kept for filing. Change it on the Plan screen.`}
          </p>
        </div>
      )}

      <EnvelopeSheet envelopeId={openEnv} onClose={() => setOpenEnv(null)} />
      <DebtSheet m={m} target={editDebt} onClose={() => setEditDebt(null)} />
    </div>
  );
}

/** Net-worth line: one series, 2px, hover/tap a point to read it. */
function Trend({ snapshots }: { snapshots: Snapshot[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (snapshots.length < 2) {
    return <p className="mt-3 text-[13px] text-ink-faint">The trend line starts after a couple of days of use.</p>;
  }
  const pts = snapshots.map((s) => ({ day: s.day, v: s.assets - s.liabilities }));
  const W = 320;
  const H = 90;
  const vals = pts.map((p) => p.v);
  const lo = Math.min(...vals, 0);
  const hi = Math.max(...vals, 0);
  const span = hi - lo || 1;
  const x = (i: number) => 6 + (i / (pts.length - 1)) * (W - 12);
  const y = (v: number) => 8 + (1 - (v - lo) / span) * (H - 16);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  const h = hover ?? pts.length - 1;
  return (
    <div className="mt-3">
      <p className="num text-[13px] text-ink-soft">
        {fmtDate(pts[h].day)}: <strong className="text-ink">{kesSigned(pts[h].v)}</strong>
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-1 h-24 w-full touch-none"
        role="img"
        aria-label={`Net worth from ${kesSigned(pts[0].v)} to ${kesSigned(pts[pts.length - 1].v)}`}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.round(((e.clientX - r.left) / r.width) * (pts.length - 1));
          setHover(Math.max(0, Math.min(pts.length - 1, i)));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--rule-strong)" strokeDasharray="3 4" />
        <path d={d} fill="none" stroke="var(--good)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <line x1={x(h)} x2={x(h)} y1="0" y2={H} stroke="var(--rule-strong)" />
        <circle cx={x(h)} cy={y(pts[h].v)} r="4.5" fill="var(--good)" stroke="var(--bg-raised)" strokeWidth="2" />
      </svg>
    </div>
  );
}

function DebtSheet({ m, target, onClose }: { m: Loaded; target: Debt | "new" | null; onClose: () => void }) {
  const d = target && target !== "new" ? target : null;
  return (
    <Sheet open={!!target} onClose={onClose} title={d ? d.name : "New debt"}>
      {target && <DebtForm key={d?.id ?? "new"} m={m} d={d} onClose={onClose} />}
    </Sheet>
  );
}

function DebtForm({ m, d, onClose }: { m: Loaded; d: Debt | null; onClose: () => void }) {
  const add = useAdd();
  const [f, setF] = useState({
    name: d?.name ?? "",
    opening_balance: d ? String(d.opening_balance) : "",
    interest: d ? String(d.interest) : "0",
    due_date: d?.due_date ?? "",
    installment: d?.installment ? String(d.installment) : "",
    priority: d ? String(d.priority) : String((m.raw.debts.reduce((x, y) => Math.max(x, y.priority), 0) ?? 0) + 1),
    note: d?.note ?? "",
    closed: d?.closed ?? false,
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const bal = d ? m.derived.debtBal.get(d.id) ?? 0 : 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await m.actions.saveDebt(d?.id ?? null, {
      name: f.name.trim() || "Debt",
      opening_balance: Math.max(0, parseAmount(f.opening_balance) || 0),
      interest: Math.max(0, parseAmount(f.interest) || 0),
      due_date: f.due_date || null,
      installment: parseAmount(f.installment) > 0 ? parseAmount(f.installment) : null,
      priority: Number(f.priority) || 0,
      note: f.note.trim() || null,
      closed: f.closed,
    });
    setBusy(false);
    if (ok) {
      m.say("Saved");
      onClose();
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      {d && (
        <div className="rounded-2xl bg-sunk p-4">
          <p className="text-[14px] text-ink-soft">Still owed</p>
          <p className="num font-display text-3xl">{kes(bal)}</p>
          <button
            type="button"
            className="btn btn-primary btn-small mt-2"
            onClick={() => {
              onClose();
              add({ mode: "debt", debtMode: "pay", debtId: d.id });
            }}
          >
            Log a payment
          </button>
        </div>
      )}
      <label className="block">
        <span className="label">Owed to</span>
        <input className="field" value={f.name} onChange={(e) => set("name", e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label">{d ? "Balance when added" : "Owed today"}</span>
          <input className="field num" inputMode="decimal" value={f.opening_balance} onChange={(e) => set("opening_balance", e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Fixed interest in it</span>
          <input className="field num" inputMode="decimal" value={f.interest} onChange={(e) => set("interest", e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Due date</span>
          <input type="date" className="field" value={f.due_date} onChange={(e) => set("due_date", e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Instalment</span>
          <input className="field num" inputMode="decimal" value={f.installment} onChange={(e) => set("installment", e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Pay-off order</span>
          <input className="field num" inputMode="numeric" value={f.priority} onChange={(e) => set("priority", e.target.value)} />
        </label>
      </div>
      <label className="block">
        <span className="label">Note (e.g. the plan you agreed)</span>
        <input className="field" value={f.note} onChange={(e) => set("note", e.target.value)} />
      </label>
      {d && <Toggle checked={f.closed} onChange={(v) => set("closed", v)} label="Paid off" />}
      <button className="btn btn-primary w-full" disabled={busy}>
        {busy ? "Saving…" : d ? "Save changes" : "Add debt"}
      </button>
    </form>
  );
}
