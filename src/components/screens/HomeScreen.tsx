"use client";

import Link from "next/link";
import { useState } from "react";
import { useAdd } from "@/components/AppShell";
import { EnvelopeRow, EnvelopeSheet } from "@/components/EnvelopeSheet";
import { Sheet } from "@/components/Sheet";
import { Bar, Loading, SectionTitle } from "@/components/ui";
import { useLoaded, type Loaded } from "@/lib/data";
import { envelopeEffect, goalProgress, monthlyTarget } from "@/lib/engine";
import { fmtDay, fmtTime, kes, kesSigned, parseAmount, usd } from "@/lib/format";

export function HomeScreen() {
  const m = useLoaded();
  const [openEnv, setOpenEnv] = useState<string | null>(null);
  if (!m) return <Loading />;
  const { rta, worth, moves, pendingReviews, stats, sliceOf } = m.derived;
  const { envelopes, groups } = m.raw;

  const active = envelopes.filter((e) => !e.archived);
  const overspent = active.filter((e) => (stats.get(e.id)?.balance ?? 0) < -0.5);
  const weekly = active.find((e) => e.period === "week");
  const groupSort = new Map(groups.map((g) => [g.id, g.sort]));
  const lifestyle = active
    .filter((e) => sliceOf(e) === "lifestyle")
    .sort((a, b) => groupSort.get(a.group_id)! - groupSort.get(b.group_id)! || a.sort - b.sort);
  const ef = active.find((e) => sliceOf(e) === "emergency");
  const efGoal = ef ? goalProgress(ef, stats.get(ef.id), m.raw.allocations) : null;

  return (
    <div className="space-y-4 pt-2">
      <ReadyToAssign m={m} rta={rta} />

      {pendingReviews.length > 0 && <MorningCheck m={m} />}

      <NightOut m={m} />

      {overspent.length > 0 && (
        <div className="card border-[var(--over)] p-4">
          <p className="font-bold text-over">Over in {overspent.length === 1 ? "1 envelope" : `${overspent.length} envelopes`}</p>
          <ul className="mt-1 text-[15px]">
            {overspent.map((e) => (
              <li key={e.id}>
                <button type="button" className="underline" onClick={() => setOpenEnv(e.id)}>
                  {e.name}
                </button>{" "}
                <span className="num">{kes(-(stats.get(e.id)?.balance ?? 0))}</span> over. This comes off its next cycle.
              </li>
            ))}
          </ul>
        </div>
      )}

      {weekly && (
        <button type="button" onClick={() => setOpenEnv(weekly.id)} className="card block w-full p-4 text-left">
          <WeeklyCard m={m} id={weekly.id} />
        </button>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link href="/goals" className="card block p-4">
          <p className="text-[13px] text-ink-soft">Net worth</p>
          <p className={`num font-display text-2xl ${worth.net < 0 ? "text-over" : "text-good"}`}>{kesSigned(worth.net)}</p>
          <p className="text-[12px] text-ink-faint">owe {kes(worth.liabilities)}</p>
        </Link>
        {ef && efGoal && (
          <button type="button" onClick={() => setOpenEnv(ef.id)} className="card block p-4 text-left">
            <p className="text-[13px] text-ink-soft">Emergency fund</p>
            <p className="num font-display text-2xl">{Math.round(efGoal.pct * 100)}%</p>
            <div className="mt-1">
              <Bar value={efGoal.saved} max={efGoal.goal} tone="good" label="Emergency fund" />
            </div>
          </button>
        )}
      </div>

      {moves.length > 0 && (
        <Link href="/accounts" className="card flex items-center justify-between gap-3 p-4">
          <span>
            <span className="block font-bold">
              {moves.length === 1 ? "1 move" : `${moves.length} moves`} to put money where it belongs
            </span>
            <span className="text-[14px] text-ink-soft">
              e.g. {kes(moves[0].amount)} {moves[0].from.name} → {moves[0].to.name}
            </span>
          </span>
          <span aria-hidden className="text-2xl text-ink-faint">›</span>
        </Link>
      )}

      <SectionTitle action={<Link href="/envelopes" className="text-[14px] font-semibold text-ink-soft underline">All envelopes</Link>}>
        Lifestyle this month
      </SectionTitle>
      <div className="card ruled px-4">
        {lifestyle.map((e) => (
          <EnvelopeRow key={e.id} m={m} env={e} onOpen={setOpenEnv} />
        ))}
        {lifestyle.length === 0 && <p className="py-4 text-ink-faint">No lifestyle envelopes yet.</p>}
      </div>

      <Recent m={m} />

      <EnvelopeSheet envelopeId={openEnv} onClose={() => setOpenEnv(null)} />
      {groups.length === 0 && <p className="text-ink-faint">Setting things up…</p>}
    </div>
  );
}

function ReadyToAssign({ m, rta }: { m: Loaded; rta: number }) {
  const [open, setOpen] = useState(false);
  const add = useAdd();
  if (Math.abs(rta) < 1) {
    return (
      <div className="card p-4">
        <p className="font-display text-xl">Every shilling has a job ✓</p>
        <p className="text-[14px] text-ink-soft">Got paid? Log it and it splits itself.</p>
        <button type="button" className="btn btn-quiet btn-small mt-3" onClick={() => add({ mode: "income" })}>
          Log income
        </button>
      </div>
    );
  }
  const over = rta < 0;
  return (
    <div className={`card p-4 ${over ? "border-[var(--over)]" : "border-[var(--gold)]"}`}>
      <p className="text-[14px] text-ink-soft">{over ? "Over-assigned" : "Ready to assign"}</p>
      <p className={`num font-display text-4xl ${over ? "text-over" : "text-gold"}`}>{kes(Math.abs(rta))}</p>
      <p className="mt-1 text-[14px] text-ink-soft">
        {over
          ? "Your envelopes promise more than your accounts hold. Log missing income, or take money out of an envelope."
          : "This money has no job yet. Give it one."}
      </p>
      {!over && (
        <button type="button" className="btn btn-primary btn-small mt-3" onClick={() => setOpen(true)}>
          Give it jobs
        </button>
      )}
      <AssignSheet m={m} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

/** Hand out Ready-to-assign money: suggestions are the envelopes furthest below this month's target. */
function AssignSheet({ m, open, onClose }: { m: Loaded; open: boolean; onClose: () => void }) {
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const { stats, sliceOf, rta } = m.derived;
  const rows = m.raw.envelopes
    .filter((e) => !e.archived && (sliceOf(e) === "needs" || sliceOf(e) === "lifestyle"))
    .map((e) => {
      const s = stats.get(e.id);
      // a week envelope needs this week's allowance; a month envelope what's left of this month's target
      const need = e.period === "week" ? e.target - (s?.balance ?? 0) : monthlyTarget(e) - (s?.spentThisMonth ?? 0) - (s?.balance ?? 0);
      return { e, need: Math.max(0, Math.round(need)) };
    })
    .filter((r) => r.need > 0);
  const total = Object.values(amounts).reduce((s, v) => s + (parseAmount(v) || 0), 0);

  async function save() {
    setBusy(true);
    for (const [id, v] of Object.entries(amounts)) {
      const a = Math.round(parseAmount(v) || 0);
      if (a > 0) await m.actions.moveMoney(null, id, a, "Assigned");
    }
    setBusy(false);
    setAmounts({});
    m.say("Assigned");
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Give it jobs">
      <p className="mb-3 text-[15px] text-ink-soft">
        {kes(rta - total)} of {kes(rta)} left to assign. Envelopes below their target are listed first. Tap a number to fill it.
      </p>
      <ul className="ruled">
        {rows.map(({ e, need }) => (
          <li key={e.id} className="flex items-center gap-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{e.name}</span>
              <button
                type="button"
                className="text-[13px] text-ink-soft underline"
                onClick={() => setAmounts((x) => ({ ...x, [e.id]: String(Math.min(need, Math.max(0, Math.round(rta - total + (parseAmount(x[e.id] ?? "") || 0))))) }))}
              >
                needs {kes(need)}
              </button>
            </span>
            <input
              className="field num w-28 text-right"
              inputMode="decimal"
              placeholder="0"
              aria-label={`Amount for ${e.name}`}
              value={amounts[e.id] ?? ""}
              onChange={(ev) => setAmounts((x) => ({ ...x, [e.id]: ev.target.value }))}
            />
          </li>
        ))}
      </ul>
      <button className="btn btn-primary mt-4 w-full" disabled={busy || total <= 0 || total > rta + 0.5} onClick={save}>
        {total > rta + 0.5 ? "That's more than you have" : busy ? "Saving…" : `Assign ${kes(total)}`}
      </button>
    </Sheet>
  );
}

function WeeklyCard({ m, id }: { m: Loaded; id: string }) {
  const st = m.derived.stats.get(id)!;
  // this week's allowance, but never more than the envelope actually holds
  const left = Math.min(st.weekLimit - st.spentThisWeek, st.balance);
  const unfunded = st.balance < st.weekLimit - st.spentThisWeek;
  return (
    <>
      <div className="flex items-baseline justify-between">
        <p className="font-semibold">This week&rsquo;s spending money</p>
        <p className={`num font-bold ${left < 0 ? "text-over" : ""}`}>{left < 0 ? `${kes(-left)} over` : `${kes(left)} left`}</p>
      </div>
      <div className="mt-2">
        <Bar value={st.spentThisWeek} max={st.weekLimit} tone={left < 0 ? "over" : "gold"} label="Weekly" />
      </div>
      <p className="mt-1 text-[13px] text-ink-faint">
        {kes(st.spentThisWeek)} of {kes(st.weekLimit)}
        {st.weekLimit < (m.derived.envById.get(id)?.target ?? 0) && " · smaller because last week went over"}
        {unfunded && ` · the envelope only holds ${kes(Math.max(0, st.balance))}`}
      </p>
    </>
  );
}

function NightOut({ m }: { m: Loaded }) {
  const { tonight, nightEnv, stats } = m.derived;
  const [open, setOpen] = useState(false);
  const [cap, setCap] = useState("");
  const add = useAdd();
  if (!nightEnv) return null;
  const avail = stats.get(nightEnv.id)?.balance ?? 0;

  if (tonight) {
    const left = tonight.cap - tonight.spent;
    return (
      <div className={`card p-4 ${left < 0 ? "border-[var(--over)]" : "border-[var(--tier-3)]"}`}>
        <p className="font-display text-xl">🌙 Tonight</p>
        <p className={`num text-3xl font-bold ${left < 0 ? "text-over" : ""}`}>{left < 0 ? `${kes(-left)} over your cap` : `${kes(left)} left`}</p>
        <div className="my-2">
          <Bar value={tonight.spent} max={tonight.cap} tone={left < 0 ? "over" : "tier-3"} label="Tonight's cap" />
        </div>
        <p className="text-[14px] text-ink-soft">
          You set {kes(tonight.cap)} at {fmtTime(tonight.started)}, while thinking clearly. Drinks, fare and tickets all count.
        </p>
        <div className="mt-3 flex gap-2">
          <button type="button" className="btn btn-primary btn-small" onClick={() => add({ mode: "spend", envelopeId: nightEnv.id })}>
            Log a spend
          </button>
          <button type="button" className="btn btn-quiet btn-small" onClick={() => m.actions.saveSettings({ night_cap: null, night_started_at: null })}>
            I&rsquo;m home
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="card flex w-full items-center justify-between p-4 text-left">
        <span>
          <span className="block font-semibold">🌙 Going out tonight?</span>
          <span className="text-[14px] text-ink-soft">
            Set tonight&rsquo;s cap now. {avail < 0 ? `Night out is ${kes(-avail)} over.` : `Night out has ${kes(avail)}.`}
          </span>
        </span>
        <span aria-hidden className="text-2xl text-ink-faint">›</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Tonight's cap">
        <p className="mb-3 text-ink-soft">
          Decide now, while your judgement is 100%. Then put just this on M-Pesa line 2 and keep Fuliza off.
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          {[1500, 2500, 3500].map((v) => (
            <button key={v} type="button" className="chip" aria-pressed={cap === String(v)} onClick={() => setCap(String(v))}>
              {kes(v)}
            </button>
          ))}
        </div>
        <input className="field num text-xl" inputMode="decimal" placeholder="Your cap" value={cap} onChange={(e) => setCap(e.target.value)} />
        {parseAmount(cap) > avail && (
          <p className="mt-2 text-[14px] text-over">
            {avail <= 0 ? "Night out is empty. Anything tonight comes off next cycle." : `That's more than Night out holds (${kes(avail)}).`}
          </p>
        )}
        <button
          className="btn btn-primary mt-4 w-full"
          disabled={!(parseAmount(cap) > 0)}
          onClick={async () => {
            if (await m.actions.saveSettings({ night_cap: parseAmount(cap), night_started_at: new Date().toISOString() })) {
              setOpen(false);
              m.say("Have fun. Your cap is set.");
            }
          }}
        >
          Set cap
        </button>
      </Sheet>
    </>
  );
}

function MorningCheck({ m }: { m: Loaded }) {
  const items = m.derived.pendingReviews.slice(0, 5);
  const total = m.derived.pendingReviews.reduce((s, t) => s + envelopeEffect(t), 0);
  return (
    <div className="card p-4">
      <p className="font-display text-xl">☀️ Morning check</p>
      <p className="text-[14px] text-ink-soft">
        {kes(total)} spent late at night. Honest answers help you set next time&rsquo;s cap.
      </p>
      <ul className="ruled mt-2">
        {items.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-2 py-2">
            <span className="min-w-0">
              <span className="block truncate font-semibold">{t.note || m.derived.envById.get(t.envelope_id ?? "")?.name}</span>
              <span className="num text-[13px] text-ink-faint">
                {kes(envelopeEffect(t))} · {fmtTime(t.at)}
              </span>
            </span>
            <span className="flex shrink-0 gap-1">
              <button type="button" className="chip" onClick={() => m.actions.review(t.id, "worth")}>
                Worth it
              </button>
              <button type="button" className="chip" onClick={() => m.actions.review(t.id, "regret")}>
                Regret
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Recent({ m }: { m: Loaded }) {
  const recent = m.raw.txns.slice(0, 6);
  const { envById, accById } = m.derived;
  if (recent.length === 0) return null;
  return (
    <>
      <SectionTitle action={<Link href="/history" className="text-[14px] font-semibold text-ink-soft underline">History</Link>}>
        Recent
      </SectionTitle>
      <ul className="card ruled px-4">
        {recent.map((t) => {
          const sign = t.kind === "income" || t.kind === "borrow" ? 1 : t.kind === "transfer" || t.kind === "adjust" ? 0 : -1;
          const acc = accById.get(t.account_id);
          return (
            <li key={t.id} className="flex items-center justify-between gap-3 py-3">
              <span className="min-w-0">
                <span className="block truncate font-semibold">
                  {t.kind === "transfer"
                    ? `${acc?.name} → ${accById.get(t.to_account_id ?? "")?.name}`
                    : t.note || t.category || envById.get(t.envelope_id ?? "")?.name || t.kind}
                </span>
                <span className="text-[13px] text-ink-faint">
                  {fmtDay(t.at)} · {t.envelope_id ? envById.get(t.envelope_id)?.name : acc?.name}
                </span>
              </span>
              <span className={`num shrink-0 font-bold ${sign > 0 ? "text-good" : ""}`}>
                {sign > 0 ? "+" : sign < 0 ? "−" : ""}
                {acc?.currency === "USD" ? usd(t.amount + (sign < 0 ? t.fee : 0)) : kes(t.amount + (sign < 0 ? t.fee : 0))}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
