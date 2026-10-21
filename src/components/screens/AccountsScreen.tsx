"use client";

import { useState } from "react";
import { useAdd } from "@/components/AppShell";
import { Sheet } from "@/components/Sheet";
import { Loading, SectionTitle, Toggle } from "@/components/ui";
import { useLoaded, type Loaded } from "@/lib/data";
import { accountDelta, type AccountHome } from "@/lib/engine";
import { fmtDay, kes, money, parseAmount, usd } from "@/lib/format";
import type { Account, AccountKind } from "@/lib/types";

const KIND_LABEL: Record<AccountKind, string> = {
  bank: "Bank",
  mobile: "Mobile money",
  mmf: "Money market fund",
  crypto: "Crypto",
  usd: "USD wallet",
  cash: "Cash",
  business: "Business money",
};

export function AccountsScreen() {
  const m = useLoaded();
  const add = useAdd();
  const [open, setOpen] = useState<Account | "new" | null>(null);
  if (!m) return <Loading />;
  const { homes, moves, worth } = m.derived;
  const rate = m.raw.settings.usd_kes;

  return (
    <div className="pt-2">
      <h1 className="font-display text-3xl">Accounts</h1>
      <p className="mt-1 text-ink-soft">Where your money sits, and what each shilling there is for.</p>

      <div className="card mt-4 grid grid-cols-3 gap-2 p-4 text-center">
        <div>
          <p className="text-[12px] text-ink-soft">You have</p>
          <p className="num font-bold">{kes(worth.assets)}</p>
        </div>
        <div>
          <p className="text-[12px] text-ink-soft">You owe</p>
          <p className="num font-bold">{kes(worth.liabilities)}</p>
        </div>
        <div>
          <p className="text-[12px] text-ink-soft">Net worth</p>
          <p className={`num font-bold ${worth.net < 0 ? "text-over" : "text-good"}`}>{kes(worth.net)}</p>
        </div>
      </div>

      {moves.length > 0 && (
        <>
          <SectionTitle>Moves to make</SectionTitle>
          <p className="mb-2 text-[14px] text-ink-faint">So each account holds exactly what its envelopes need.</p>
          <ul className="card ruled px-4">
            {moves.map((mv, i) => {
              const amt = mv.from.currency === "USD" ? Math.round((mv.amount / rate) * 100) / 100 : mv.amount;
              return (
                <li key={i} className="flex items-center justify-between gap-3 py-3">
                  <span>
                    <span className="block font-semibold">
                      {mv.from.name} → {mv.to.name}
                    </span>
                    <span className="num text-[14px] text-ink-soft">
                      {mv.from.currency === "USD" ? `${usd(amt)} ≈ ${kes(mv.amount)}` : kes(mv.amount)}
                    </span>
                  </span>
                  <button type="button" className="btn btn-quiet btn-small" onClick={() => add({ mode: "move", accountId: mv.from.id, toAccountId: mv.to.id, amount: amt })}>
                    Log it
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <SectionTitle action={<button type="button" className="text-[14px] font-semibold text-ink-soft underline" onClick={() => setOpen("new")}>+ Add account</button>}>
        Your accounts
      </SectionTitle>
      <div className="space-y-3">
        {homes.map((h) => (
          <AccountCard key={h.account.id} h={h} onOpen={() => setOpen(h.account)} />
        ))}
      </div>

      <AccountSheet m={m} target={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function AccountCard({ h, onOpen }: { h: AccountHome; onOpen: () => void }) {
  const a = h.account;
  return (
    <button type="button" onClick={onOpen} className="card block w-full p-4 text-left">
      <div className="flex items-baseline justify-between gap-3">
        <span>
          <span className="block font-bold">{a.name}</span>
          <span className="text-[13px] text-ink-faint">{KIND_LABEL[a.kind]}</span>
        </span>
        <span className="text-right">
          <span className={`num block text-lg font-bold ${h.balance < 0 ? "text-over" : ""}`}>{money(h.balance, a.currency)}</span>
          {a.currency === "USD" && <span className="num text-[13px] text-ink-faint">≈ {kes(h.kes)}</span>}
        </span>
      </div>
      {!a.spendable ? (
        <p className="mt-2 text-[14px] text-ink-soft">Held for the business. Not in your net worth or spending money.</p>
      ) : (
        <>
          {h.parts.length > 0 && (
            <p className="mt-2 text-[14px] text-ink-soft">
              For: {h.parts.slice(0, 4).map((p) => `${p.envelope.name} ${kes(p.amount)}`).join(" · ")}
              {h.parts.length > 4 && ` · +${h.parts.length - 4} more`}
            </p>
          )}
          {Math.abs(h.diff) >= 100 && (
            <p className={`mt-1 text-[14px] font-semibold ${h.diff < 0 ? "text-over" : "text-gold"}`}>
              {h.diff < 0 ? `Short ${kes(-h.diff)}: move money in` : `${kes(h.diff)} here has no envelope that lives here`}
            </p>
          )}
        </>
      )}
    </button>
  );
}

function AccountSheet({ m, target, onClose }: { m: Loaded; target: Account | "new" | null; onClose: () => void }) {
  const acc = target && target !== "new" ? target : null;
  return (
    <Sheet open={!!target} onClose={onClose} title={acc ? acc.name : "New account"}>
      {target && <AccountForm key={acc?.id ?? "new"} m={m} acc={acc} onClose={onClose} />}
    </Sheet>
  );
}

function AccountForm({ m, acc, onClose }: { m: Loaded; acc: Account | null; onClose: () => void }) {
  const bal = acc ? m.derived.balances.get(acc.id) ?? 0 : 0;
  const [actual, setActual] = useState("");
  const [name, setName] = useState(acc?.name ?? "");
  const [kind, setKind] = useState<AccountKind>(acc?.kind ?? "bank");
  const [currency, setCurrency] = useState(acc?.currency ?? "KES");
  const [opening, setOpening] = useState("");
  const [inNw, setInNw] = useState(acc?.in_net_worth ?? true);
  const [spendable, setSpendable] = useState(acc?.spendable ?? true);
  const [busy, setBusy] = useState(false);
  const recent = acc ? m.raw.txns.filter((t) => t.account_id === acc.id || t.to_account_id === acc.id).slice(0, 10) : [];

  async function check() {
    if (!acc) return;
    const n = parseAmount(actual);
    if (!Number.isFinite(n)) return;
    setBusy(true);
    const ok = await m.actions.reconcile(acc, n);
    setBusy(false);
    if (ok) {
      setActual("");
      m.say(Math.abs(n - bal) < 0.01 ? "Spot on ✓" : `Adjusted by ${money(n - bal, acc.currency)}`);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const patch = { name: name.trim() || "Account", kind, currency, in_net_worth: inNw, spendable };
    const ok = acc
      ? await m.actions.saveAccount(acc.id, patch)
      : await m.actions.saveAccount(null, { ...patch, opening_balance: parseAmount(opening) || 0, sort: 99 });
    setBusy(false);
    if (ok) {
      m.say("Saved");
      onClose();
    }
  }

  return (
    <div className="space-y-5">
      {acc && (
        <div className="rounded-2xl bg-sunk p-4">
          <p className="text-[14px] text-ink-soft">The app says</p>
          <p className="num font-display text-3xl">{money(bal, acc.currency)}</p>
          <p className="mt-2 text-[14px] text-ink-soft">Check it against your real balance now and then:</p>
          <div className="mt-2 flex gap-2">
            <input className="field num" inputMode="decimal" placeholder="Real balance" value={actual} onChange={(e) => setActual(e.target.value)} aria-label="Real balance" />
            <button type="button" className="btn btn-primary shrink-0" disabled={busy || !actual} onClick={check}>
              Check
            </button>
          </div>
          <p className="mt-2 text-[12px] text-ink-faint">A difference is logged as an adjustment and shows up in Ready to assign.</p>
        </div>
      )}

      <form onSubmit={save} className="space-y-3">
        <label className="block">
          <span className="label">Name</span>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Type</span>
            <select className="field" value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
              {Object.entries(KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Currency</span>
            <select className="field" value={currency} onChange={(e) => setCurrency(e.target.value as "KES" | "USD")} disabled={!!acc}>
              <option value="KES">KES</option>
              <option value="USD">USD (or USDT)</option>
            </select>
          </label>
        </div>
        {!acc && (
          <label className="block">
            <span className="label">Balance today</span>
            <input className="field num" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0" />
          </label>
        )}
        <Toggle checked={spendable} onChange={setSpendable} label="My money" hint="Off for money you only hold for someone else" />
        <Toggle checked={inNw} onChange={setInNw} label="Count in net worth" />
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Saving…" : acc ? "Save changes" : "Add account"}
        </button>
        {acc && (
          <button
            type="button"
            className="btn w-full text-ink-soft"
            onClick={async () => (await m.actions.saveAccount(acc.id, { archived: !acc.archived })) && onClose()}
          >
            {acc.archived ? "Unarchive" : "Archive account"}
          </button>
        )}
      </form>

      {recent.length > 0 && (
        <div>
          <p className="label">Recent</p>
          <ul className="ruled text-[15px]">
            {recent.map((t) => {
              const d = accountDelta(t, acc!.id);
              return (
                <li key={t.id} className="flex justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">
                    {t.note || t.category || t.kind} <span className="text-[13px] text-ink-faint">· {fmtDay(t.at)}</span>
                  </span>
                  <span className={`num shrink-0 font-bold ${d > 0 ? "text-good" : ""}`}>{money(d, acc!.currency)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
