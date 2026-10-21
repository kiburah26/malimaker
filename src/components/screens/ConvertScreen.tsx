"use client";

import { useState } from "react";
import { useAdd } from "@/components/AppShell";
import { Loading, SectionTitle, Segmented } from "@/components/ui";
import { useLoaded } from "@/lib/data";
import { fmtDay, kes, parseAmount, usd } from "@/lib/format";

export function ConvertScreen() {
  const m = useLoaded();
  const add = useAdd();
  const [dir, setDir] = useState<"usd" | "kes">("usd");
  const [amount, setAmount] = useState("100");
  const [feePct, setFeePct] = useState("1.5");
  const [sent, setSent] = useState("");
  const [got, setGot] = useState("");
  if (!m) return <Loading />;
  const s = m.raw.settings;
  const rate = s.usd_kes;
  const a = parseAmount(amount) || 0;
  const fee = (parseAmount(feePct) || 0) / 100;
  const result = dir === "usd" ? a * (1 - fee) * rate : (a / rate) * (1 - fee);

  const sentN = parseAmount(sent) || 0;
  const gotN = parseAmount(got) || 0;
  const eff = sentN > 0 && gotN > 0 ? gotN / sentN : null;
  const cost = eff ? sentN * rate - gotN : 0;

  const { accById } = m.derived;
  const conversions = m.raw.txns
    .filter((t) => t.kind === "transfer" && accById.get(t.account_id)?.currency !== accById.get(t.to_account_id ?? "")?.currency)
    .slice(0, 12);
  const deel = m.raw.accounts.find((x) => x.kind === "usd");

  return (
    <div className="pt-2">
      <h1 className="font-display text-3xl">Convert</h1>
      <p className="mt-1 text-ink-soft">USD ⇄ KES at today&rsquo;s reference rate, and the real cost of your conversions.</p>

      <div className="card mt-4 p-4">
        <p className="text-[14px] text-ink-soft">Market rate</p>
        <p className="num font-display text-4xl">{rate.toFixed(2)}</p>
        <p className="text-[13px] text-ink-faint">
          KES per $1 · {s.rate_updated_at ? `updated ${fmtDay(s.rate_updated_at)}` : "default rate. It refreshes when the app can reach the rate service."}
        </p>
      </div>

      <SectionTitle>Calculator</SectionTitle>
      <div className="card space-y-3 p-4">
        <Segmented
          label="Direction"
          value={dir}
          onChange={setDir}
          options={[
            { value: "usd", label: "$ → KES" },
            { value: "kes", label: "KES → $" },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Amount ({dir === "usd" ? "$" : "KES"})</span>
            <input className="field num text-xl" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Fees and spread %</span>
            <input className="field num text-xl" inputMode="decimal" value={feePct} onChange={(e) => setFeePct(e.target.value)} />
          </label>
        </div>
        <p className="text-[15px]">
          ≈ <strong className="num font-display text-3xl">{dir === "usd" ? `KES ${kes(result)}` : usd(result)}</strong>
        </p>
      </div>

      <SectionTitle>Check a conversion you did</SectionTitle>
      <div className="card space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">You sent ($)</span>
            <input className="field num" inputMode="decimal" value={sent} onChange={(e) => setSent(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">You got (KES)</span>
            <input className="field num" inputMode="decimal" value={got} onChange={(e) => setGot(e.target.value)} />
          </label>
        </div>
        {eff && (
          <div className="rounded-2xl bg-sunk p-3 text-[15px]">
            <p>
              Your rate: <strong className="num">{eff.toFixed(2)}</strong> vs market {rate.toFixed(2)}
            </p>
            <p className={cost > 0 ? "text-over" : "text-good"}>
              {cost > 0 ? `It cost you KES ${kes(cost)} (${((cost / (sentN * rate)) * 100).toFixed(1)}%).` : `You beat the market by KES ${kes(-cost)}.`}
            </p>
          </div>
        )}
        <button
          type="button"
          className="btn btn-quiet w-full"
          onClick={() => add({ mode: "move", accountId: deel?.id, amount: sentN || undefined })}
        >
          Log a conversion
        </button>
      </div>

      {conversions.length > 0 && (
        <>
          <SectionTitle>Your conversions</SectionTitle>
          <ul className="card ruled px-4">
            {conversions.map((t) => {
              const from = accById.get(t.account_id);
              const r = from?.currency === "USD" ? (t.to_amount ?? 0) / t.amount : t.amount / (t.to_amount || 1);
              return (
                <li key={t.id} className="flex justify-between gap-3 py-3 text-[15px]">
                  <span>
                    <span className="block font-semibold">
                      {from?.currency === "USD" ? usd(t.amount) : `KES ${kes(t.amount)}`} → {accById.get(t.to_account_id ?? "")?.name}
                    </span>
                    <span className="text-[13px] text-ink-faint">{fmtDay(t.at)}</span>
                  </span>
                  <span className="num font-bold">{r.toFixed(2)}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
