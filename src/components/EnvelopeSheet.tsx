"use client";

import { useState } from "react";
import { useAdd } from "@/components/AppShell";
import { EnvelopePicker } from "@/components/EnvelopePicker";
import { Sheet } from "@/components/Sheet";
import { Bar, LeftLabel, Segmented, Toggle } from "@/components/ui";
import { useLoaded, type Loaded } from "@/lib/data";
import { envelopeEffect, goalProgress, monthBudget, monthKey, monthlyTarget } from "@/lib/engine";
import { fmtDate, fmtDay, fmtMonthShort, kes, parseAmount } from "@/lib/format";
import type { Envelope } from "@/lib/types";

export function EnvelopeSheet({ envelopeId, onClose }: { envelopeId: string | null; onClose: () => void }) {
  const m = useLoaded();
  const env = envelopeId && m ? m.derived.envById.get(envelopeId) : undefined;
  return (
    <Sheet open={!!env} onClose={onClose} title={env ? env.name : ""}>
      {m && env && <EnvelopeDetail key={env.id} m={m} env={env} onClose={onClose} />}
    </Sheet>
  );
}

function EnvelopeDetail({ m, env, onClose }: { m: Loaded; env: Envelope; onClose: () => void }) {
  const add = useAdd();
  const [tab, setTab] = useState<"overview" | "move" | "edit">("overview");
  const { stats, groupById, sliceOf } = m.derived;
  const st = stats.get(env.id)!;
  const group = groupById.get(env.group_id);
  const slice = sliceOf(env);
  const spending = slice === "needs" || slice === "lifestyle";
  const mt = monthBudget(env, st);
  const goal = env.goal_amount ? goalProgress(env, st, m.raw.allocations) : null;
  const recent = m.raw.txns.filter((t) => envelopeEffect(t) && t.envelope_id === env.id).slice(0, 12);

  return (
    <div className="space-y-4">
      <p className="text-[14px] text-ink-faint">
        {group?.emoji} {group?.name}
        {env.protected && " · protected"}
        {env.note && ` · ${env.note}`}
      </p>
      <Segmented
        label="Section"
        value={tab}
        onChange={setTab}
        options={[
          { value: "overview", label: "Overview" },
          { value: "move", label: "Move money" },
          { value: "edit", label: "Edit" },
        ]}
      />

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-sunk p-4">
            <p className="text-[14px] text-ink-soft">Available</p>
            <p className={`num font-display text-4xl ${st.balance < 0 ? "text-over" : ""}`}>{kes(st.balance)}</p>
            {st.balance < 0 && <p className="mt-1 text-[14px] text-over">Overspent. This comes off the next cycle.</p>}
            <AssignedThisMonth m={m} env={env} />
            {spending && mt > 0 && (
              <div className="mt-3 space-y-1.5 text-[14px]">
                {env.period === "week" ? (
                  <>
                    <Bar value={st.spentThisWeek} max={st.weekLimit} tone={st.spentThisWeek > st.weekLimit ? "over" : "gold"} label="This week" />
                    <p className="text-ink-soft">
                      This week: {kes(st.spentThisWeek)} of {kes(st.weekLimit)}
                      {st.weekLimit < env.target && ` (last week went ${kes(env.target - st.weekLimit)} over)`}
                    </p>
                  </>
                ) : (
                  <>
                    <Bar value={st.spentThisMonth} max={mt} tone={st.spentThisMonth > mt ? "over" : "gold"} label="This month" />
                    <p className="text-ink-soft">
                      Spent {kes(st.spentThisMonth)} of {kes(mt)} this month
                    </p>
                  </>
                )}
              </div>
            )}
            {goal && (
              <div className="mt-3 space-y-1.5 text-[14px]">
                <Bar value={goal.saved} max={goal.goal} tone="good" label="Goal progress" />
                <p className="text-ink-soft">
                  {kes(goal.saved)} of {kes(goal.goal)} ({Math.round(goal.pct * 100)}%)
                  {env.goal_date && ` · by ${fmtDate(env.goal_date)}`}
                </p>
                {goal.neededPerMonth !== null && goal.pct < 1 && (
                  <p className={goal.onTrack ? "text-good" : "text-ink-soft"}>
                    Needs {kes(goal.neededPerMonth)}/month{goal.onTrack !== null && ` · recent pace ${kes(goal.pacePerMonth)}/month`}
                    {goal.projectedMonth && ` · on pace for ${fmtMonthShort(goal.projectedMonth)}`}
                  </p>
                )}
              </div>
            )}
          </div>
          <button type="button" className="btn btn-primary w-full" onClick={() => { onClose(); add({ mode: "spend", envelopeId: env.id }); }}>
            Spend from {env.name}
          </button>
          <div>
            <p className="label">Recent</p>
            {recent.length === 0 ? (
              <p className="text-ink-faint">Nothing spent from here yet.</p>
            ) : (
              <ul className="ruled">
                {recent.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-[15px]">
                    <span className="min-w-0">
                      <span className="block truncate">{t.note || t.category || (t.kind === "debt_payment" ? "Debt payment" : "Spent")}</span>
                      <span className="text-[13px] text-ink-faint">
                        {fmtDay(t.at)}
                        {t.fee > 0 && ` · incl. ${kes(t.fee * t.rate)} fee`}
                      </span>
                    </span>
                    <span className="num font-bold">−{kes(envelopeEffect(t))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === "move" && <MoveEnvelopeMoney m={m} env={env} done={() => setTab("overview")} />}
      {tab === "edit" && <EditEnvelope m={m} env={env} done={() => setTab("overview")} onArchived={onClose} />}
    </div>
  );
}

function MoveEnvelopeMoney({ m, env, done }: { m: Loaded; env: Envelope; done: () => void }) {
  const st = m.derived.stats.get(env.id)!;
  const [dir, setDir] = useState<"in" | "out">("in");
  const [other, setOther] = useState<string | null>(null); // null = Ready to assign
  const [useRta, setUseRta] = useState(true);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const a = parseAmount(amount);
  const otherEnv = !useRta && other ? m.derived.envById.get(other) : undefined;
  const source = dir === "in" ? otherEnv : env;
  const needsReason = !!source?.protected;
  const toTarget = Math.max(0, Math.round(monthlyTarget(env) - st.balance));
  const valid = a > 0 && (useRta || !!other) && (!needsReason || reason.trim().length > 2);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    const from = dir === "in" ? (useRta ? null : other) : env.id;
    const to = dir === "in" ? env.id : useRta ? null : other;
    const ok = await m.actions.moveMoney(from, to, Math.round(a), reason.trim() || null);
    setBusy(false);
    if (ok) {
      m.say("Moved");
      done();
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <Segmented
        label="Direction"
        value={dir}
        onChange={setDir}
        options={[
          { value: "in", label: `Add to ${env.name}` },
          { value: "out", label: `Take from ${env.name}` },
        ]}
      />
      <Segmented
        label="Other side"
        value={useRta ? "rta" : "env"}
        onChange={(v) => setUseRta(v === "rta")}
        options={[
          { value: "rta", label: `Ready to assign (${kes(m.derived.rta)})` },
          { value: "env", label: "Another envelope" },
        ]}
      />
      {!useRta && (
        <EnvelopePicker value={other} onChange={setOther} exclude={env.id} label={dir === "in" ? "Take it from" : "Give it to"} />
      )}
      <label className="block">
        <span className="label">Amount</span>
        <input className="field num text-xl" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
      </label>
      {dir === "in" && toTarget > 0 && (
        <button type="button" className="chip" onClick={() => setAmount(String(toTarget))}>
          Fill to target · {kes(toTarget)}
        </button>
      )}
      {needsReason && (
        <label className="block">
          <span className="label">{source!.name} is protected. Why are you taking from it?</span>
          <input className="field" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Be honest with yourself" />
        </label>
      )}
      <button className="btn btn-primary w-full" disabled={!valid || busy}>
        {busy ? "Moving…" : "Move it"}
      </button>
    </form>
  );
}

function EditEnvelope({ m, env, done, onArchived }: { m: Loaded; env: Envelope; done: () => void; onArchived: () => void }) {
  const slice = m.derived.sliceOf(env);
  const [f, setF] = useState({
    name: env.name,
    target: String(env.target),
    period: env.period,
    fill: env.fill,
    goal_amount: env.goal_amount ? String(env.goal_amount) : "",
    goal_date: env.goal_date ?? "",
    priority: String(env.priority),
    share: env.share != null ? String(env.share) : "",
    home_account_id: env.home_account_id ?? "",
    sweep_to_id: env.sweep_to_id ?? "",
    group_id: env.group_id,
    protected: env.protected,
    note: env.note ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const goalish = slice === "sinking" || slice === "emergency" || slice === "invest";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await m.actions.saveEnvelope(env.id, {
      name: f.name.trim() || env.name,
      target: Math.max(0, parseAmount(f.target) || 0),
      period: f.period,
      fill: f.fill,
      goal_amount: parseAmount(f.goal_amount) > 0 ? parseAmount(f.goal_amount) : null,
      goal_date: f.goal_date || null,
      priority: Number(f.priority) || 0,
      share: slice === "lifestyle" && parseAmount(f.share) > 0 ? parseAmount(f.share) : null,
      home_account_id: f.home_account_id || null,
      sweep_to_id: f.sweep_to_id || null,
      group_id: f.group_id,
      protected: f.protected,
      note: f.note.trim() || null,
    });
    setBusy(false);
    if (ok) {
      m.say("Saved");
      done();
    }
  }

  async function archive() {
    const bal = m.derived.stats.get(env.id)?.balance ?? 0;
    if (Math.round(bal) !== 0) {
      m.say(`Move its ${kes(bal)} somewhere first`);
      return;
    }
    if (await m.actions.saveEnvelope(env.id, { archived: true })) onArchived();
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <label className="block">
        <span className="label">Name</span>
        <input className="field" value={f.name} onChange={(e) => set("name", e.target.value)} />
      </label>
      <label className="block">
        <span className="label">Group</span>
        <select className="field" value={f.group_id} onChange={(e) => set("group_id", e.target.value)}>
          {m.raw.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.emoji} {g.name}
            </option>
          ))}
        </select>
      </label>
      {slice === "lifestyle" && (
        <label className="block">
          <span className="label">Share of the Lifestyle pot (%) · overrides the target</span>
          <input className="field num" inputMode="decimal" value={f.share} onChange={(e) => set("share", e.target.value)} placeholder="e.g. 15" />
        </label>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label">{goalish ? "Steady amount" : "Target"} per</span>
          <input className="field num" inputMode="decimal" value={f.target} onChange={(e) => set("target", e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Period</span>
          <select className="field" value={f.period} onChange={(e) => set("period", e.target.value as Envelope["period"])}>
            <option value="month">Month</option>
            <option value="week">Week</option>
          </select>
        </label>
      </div>
      <label className="block">
        <span className="label">Funding</span>
        <select className="field" value={f.fill} onChange={(e) => set("fill", e.target.value as Envelope["fill"])}>
          <option value="split">Split across paychecks</option>
          <option value="first">All from the first paycheck of the month</option>
        </select>
      </label>
      {goalish && (
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Goal amount</span>
            <input className="field num" inputMode="decimal" value={f.goal_amount} onChange={(e) => set("goal_amount", e.target.value)} />
          </label>
          <label className="block">
            <span className="label">By</span>
            <input type="date" className="field" value={f.goal_date} onChange={(e) => set("goal_date", e.target.value)} />
          </label>
          {slice === "sinking" && (
            <label className="block">
              <span className="label">Fill order (1 = first)</span>
              <input className="field num" inputMode="numeric" value={f.priority} onChange={(e) => set("priority", e.target.value)} />
            </label>
          )}
        </div>
      )}
      <label className="block">
        <span className="label">Money for this sits in</span>
        <select className="field" value={f.home_account_id} onChange={(e) => set("home_account_id", e.target.value)}>
          <option value="">Anywhere</option>
          {m.raw.accounts.filter((a) => !a.archived && a.spendable).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">At month end, move leftovers to</span>
        <select className="field" value={f.sweep_to_id} onChange={(e) => set("sweep_to_id", e.target.value)}>
          <option value="">Keep them here</option>
          {m.raw.envelopes.filter((e) => !e.archived && e.id !== env.id).map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      <Toggle checked={f.protected} onChange={(v) => set("protected", v)} label="Protected" hint="Taking money out needs a reason" />
      <label className="block">
        <span className="label">Note</span>
        <input className="field" value={f.note} onChange={(e) => set("note", e.target.value)} />
      </label>
      <button className="btn btn-primary w-full" disabled={busy}>
        {busy ? "Saving…" : "Save changes"}
      </button>
      <button type="button" className="btn w-full text-over" onClick={archive}>
        Archive envelope
      </button>
    </form>
  );
}

/** Row used on Home and Envelopes. */
export function EnvelopeRow({ m, env, onOpen }: { m: Loaded; env: Envelope; onOpen: (id: string) => void }) {
  const st = m.derived.stats.get(env.id)!;
  const slice = m.derived.sliceOf(env);
  const mt = monthBudget(env, st);
  const goal = env.goal_amount ? goalProgress(env, st, m.raw.allocations) : null;
  const weekly = env.period === "week";
  const spent = weekly ? st.spentThisWeek : st.spentThisMonth;
  const cap = weekly ? st.weekLimit : mt;
  const spending = slice === "needs" || slice === "lifestyle";
  return (
    <button type="button" onClick={() => onOpen(env.id)} className="tap block w-full py-3 text-left">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-semibold">{env.name}</span>
        {goal ? (
          <span className="num text-[15px] font-bold">
            {kes(goal.saved)} <span className="font-normal text-ink-faint">/ {kes(goal.goal)}</span>
          </span>
        ) : (
          <LeftLabel amount={st.balance} className="text-[15px]" />
        )}
      </div>
      <div className="mt-1.5">
        {goal ? (
          <Bar value={goal.saved} max={goal.goal} tone="good" label={`${env.name} goal`} />
        ) : spending && cap > 0 ? (
          <Bar value={spent} max={cap} tone={spent > cap || st.balance < 0 ? "over" : "gold"} label={`${env.name} spent`} />
        ) : null}
      </div>
      <p className="mt-1 text-[13px] text-ink-faint">
        {goal
          ? goal.pct >= 1
            ? "Goal reached 🎉"
            : env.goal_date
              ? `${Math.round(goal.pct * 100)}% · by ${fmtDate(env.goal_date)}${goal.onTrack === false ? " · behind pace" : goal.onTrack ? " · on track" : ""}`
              : `${Math.round(goal.pct * 100)}%`
          : spending && cap > 0
            ? `${kes(spent)} of ${kes(cap)} ${weekly ? "this week" : "this month"}`
            : (env.share ?? 0) > 0
              ? `${env.share}% of Lifestyle · nothing in yet this month`
              : env.target > 0
                ? `${kes(env.target)} a month`
                : "Holding"}
      </p>
    </button>
  );
}

/**
 * What this envelope was given this month (splits, moves, sweeps). Editing it moves the
 * difference to or from Ready to assign, e.g. Rent 18,300 → 18,000 frees 300.
 */
function AssignedThisMonth({ m, env }: { m: Loaded; env: Envelope }) {
  const month = monthKey(m.now);
  const assigned = Math.round(
    m.raw.allocations.filter((a) => a.envelope_id === env.id && a.kind !== "opening" && monthKey(a.at) === month).reduce((s, a) => s + a.amount, 0),
  );
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(assigned));
  const [busy, setBusy] = useState(false);
  const next = Math.round(parseAmount(value));
  const diff = Number.isFinite(next) ? next - assigned : 0;
  const rta = m.derived.rta;

  async function save() {
    if (!diff) return setEditing(false);
    setBusy(true);
    const note = `Assigned changed from ${kes(assigned)} to ${kes(next)}`;
    const ok = diff < 0 ? await m.actions.moveMoney(env.id, null, -diff, note) : await m.actions.moveMoney(null, env.id, diff, note);
    setBusy(false);
    if (ok) {
      setEditing(false);
      m.say(diff < 0 ? `${kes(-diff)} back to Ready to assign` : `${kes(diff)} taken from Ready to assign`);
    }
  }

  if (!editing) {
    return (
      <p className="mt-2 flex items-center justify-between gap-2 text-[14px] text-ink-soft">
        <span>
          Assigned this month: <strong className="num text-ink">{kes(assigned)}</strong>
        </span>
        <button
          type="button"
          className="chip"
          onClick={() => {
            setValue(String(assigned));
            setEditing(true);
          }}
        >
          Edit
        </button>
      </p>
    );
  }
  return (
    <div className="mt-3 space-y-2">
      <label className="block">
        <span className="label">Assigned this month</span>
        <input className="field num text-xl" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
      </label>
      {diff !== 0 && (
        <p className={`text-[14px] ${diff > rta ? "text-over" : "text-ink-soft"}`}>
          {diff < 0
            ? `${kes(-diff)} goes back to Ready to assign.`
            : diff > rta
              ? `That needs ${kes(diff)} but Ready to assign has ${kes(rta)}. Free some up from another envelope first.`
              : `${kes(diff)} comes from Ready to assign (${kes(rta)}).`}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary btn-small" disabled={busy || !Number.isFinite(next) || next < 0 || diff > rta} onClick={save}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn-quiet btn-small" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
