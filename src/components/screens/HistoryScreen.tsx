"use client";

import { useEffect, useMemo, useState } from "react";
import { EnvelopePicker } from "@/components/EnvelopePicker";
import { Sheet } from "@/components/Sheet";
import { Bar, Loading, Toggle } from "@/components/ui";
import { useLoaded, type Loaded } from "@/lib/data";
import { addMonths, dayKey, monthKey } from "@/lib/engine";
import { fmtDay, fmtMonth, fmtTime, fromNairobiLocal, kes, nairobiLocalInput, parseAmount, usd } from "@/lib/format";
import { supabase } from "@/lib/supabase/client";
import type { Txn } from "@/lib/types";

const KIND_LABEL: Record<Txn["kind"], string> = {
  expense: "Spent",
  income: "Income",
  transfer: "Transfer",
  debt_payment: "Debt payment",
  borrow: "Borrowed",
  adjust: "Balance check",
};

/** KES value of a row, for history (imported rows don't carry envelope effects). */
const value = (t: Txn) => t.kes_value ?? (t.amount + (t.kind === "income" ? 0 : t.fee)) * t.rate;

export function HistoryScreen() {
  const m = useLoaded();
  const [picked, setMonth] = useState<string | null>(null);
  const month = picked ?? (m ? monthKey(m.now) : "");
  const [withImported, setWithImported] = useState(true);
  const [imported, setImported] = useState<Record<string, Txn[]>>({});
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [open, setOpen] = useState<Txn | null>(null);

  useEffect(() => {
    if (!month || !withImported || imported[month]) return;
    const from = new Date(`${month}-01T00:00:00+03:00`).toISOString();
    const to = new Date(`${addMonths(month, 1)}-01T00:00:00+03:00`).toISOString();
    supabase()
      .from("mali_transactions")
      .select("*")
      .eq("counts", false)
      .gte("at", from)
      .lt("at", to)
      .order("at", { ascending: false })
      .then(({ data }) => setImported((x) => ({ ...x, [month]: (data ?? []) as Txn[] })));
  }, [month, withImported, imported]);

  const rows = useMemo(() => {
    if (!m) return [];
    const own = m.raw.txns.filter((t) => monthKey(t.at) === month);
    const old = withImported ? imported[month] ?? [] : [];
    return [...own, ...old].sort((a, b) => b.at.localeCompare(a.at));
  }, [m, month, withImported, imported]);

  if (!m) return <Loading />;
  const { envById, groupById, accById } = m.derived;
  const groupOf = (t: Txn) => (t.envelope_id ? groupById.get(envById.get(t.envelope_id)?.group_id ?? "") : undefined);

  const spends = rows.filter((t) => t.kind === "expense" || t.kind === "debt_payment");
  const byGroup = new Map<string, number>();
  for (const t of spends) {
    const g = groupOf(t);
    const key = g?.id ?? (t.category === "Transaction fee" ? "fees" : "other");
    byGroup.set(key, (byGroup.get(key) ?? 0) + value(t));
  }
  const groupRows = [...byGroup.entries()].sort((a, b) => b[1] - a[1]);
  const maxGroup = Math.max(1, ...groupRows.map(([, v]) => v));
  const spent = spends.reduce((s, t) => s + value(t), 0);
  const income = rows.filter((t) => t.kind === "income").reduce((s, t) => s + value(t), 0);
  const fees = rows.reduce((s, t) => s + (t.kind !== "income" ? t.fee * t.rate : 0), 0) +
    rows.filter((t) => t.category === "Transaction fee").reduce((s, t) => s + value(t), 0);

  const shown = groupFilter
    ? rows.filter((t) => (groupOf(t)?.id ?? (t.category === "Transaction fee" ? "fees" : "other")) === groupFilter && (t.kind === "expense" || t.kind === "debt_payment"))
    : rows;
  const days = new Map<string, Txn[]>();
  for (const t of shown) days.set(dayKey(t.at), [...(days.get(dayKey(t.at)) ?? []), t]);

  const groupLabel = (id: string) =>
    id === "fees" ? "💸 Transaction fees" : id === "other" ? "• Other" : `${groupById.get(id)?.emoji} ${groupById.get(id)?.name}`;

  return (
    <div className="pt-2">
      <div className="flex items-center justify-between">
        <button type="button" className="btn btn-quiet btn-small" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">
          ‹
        </button>
        <h1 className="font-display text-2xl">{fmtMonth(month)}</h1>
        <button
          type="button"
          className="btn btn-quiet btn-small"
          onClick={() => setMonth(addMonths(month, 1))}
          disabled={month >= monthKey(m.now)}
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="card mt-4 grid grid-cols-3 gap-2 p-4 text-center">
        <div>
          <p className="text-[12px] text-ink-soft">In</p>
          <p className="num font-bold text-good">{kes(income)}</p>
        </div>
        <div>
          <p className="text-[12px] text-ink-soft">Spent</p>
          <p className="num font-bold">{kes(spent)}</p>
        </div>
        <div>
          <p className="text-[12px] text-ink-soft">Fees</p>
          <p className="num font-bold">{kes(fees)}</p>
        </div>
      </div>

      <div className="mt-2">
        <Toggle checked={withImported} onChange={setWithImported} label="Include Money Manager history" hint="Shown for insight only; never changes balances" />
      </div>

      {groupRows.length > 0 && (
        <div className="card mt-2 p-4">
          <p className="mb-2 font-bold">Where it went</p>
          <ul className="space-y-2">
            {groupRows.map(([id, v]) => (
              <li key={id}>
                <button type="button" className="block w-full text-left" onClick={() => setGroupFilter(groupFilter === id ? null : id)} aria-pressed={groupFilter === id}>
                  <div className="flex justify-between text-[14px]">
                    <span className={groupFilter === id ? "font-bold underline" : ""}>{groupLabel(id)}</span>
                    <span className="num font-semibold">{kes(v)}</span>
                  </div>
                  <Bar value={v} max={maxGroup} tone="gold" label={groupLabel(id)} />
                </button>
              </li>
            ))}
          </ul>
          {groupFilter && (
            <button type="button" className="mt-2 text-[14px] font-semibold underline" onClick={() => setGroupFilter(null)}>
              Show everything
            </button>
          )}
        </div>
      )}

      {[...days.entries()].map(([day, list]) => (
        <section key={day} className="mt-5">
          <h2 className="mb-1 text-[14px] font-bold text-ink-soft">{fmtDay(day + "T12:00:00+03:00")}</h2>
          <ul className="card ruled px-4">
            {list.map((t) => {
              const sign = t.kind === "income" || t.kind === "borrow" ? "+" : t.kind === "transfer" || t.kind === "adjust" ? "" : "−";
              const acc = accById.get(t.account_id);
              return (
                <li key={t.id}>
                  <button type="button" className="flex w-full items-center justify-between gap-3 py-2.5 text-left" onClick={() => t.counts && setOpen(t)} disabled={!t.counts}>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {t.kind === "transfer"
                          ? `${acc?.name} → ${accById.get(t.to_account_id ?? "")?.name}`
                          : t.note || t.category || (t.envelope_id && envById.get(t.envelope_id)?.name) || KIND_LABEL[t.kind]}
                      </span>
                      <span className="text-[13px] text-ink-faint">
                        {fmtTime(t.at)} · {t.envelope_id ? envById.get(t.envelope_id)?.name : t.kind === "income" ? "Income" : t.kind === "borrow" ? "Borrowed" : acc?.name}
                        {!t.counts && " · Money Manager"}
                        {t.tags.includes("business") && " · business"}
                        {t.review === "regret" && " · regret"}
                      </span>
                    </span>
                    <span className={`num shrink-0 font-bold ${sign === "+" ? "text-good" : ""}`}>
                      {sign}
                      {acc?.currency === "USD" && t.kind !== "expense" ? usd(t.amount) : kes(value(t))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {rows.length === 0 && <p className="mt-6 text-center text-ink-faint">Nothing logged this month.</p>}

      <TxnSheet m={m} t={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function TxnSheet({ m, t, onClose }: { m: Loaded; t: Txn | null; onClose: () => void }) {
  return (
    <Sheet open={!!t} onClose={onClose} title={t ? t.note || t.category || "Transaction" : ""}>
      {t && <TxnDetail key={t.id} m={m} t={t} onClose={onClose} />}
    </Sheet>
  );
}

function TxnDetail({ m, t, onClose }: { m: Loaded; t: Txn; onClose: () => void }) {
  const { accById } = m.derived;
  const acc = accById.get(t.account_id);
  const unit = acc?.currency === "USD" ? "$" : "KES";
  const isIncome = t.kind === "income";
  const hasEnvelope = t.kind === "expense" || t.kind === "debt_payment";
  const linkedAllocs = isIncome ? m.raw.allocations.filter((a) => a.txn_id === t.id).length : 0;
  const [f, setF] = useState({
    amount: String(t.amount),
    fee: t.fee ? String(t.fee) : "",
    toAmount: t.to_amount != null ? String(t.to_amount) : "",
    accountId: t.account_id,
    envelopeId: t.envelope_id,
    when: nairobiLocalInput(new Date(t.at)),
    note: t.note ?? "",
    business: t.tags.includes("business"),
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const amount = parseAmount(f.amount);
  const fee = parseAmount(f.fee) || 0;
  const valid = isIncome || (t.kind === "adjust" ? Number.isFinite(amount) : amount > 0);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    const patch: Partial<Txn> = {
      at: fromNairobiLocal(f.when),
      note: f.note.trim() || null,
      tags: f.business ? [...new Set([...t.tags, "business"])] : t.tags.filter((x) => x !== "business"),
    };
    if (!isIncome) {
      const rate = accById.get(f.accountId)?.currency === "USD" ? t.rate : 1;
      Object.assign(patch, { amount, fee, account_id: f.accountId, rate });
      if (hasEnvelope) Object.assign(patch, { envelope_id: f.envelopeId, kes_value: Math.round((amount + fee) * rate * 100) / 100 });
      if (t.kind === "transfer") {
        const converting = accById.get(f.accountId)?.currency !== accById.get(t.to_account_id ?? "")?.currency;
        Object.assign(patch, {
          to_amount: converting ? parseAmount(f.toAmount) || amount : amount,
          kes_value: t.envelope_id && fee ? Math.round(fee * rate * 100) / 100 : null,
        });
      }
    }
    const ok = await m.actions.updateTxn(t.id, patch);
    setBusy(false);
    if (ok) {
      m.say("Updated");
      onClose();
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      {isIncome ? (
        <p className="rounded-2xl bg-sunk p-3 text-[14px] text-ink-soft">
          {unit} {f.amount} received{t.fee > 0 && `, after a ${unit} ${t.fee} fee`}. It was split into {linkedAllocs} envelopes, so the amount
          can&rsquo;t be edited here. To change it, delete this and log the income again, and it splits afresh.
        </p>
      ) : (
        <div className="grid grid-cols-[1fr_7.5rem] gap-3">
          <label className="block">
            <span className="label">Amount ({unit})</span>
            <input className="field num text-xl" inputMode="decimal" value={f.amount} onChange={(e) => set("amount", e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Fee ({unit})</span>
            <input className="field num text-xl" inputMode="decimal" placeholder="0" value={f.fee} onChange={(e) => set("fee", e.target.value)} />
          </label>
        </div>
      )}
      {t.kind === "transfer" && accById.get(t.account_id)?.currency !== accById.get(t.to_account_id ?? "")?.currency && (
        <label className="block">
          <span className="label">Amount that landed ({accById.get(t.to_account_id ?? "")?.currency})</span>
          <input className="field num" inputMode="decimal" value={f.toAmount} onChange={(e) => set("toAmount", e.target.value)} />
        </label>
      )}
      {hasEnvelope && <EnvelopePicker value={f.envelopeId} onChange={(id) => set("envelopeId", id)} label="Envelope" />}
      {!isIncome && (
        <label className="block">
          <span className="label">{t.kind === "transfer" ? "From account" : "Account"}</span>
          <select className="field" value={f.accountId} onChange={(e) => set("accountId", e.target.value)}>
            {m.raw.accounts
              .filter((a) => !a.archived && a.currency === acc?.currency)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </label>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label">When</span>
          <input type="datetime-local" className="field" value={f.when} onChange={(e) => set("when", e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Note</span>
          <input className="field" value={f.note} onChange={(e) => set("note", e.target.value)} />
        </label>
      </div>
      {hasEnvelope && <Toggle checked={f.business} onChange={(v) => set("business", v)} label="Business expense" hint="Tagged for tax filing" />}
      {hasEnvelope && amount > 0 && (
        <p className="text-[14px] text-ink-soft">
          Comes out of {m.derived.envById.get(f.envelopeId ?? "")?.name ?? "no envelope"}: {kes((amount + fee) * (acc?.currency === "USD" ? t.rate : 1))}
          {fee > 0 && " including the fee"}.
        </p>
      )}
      <button className="btn btn-primary w-full" disabled={!valid || busy}>
        {busy ? "Saving…" : "Save changes"}
      </button>
      <button
        type="button"
        className="btn w-full text-over"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          if (await m.actions.deleteTxn(t.id)) {
            m.say(linkedAllocs ? "Deleted, and its split was undone" : "Deleted");
            onClose();
          }
          setBusy(false);
        }}
      >
        Delete{linkedAllocs ? " (undoes its split too)" : ""}
      </button>
    </form>
  );
}
