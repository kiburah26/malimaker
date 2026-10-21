"use client";

import { useState } from "react";
import { Loading, Segmented } from "@/components/ui";
import { useLoaded } from "@/lib/data";
import { supabase } from "@/lib/supabase/client";
import type { Txn } from "@/lib/types";

function currentTheme(): "dark" | "light" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function SettingsScreen() {
  const m = useLoaded();
  const [theme, setTheme] = useState<"dark" | "light">(currentTheme);
  const [busy, setBusy] = useState(false);
  if (!m) return <Loading />;

  function pickTheme(t: "dark" | "light") {
    setTheme(t);
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem("mali-theme", t);
    } catch {}
  }

  /** Every transaction (including Money Manager history) as a CSV file. */
  async function exportCsv() {
    setBusy(true);
    const rows: Txn[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase().from("mali_transactions").select("*").order("at").range(from, from + 999);
      rows.push(...((data ?? []) as Txn[]));
      if (!data || data.length < 1000) break;
    }
    const { envById, accById } = m!.derived;
    const head = ["date", "kind", "account", "to_account", "amount", "fee", "currency", "kes_value", "envelope", "category", "note", "tags", "source", "counts"];
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = rows.map((t) =>
      [
        t.at,
        t.kind,
        accById.get(t.account_id)?.name,
        t.to_account_id ? accById.get(t.to_account_id)?.name : "",
        t.amount,
        t.fee,
        accById.get(t.account_id)?.currency,
        t.kes_value,
        t.envelope_id ? envById.get(t.envelope_id)?.name : "",
        t.category,
        t.note,
        t.tags.join(" "),
        t.source,
        t.counts,
      ].map(esc).join(","),
    );
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `mali-maker-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    setBusy(false);
  }

  return (
    <div className="space-y-4 pt-2">
      <h1 className="font-display text-3xl">Settings</h1>
      <div className="card space-y-3 p-4">
        <p className="font-bold">Theme</p>
        <Segmented
          label="Theme"
          value={theme}
          onChange={pickTheme}
          options={[
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
          ]}
        />
      </div>
      <div className="card space-y-2 p-4">
        <p className="font-bold">Your data</p>
        <p className="text-[14px] text-ink-soft">Download every transaction as a spreadsheet, including the business-tagged ones for tax.</p>
        <button type="button" className="btn btn-quiet" onClick={exportCsv} disabled={busy}>
          {busy ? "Preparing…" : "Export CSV"}
        </button>
      </div>
      <div className="card space-y-2 p-4">
        <p className="font-bold">Install on your phone</p>
        <p className="text-[14px] text-ink-soft">
          iPhone: open in Safari → Share → Add to Home Screen. Android: Chrome menu → Install app.
        </p>
      </div>
      <button
        type="button"
        className="btn btn-quiet w-full"
        onClick={async () => {
          await supabase().auth.signOut();
          window.location.replace("/login");
        }}
      >
        Sign out
      </button>
    </div>
  );
}
