"use client";

import { useMemo, useState } from "react";
import { EnvelopePicker } from "@/components/EnvelopePicker";
import { Sheet } from "@/components/Sheet";
import { Segmented, Toggle } from "@/components/ui";
import { useLoaded, type Loaded } from "@/lib/data";
import { firstIncomeOfMonth, planIncome, planSweeps } from "@/lib/engine";
import { fromNairobiLocal, kes, kesSigned, nairobiLocalInput, parseAmount, usd } from "@/lib/format";
import type { Account, Slice } from "@/lib/types";

export type AddMode = "spend" | "income" | "move" | "debt";
export type AddPreset = {
  mode: AddMode;
  envelopeId?: string;
  accountId?: string;
  toAccountId?: string;
  amount?: number;
  debtId?: string;
  debtMode?: "pay" | "borrow";
};

const TITLES: Record<AddMode, string> = { spend: "Spend", income: "Income", move: "Move money", debt: "Debt" };

export function AddSheet({ preset, onClose }: { preset: AddPreset | null; onClose: () => void }) {
  const m = useLoaded();
  const [mode, setMode] = useState<AddMode>("spend");
  const [shownFor, setShownFor] = useState<AddPreset | null>(null);
  // a new preset resets the mode (adjusting state during render, not in an effect)
  if (preset !== shownFor) {
    setShownFor(preset);
    if (preset) setMode(preset.mode);
  }
  if (!m) return null;
  const p = preset && preset.mode === mode ? preset : { mode };
  return (
    <Sheet open={!!preset} onClose={onClose} title={TITLES[mode]}>
      <div className="mb-4">
        <Segmented
          label="What kind"
          value={mode}
          onChange={setMode}
          options={[
            { value: "spend", label: "Spend" },
            { value: "income", label: "Income" },
            { value: "move", label: "Move" },
            { value: "debt", label: "Debt" },
          ]}
        />
      </div>
      {mode === "spend" && <SpendForm m={m} preset={p} done={onClose} />}
      {mode === "income" && <IncomeForm m={m} preset={p} done={onClose} />}
      {mode === "move" && <MoveForm m={m} preset={p} done={onClose} />}
      {mode === "debt" && <DebtForm m={m} preset={p} done={onClose} />}
    </Sheet>
  );
}

type FormProps = { m: Loaded; preset: AddPreset; done: () => void };

// ---------------------------------------------------------------------------
// shared bits
// ---------------------------------------------------------------------------
function AmountField({
  value,
  onChange,
  currency,
  label = "Amount",
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  currency: "KES" | "USD";
  label?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <div className="flex items-center gap-2 rounded-2xl border-[1.5px] border-[var(--rule)] bg-sunk px-4 focus-within:border-[var(--focus)]">
        <span className="text-lg font-bold text-ink-faint">{currency === "USD" ? "$" : "KES"}</span>
        <input
          className="num min-h-16 w-full bg-transparent text-3xl font-bold outline-none"
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </label>
  );
}

function AccountSelect({
  accounts,
  value,
  onChange,
  label,
  m,
}: {
  accounts: Account[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  m: Loaded;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        {accounts.map((a) => {
          const bal = m.derived.balances.get(a.id) ?? 0;
          return (
            <option key={a.id} value={a.id}>
              {a.name} · {a.currency === "USD" ? usd(bal) : kes(bal)}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function WhenField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="label">When</span>
      <input type="datetime-local" className="field" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

const openAccounts = (m: Loaded) => m.raw.accounts.filter((a) => !a.archived);
const num = (s: string) => {
  const n = parseAmount(s);
  return Number.isFinite(n) ? n : 0;
};
const rateFor = (a: Account | undefined, m: Loaded) => (a?.currency === "USD" ? m.raw.settings.usd_kes : 1);

// ---------------------------------------------------------------------------
// Spend
// ---------------------------------------------------------------------------
const SPEND_SLICES: Slice[] = ["needs", "lifestyle", "sinking", "debt", "emergency", "invest", "tax"];

function SpendForm({ m, preset, done }: FormProps) {
  const accounts = openAccounts(m);
  const { envById, accById, stats, nightEnv, tonight } = m.derived;
  const [envelopeId, setEnvelopeId] = useState<string | null>(preset.envelopeId ?? null);
  const startEnv = envelopeId ? envById.get(envelopeId) : undefined;
  const [accountId, setAccountId] = useState(preset.accountId ?? startEnv?.home_account_id ?? accounts[0]?.id ?? "");
  const [accountTouched, setAccountTouched] = useState(!!preset.accountId);
  const [amount, setAmount] = useState(preset.amount ? String(preset.amount) : "");
  const [fee, setFee] = useState("");
  const [note, setNote] = useState("");
  const [when, setWhen] = useState(nairobiLocalInput());
  const [business, setBusiness] = useState(false);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);

  const account = accById.get(accountId);
  const env = envelopeId ? envById.get(envelopeId) : undefined;
  const rate = rateFor(account, m);
  const total = (num(amount) + num(fee)) * rate;
  const available = env ? stats.get(env.id)?.balance ?? 0 : 0;
  const after = available - total;
  const st = env ? stats.get(env.id) : undefined;
  const isNight = env && nightEnv && env.id === nightEnv.id;
  const needsEnvelope = account?.spendable !== false;
  const valid = num(amount) > 0 && !!account && (!needsEnvelope || !!env);

  function pick(id: string) {
    setEnvelopeId(id);
    const e = envById.get(id);
    if (!accountTouched && e?.home_account_id) setAccountId(e.home_account_id);
    if (e && /network|work tools|dj/i.test(e.name)) setBusiness(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    const ok = await m.actions.addTxn({
      kind: "expense",
      account_id: accountId,
      amount: num(amount),
      fee: num(fee),
      rate,
      kes_value: Math.round(total * 100) / 100,
      envelope_id: needsEnvelope ? envelopeId : env?.id ?? null,
      note: note.trim() || null,
      category: note.trim() || null,
      tags: business ? ["business"] : [],
      at: fromNairobiLocal(when),
    });
    setBusy(false);
    if (!ok) return;
    done();
    if (env) m.say(after >= 0 ? `${env.name}: ${kes(after)} left` : `${env.name} is ${kes(-after)} over. It comes off next cycle.`);
    else m.say("Saved");
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <AmountField value={amount} onChange={setAmount} currency={account?.currency ?? "KES"} autoFocus />
      {needsEnvelope && <EnvelopePicker value={envelopeId} onChange={pick} slices={SPEND_SLICES} />}

      {env && num(amount) > 0 && (
        <div className={`rounded-2xl p-3 text-[15px] ${after < 0 ? "bg-[color-mix(in_oklab,var(--over)_16%,transparent)]" : "bg-sunk"}`}>
          <p>
            <strong>{env.name}</strong>: {kes(available)} → <strong className={after < 0 ? "text-over" : ""}>{kes(after)}</strong>
          </p>
          {after < 0 && <p className="mt-1 text-ink-soft">This goes over. The {kes(-after)} comes off this envelope&rsquo;s next cycle.</p>}
          {env.period === "week" && st && (
            <p className="mt-1 text-ink-soft">
              This week: {kes(st.spentThisWeek + total)} of {kes(st.weekLimit)}
            </p>
          )}
          {isNight && tonight && (
            <p className={`mt-1 ${tonight.spent + total > tonight.cap ? "font-bold text-over" : "text-ink-soft"}`}>
              Tonight: {kes(tonight.spent + total)} of your {kes(tonight.cap)} cap
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <AccountSelect
          m={m}
          accounts={accounts}
          value={accountId}
          onChange={(id) => {
            setAccountId(id);
            setAccountTouched(true);
          }}
          label="Paid from"
        />
        <label className="block">
          <span className="label">Fee (M-Pesa, bank…)</span>
          <input className="field num" inputMode="decimal" placeholder="0" value={fee} onChange={(e) => setFee(e.target.value)} />
        </label>
      </div>

      <label className="block">
        <span className="label">What for (optional)</span>
        <input className="field" placeholder="e.g. Uber boda, breakfast" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      <button type="button" className="text-[14px] font-semibold text-ink-soft underline" onClick={() => setMore((v) => !v)} aria-expanded={more}>
        {more ? "Less" : "Date, business tag…"}
      </button>
      {more && (
        <div className="space-y-2">
          <WhenField value={when} onChange={setWhen} />
          <Toggle checked={business} onChange={setBusiness} label="Business expense" hint="Tagged for tax filing" />
        </div>
      )}

      <button className="btn btn-primary w-full" disabled={!valid || busy}>
        {busy ? "Saving…" : `Save ${num(amount) > 0 ? kes(total) : ""}`}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Income — with the split preview
// ---------------------------------------------------------------------------
const SOURCES = ["Deel pay", "Gig", "DJ gig", "Gift", "Refund", "Other"];
const SLICE_LABEL: Record<Slice, string> = {
  tax: "Tax set-aside",
  needs: "Needs",
  lifestyle: "Lifestyle",
  sinking: "Sinking funds",
  debt: "Debt",
  emergency: "Emergency fund",
  invest: "Investments",
};
const SLICE_ORDER: Slice[] = ["tax", "needs", "lifestyle", "sinking", "debt", "emergency", "invest"];

function IncomeForm({ m, preset, done }: FormProps) {
  const accounts = openAccounts(m).filter((a) => a.spendable);
  const { accById, envById, stats, debtOwed } = m.derived;
  const { settings, groups, envelopes, allocations } = m.raw;
  const [accountId, setAccountId] = useState(preset.accountId ?? accounts.find((a) => a.kind === "usd")?.id ?? accounts[0]?.id ?? "");
  const [source, setSource] = useState("Deel pay");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("");
  const [rateText, setRateText] = useState(String(settings.usd_kes));
  const [taxable, setTaxable] = useState(true);
  const [when, setWhen] = useState(nairobiLocalInput());
  const [note, setNote] = useState("");
  const [detail, setDetail] = useState(false);
  const [busy, setBusy] = useState(false);

  const account = accById.get(accountId);
  const isUsd = account?.currency === "USD";
  const rate = isUsd ? num(rateText) || settings.usd_kes : 1;
  const kesValue = Math.round(num(amount) * rate);
  const at = fromNairobiLocal(when);

  const { sweeps, plan } = useMemo(() => {
    const atDate = new Date(at);
    const sw = firstIncomeOfMonth(allocations, atDate) ? planSweeps(envelopes, stats, allocations, atDate) : [];
    const adjusted = new Map([...stats].map(([id, s]) => [id, { balance: s.balance, fundedThisMonth: s.fundedThisMonth }]));
    for (const l of sw) {
      const s = adjusted.get(l.envelope_id);
      if (s) s.balance += l.amount;
    }
    return {
      sweeps: sw,
      plan: planIncome({ kes: kesValue, taxable, settings, groups, envelopes, stats: adjusted, debtOwed }),
    };
  }, [at, allocations, envelopes, stats, kesValue, taxable, settings, groups, debtOwed]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (kesValue <= 0 || busy) return;
    setBusy(true);
    const ok = await m.actions.recordIncome(
      {
        at,
        account_id: accountId,
        amount: num(amount),
        fee: num(fee),
        rate,
        kes_value: kesValue,
        taxable,
        category: source,
        note: note.trim() || null,
        tags: [],
      },
      [...sweeps, ...plan.lines],
    );
    setBusy(false);
    if (!ok) return;
    done();
    m.say(`${kes(kesValue)} split. Every shilling has a job.`);
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Source">
        {SOURCES.map((s) => (
          <button
            key={s}
            type="button"
            className="chip"
            aria-pressed={source === s}
            onClick={() => {
              setSource(s);
              setTaxable(!["Gift", "Refund"].includes(s));
            }}
          >
            {s}
          </button>
        ))}
      </div>
      <AccountSelect m={m} accounts={accounts} value={accountId} onChange={setAccountId} label="Landed in" />
      <AmountField value={amount} onChange={setAmount} currency={account?.currency ?? "KES"} label="Amount received (after the platform fee)" />
      {isUsd && (
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Platform fee ($)</span>
            <input className="field num" inputMode="decimal" placeholder="0.00" value={fee} onChange={(e) => setFee(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Value at KES per $</span>
            <input className="field num" inputMode="decimal" value={rateText} onChange={(e) => setRateText(e.target.value)} />
          </label>
        </div>
      )}
      {isUsd && num(amount) > 0 && (
        <p className="text-[14px] text-ink-soft">
          Earned {usd(num(amount) + num(fee))}
          {num(fee) > 0 && ` · fee ${(((num(fee) / (num(amount) + num(fee))) * 100) || 0).toFixed(1)}%`} · worth about{" "}
          <strong className="text-ink">KES {kes(kesValue)}</strong>. When you convert, log it under Move and the app shows your real rate.
        </p>
      )}
      <Toggle checked={taxable} onChange={setTaxable} label="Taxable income" hint={`${settings.tax_pct}% goes to Tax set-aside first`} />

      {kesValue > 0 && (
        <div className="rounded-2xl bg-sunk p-4">
          <p className="mb-2 font-display text-lg">How it splits</p>
          <SplitBar bySlice={plan.bySlice} total={kesValue} />
          <ul className="mt-3 space-y-1.5 text-[15px]">
            {SLICE_ORDER.filter((s) => plan.bySlice[s] > 0).map((s) => (
              <li key={s} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <span aria-hidden className="h-3 w-3 rounded-sm" style={{ background: `var(--s-${s})` }} />
                  {SLICE_LABEL[s]}
                </span>
                <span className="num font-bold">{kes(plan.bySlice[s])}</span>
              </li>
            ))}
          </ul>
          {plan.short.needs > 0 && (
            <p className="mt-3 text-[14px] font-semibold text-over">Needs are {kes(plan.short.needs)} short this paycheck. Lean cycle: Lifestyle waits.</p>
          )}
          {plan.short.lifestyle > 0 && plan.short.needs === 0 && (
            <p className="mt-3 text-[14px] text-ink-soft">Lifestyle envelopes get {kes(plan.short.lifestyle)} less than their targets this time.</p>
          )}
          {sweeps.length > 0 && (
            <p className="mt-3 text-[14px] text-ink-soft">
              New month: leftovers move first.{" "}
              {sweeps
                .filter((l) => l.amount > 0)
                .map((l) => `${kes(l.amount)} → ${envById.get(l.envelope_id)?.name}`)
                .join(", ")}
            </p>
          )}
          <button type="button" className="mt-3 text-[14px] font-semibold underline" onClick={() => setDetail((v) => !v)} aria-expanded={detail}>
            {detail ? "Hide envelopes" : "See every envelope"}
          </button>
          {detail && (
            <ul className="ruled mt-2 text-[14px]">
              {[...sweeps, ...plan.lines].map((l, i) => (
                <li key={i} className="flex justify-between py-1.5">
                  <span>
                    {envById.get(l.envelope_id)?.name}
                    {l.kind === "sweep" && <span className="text-ink-faint"> · leftover</span>}
                  </span>
                  <span className="num">{kesSigned(l.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <details>
        <summary className="cursor-pointer text-[14px] font-semibold text-ink-soft">Date and note</summary>
        <div className="mt-2 space-y-3">
          <WhenField value={when} onChange={setWhen} />
          <label className="block">
            <span className="label">Note</span>
            <input className="field" placeholder="e.g. October pay, part 1" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
      </details>

      <button className="btn btn-primary w-full" disabled={kesValue <= 0 || busy}>
        {busy ? "Splitting…" : kesValue > 0 ? `Split ${kes(kesValue)}` : "Split it"}
      </button>
    </form>
  );
}

/** One stacked bar for the split. 2px gaps between segments; values are listed below it. */
export function SplitBar({ bySlice, total }: { bySlice: Record<Slice, number>; total: number }) {
  const parts = SLICE_ORDER.filter((s) => bySlice[s] > 0);
  return (
    <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={parts.map((s) => `${SLICE_LABEL[s]} ${kes(bySlice[s])}`).join(", ")}>
      {parts.map((s) => (
        <span key={s} title={`${SLICE_LABEL[s]}: ${kes(bySlice[s])}`} style={{ flexGrow: bySlice[s] / Math.max(1, total), background: `var(--s-${s})` }} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Move money between accounts (including USD → KES conversions)
// ---------------------------------------------------------------------------
function MoveForm({ m, preset, done }: FormProps) {
  const accounts = openAccounts(m);
  const { accById, envelopes } = { ...m.derived, envelopes: m.raw.envelopes };
  const buffer = envelopes.find((e) => e.name === "Buffer" && !e.archived);
  const [fromId, setFromId] = useState(preset.accountId ?? accounts.find((a) => a.kind === "usd")?.id ?? accounts[0]?.id ?? "");
  const [toId, setToId] = useState(preset.toAccountId ?? accounts.find((a) => a.name === "I&M")?.id ?? accounts[1]?.id ?? "");
  const [amount, setAmount] = useState(preset.amount ? String(preset.amount) : "");
  const [received, setReceived] = useState("");
  const [fee, setFee] = useState("");
  const [feeEnv, setFeeEnv] = useState<string | null>(buffer?.id ?? null);
  const [note, setNote] = useState("");
  const [when, setWhen] = useState(nairobiLocalInput());
  const [busy, setBusy] = useState(false);

  const from = accById.get(fromId);
  const to = accById.get(toId);
  const converting = !!from && !!to && from.currency !== to.currency;
  const market = m.raw.settings.usd_kes;
  const a = num(amount);
  const r = num(received);
  const effective = converting && a > 0 && r > 0 ? (from!.currency === "USD" ? r / a : a / r) : null;
  const cost = converting && effective ? (from!.currency === "USD" ? a * market - r : r * market - a) : 0;
  const rate = rateFor(from, m);
  const valid = a > 0 && fromId !== toId && (!converting || r > 0);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    const ok = await m.actions.addTxn({
      kind: "transfer",
      account_id: fromId,
      to_account_id: toId,
      amount: a,
      to_amount: converting ? r : a,
      fee: num(fee),
      rate,
      envelope_id: num(fee) > 0 ? feeEnv : null,
      kes_value: num(fee) > 0 ? Math.round(num(fee) * rate * 100) / 100 : null,
      category: converting ? "Conversion" : "Transfer",
      note: note.trim() || (effective ? `Rate ${effective.toFixed(2)}` : null),
      at: fromNairobiLocal(when),
    });
    setBusy(false);
    if (!ok) return;
    done();
    m.say(converting && effective ? `Converted at ${effective.toFixed(2)} KES/$` : "Moved");
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <AccountSelect m={m} accounts={accounts} value={fromId} onChange={setFromId} label="From" />
        <AccountSelect m={m} accounts={accounts} value={toId} onChange={setToId} label="To" />
      </div>
      <AmountField value={amount} onChange={setAmount} currency={from?.currency ?? "KES"} label={converting ? `Amount sent (${from?.currency})` : "Amount"} autoFocus />
      {converting && (
        <>
          <AmountField value={received} onChange={setReceived} currency={to!.currency} label={`Amount that landed (${to!.currency})`} />
          {effective && (
            <div className="rounded-2xl bg-sunk p-3 text-[15px]">
              <p>
                Your rate: <strong className="num">{effective.toFixed(2)}</strong> KES/$ · market {market.toFixed(2)}
              </p>
              <p className={cost > 0 ? "text-over" : "text-good"}>
                {cost > 0
                  ? `The conversion cost you about KES ${kes(cost)} (${((cost / (from!.currency === "USD" ? a * market : r * market)) * 100).toFixed(1)}%).`
                  : `You beat the market by KES ${kes(-cost)}.`}
              </p>
            </div>
          )}
        </>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label">Fee ({from?.currency ?? "KES"})</span>
          <input className="field num" inputMode="decimal" placeholder="0" value={fee} onChange={(e) => setFee(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Note</span>
          <input className="field" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      {num(fee) > 0 && <EnvelopePicker value={feeEnv} onChange={setFeeEnv} label="Charge the fee to" />}
      <details>
        <summary className="cursor-pointer text-[14px] font-semibold text-ink-soft">Date</summary>
        <div className="mt-2">
          <WhenField value={when} onChange={setWhen} />
        </div>
      </details>
      <p className="text-[13px] text-ink-faint">Moving between accounts doesn&rsquo;t change any envelope, only where the money sits.</p>
      <button className="btn btn-primary w-full" disabled={!valid || busy}>
        {busy ? "Saving…" : "Save move"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Debt: pay someone back, or record new borrowing (never income)
// ---------------------------------------------------------------------------
function DebtForm({ m, preset, done }: FormProps) {
  const accounts = openAccounts(m);
  const { debtBal, envById, stats } = m.derived;
  const open = m.raw.debts.filter((d) => !d.closed).sort((a, b) => a.priority - b.priority);
  const debtEnv = m.raw.envelopes.find((e) => !e.archived && m.derived.sliceOf(e) === "debt");
  const nextUp = open.find((d) => (debtBal.get(d.id) ?? 0) > 0);
  const [kind, setKind] = useState<"pay" | "borrow">(preset.debtMode ?? "pay");
  const [debtId, setDebtId] = useState(preset.debtId ?? nextUp?.id ?? "new");
  const [newName, setNewName] = useState("");
  const [accountId, setAccountId] = useState(debtEnv?.home_account_id ?? accounts[0]?.id ?? "");
  const [envelopeId, setEnvelopeId] = useState<string | null>(debtEnv?.id ?? null);
  const [amount, setAmount] = useState(preset.amount ? String(preset.amount) : "");
  const [fee, setFee] = useState("");
  const [note, setNote] = useState("");
  const [when, setWhen] = useState(nairobiLocalInput());
  const [busy, setBusy] = useState(false);

  const debt = open.find((d) => d.id === debtId);
  const bal = debt ? debtBal.get(debt.id) ?? 0 : 0;
  const a = num(amount);
  const env = envelopeId ? envById.get(envelopeId) : undefined;
  const envAvail = env ? stats.get(env.id)?.balance ?? 0 : 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (a <= 0 || busy) return;
    setBusy(true);
    let ok: boolean;
    if (kind === "pay") {
      if (!debt) return setBusy(false);
      ok = await m.actions.addTxn({
        kind: "debt_payment",
        account_id: accountId,
        amount: a,
        fee: num(fee),
        rate: 1,
        kes_value: a + num(fee),
        envelope_id: envelopeId,
        debt_id: debt.id,
        category: debt.name,
        note: note.trim() || null,
        at: fromNairobiLocal(when),
      });
      if (ok && bal - a <= 0) await m.actions.saveDebt(debt.id, { closed: true });
    } else {
      ok = await m.actions.borrow(debtId === "new" ? { name: newName.trim() || "New debt" } : { id: debtId }, a, accountId, note.trim() || null);
    }
    setBusy(false);
    if (!ok) return;
    done();
    if (kind === "pay" && debt) m.say(bal - a <= 0 ? `${debt.name} is paid off 🎉` : `${debt.name}: ${kes(bal - a)} left to pay`);
    else m.say("Recorded as debt, not income");
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <Segmented
        label="Pay or borrow"
        value={kind}
        onChange={setKind}
        options={[
          { value: "pay", label: "Pay back" },
          { value: "borrow", label: "Borrowed" },
        ]}
      />
      <label className="block">
        <span className="label">{kind === "pay" ? "Paying" : "Borrowed from"}</span>
        <select className="field" value={debtId} onChange={(e) => setDebtId(e.target.value)}>
          {open.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} · {kes(debtBal.get(d.id) ?? 0)}
            </option>
          ))}
          {kind === "borrow" && <option value="new">Someone new…</option>}
        </select>
      </label>
      {kind === "borrow" && debtId === "new" && (
        <input className="field" placeholder="Their name (or Fuliza, a bank…)" value={newName} onChange={(e) => setNewName(e.target.value)} />
      )}
      <AmountField value={amount} onChange={setAmount} currency="KES" />
      {kind === "pay" && debt && a > 0 && (
        <div className="rounded-2xl bg-sunk p-3 text-[15px]">
          <p>
            {debt.name}: {kes(bal)} → <strong>{kes(Math.max(0, bal - a))}</strong>
          </p>
          {env && (
            <p className={envAvail - a - num(fee) < 0 ? "text-over" : "text-ink-soft"}>
              {env.name} envelope: {kes(envAvail)} → {kes(envAvail - a - num(fee))}
            </p>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <AccountSelect m={m} accounts={accounts.filter((x) => x.currency === "KES")} value={accountId} onChange={setAccountId} label={kind === "pay" ? "Paid from" : "Landed in"} />
        {kind === "pay" && (
          <label className="block">
            <span className="label">Fee</span>
            <input className="field num" inputMode="decimal" placeholder="0" value={fee} onChange={(e) => setFee(e.target.value)} />
          </label>
        )}
      </div>
      {kind === "pay" && <EnvelopePicker value={envelopeId} onChange={setEnvelopeId} label="Paid out of envelope" />}
      {kind === "borrow" && (
        <p className="text-[14px] text-ink-soft">Borrowed money adds to what you owe and shows up as Ready to assign. It&rsquo;s never split like income.</p>
      )}
      <details>
        <summary className="cursor-pointer text-[14px] font-semibold text-ink-soft">Date and note</summary>
        <div className="mt-2 space-y-3">
          <WhenField value={when} onChange={setWhen} />
          <input className="field" placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </details>
      <button className="btn btn-primary w-full" disabled={a <= 0 || busy || (kind === "pay" && !debt)}>
        {busy ? "Saving…" : kind === "pay" ? "Save payment" : "Save borrowing"}
      </button>
    </form>
  );
}
