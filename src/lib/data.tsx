"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  accountBalances,
  accountHomes,
  dayKey,
  debtBalances,
  envelopeEffect,
  envelopeStats,
  hourOf,
  moveSuggestions,
  netWorth,
  readyToAssign,
  type PlanLine,
} from "@/lib/engine";
import { supabase } from "@/lib/supabase/client";
import type { Account, Allocation, Debt, Envelope, Group, Settings, Slice, Snapshot, Txn } from "@/lib/types";

type Raw = {
  settings: Settings;
  accounts: Account[];
  groups: Group[];
  envelopes: Envelope[];
  debts: Debt[];
  txns: Txn[];
  allocations: Allocation[];
  snapshots: Snapshot[];
};

type TxnInput = Partial<Omit<Txn, "id">> & Pick<Txn, "kind" | "account_id" | "amount">;

/** Supabase returns at most 1000 rows per request; page through the rest. */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

function useMaliState() {
  const db = supabase();
  const [raw, setRaw] = useState<Raw | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // set on each load; the epoch placeholder never renders because nothing shows before data arrives
  const [now, setNow] = useState(() => new Date(0));
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const say = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const load = useCallback(async () => {
    try {
      let { data: settings } = await db.from("mali_settings").select("*").maybeSingle();
      if (!settings) {
        const seeded = await db.rpc("mali_seed");
        if (seeded.error) throw seeded.error;
        ({ data: settings } = await db.from("mali_settings").select("*").maybeSingle());
        if (!settings) throw new Error("no settings after seed");
      }
      const [accounts, groups, envelopes, debts, snapshots] = await Promise.all([
        db.from("mali_accounts").select("*").order("sort"),
        db.from("mali_groups").select("*").order("sort"),
        db.from("mali_envelopes").select("*").order("sort"),
        db.from("mali_debts").select("*").order("priority"),
        db.from("mali_snapshots").select("day,assets,liabilities").order("day"),
      ]);
      const failed = [accounts, groups, envelopes, debts, snapshots].find((r) => r.error);
      if (failed?.error) throw failed.error;
      const [txns, allocations] = await Promise.all([
        fetchAll<Txn>((f, t) => db.from("mali_transactions").select("*").eq("counts", true).order("at", { ascending: false }).range(f, t)),
        fetchAll<Allocation>((f, t) => db.from("mali_allocations").select("*").order("at").range(f, t)),
      ]);
      setRaw({
        settings: settings as Settings,
        accounts: (accounts.data ?? []) as Account[],
        groups: (groups.data ?? []) as Group[],
        envelopes: (envelopes.data ?? []) as Envelope[],
        debts: (debts.data ?? []) as Debt[],
        snapshots: (snapshots.data ?? []) as Snapshot[],
        txns,
        allocations,
      });
      setNow(new Date());
      setError(null);
    } catch (e) {
      console.error("load failed", e);
      setError("Couldn't load your money. Check your connection and pull down to retry.");
    }
  }, [db]);

  useEffect(() => {
    // Initial fetch from Supabase; state is set after the network round-trip.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Keep the reference rate fresh (hourly at most).
  const rateChecked = useRef(false);
  useEffect(() => {
    if (!raw || rateChecked.current) return;
    rateChecked.current = true;
    const s = raw.settings;
    if (s.rate_updated_at && Date.now() - Date.parse(s.rate_updated_at) < 3_600_000) return;
    fetch("/api/rate")
      .then((r) => (r.ok ? r.json() : null))
      .then(async (j) => {
        if (!j?.rate) return;
        const rate = Math.round(j.rate * 100) / 100;
        await db.from("mali_settings").update({ usd_kes: rate, rate_updated_at: new Date().toISOString() }).eq("user_id", s.user_id);
        setRaw((r) => (r ? { ...r, settings: { ...r.settings, usd_kes: rate, rate_updated_at: new Date().toISOString() } } : r));
      })
      .catch(() => {});
  }, [raw, db]);

  const derived = useMemo(() => {
    if (!raw) return null;
    const rate = raw.settings.usd_kes;
    const balances = accountBalances(raw.accounts, raw.txns);
    const stats = envelopeStats(raw.envelopes, raw.allocations, raw.txns, now);
    const debtBal = debtBalances(raw.debts, raw.txns);
    const rta = readyToAssign(raw.accounts, balances, stats, rate);
    const worth = netWorth(raw.accounts, balances, raw.debts, debtBal, rate);
    const homes = accountHomes(raw.accounts, balances, raw.envelopes, stats, rate);
    const moves = moveSuggestions(homes);
    const groupById = new Map(raw.groups.map((g) => [g.id, g]));
    const envById = new Map(raw.envelopes.map((e) => [e.id, e]));
    const accById = new Map(raw.accounts.map((a) => [a.id, a]));
    const sliceOf = (e: Envelope | undefined): Slice | undefined => (e ? groupById.get(e.group_id)?.slice : undefined);
    const debtOwed = raw.debts.filter((d) => !d.closed).reduce((s, d) => s + Math.max(0, debtBal.get(d.id) ?? 0), 0);
    const nightEnv = raw.envelopes.find((e) => !e.archived && e.name.toLowerCase() === "night out");
    const tonight =
      raw.settings.night_cap && raw.settings.night_started_at
        ? {
            cap: raw.settings.night_cap,
            started: raw.settings.night_started_at,
            spent: raw.txns
              .filter((t) => t.envelope_id === nightEnv?.id && Date.parse(t.at) >= Date.parse(raw.settings.night_started_at!))
              .reduce((s, t) => s + envelopeEffect(t), 0),
          }
        : null;
    const pendingReviews = raw.txns.filter((t) => t.review === "pending");
    return { balances, stats, debtBal, rta, worth, homes, moves, groupById, envById, accById, sliceOf, debtOwed, nightEnv, tonight, pendingReviews };
  }, [raw, now]);

  // One net-worth snapshot per day.
  const snapped = useRef<string | null>(null);
  useEffect(() => {
    if (!raw || !derived) return;
    const day = dayKey(new Date());
    if (snapped.current === day) return;
    snapped.current = day;
    const row = { user_id: raw.settings.user_id, day, assets: derived.worth.assets, liabilities: derived.worth.liabilities };
    db.from("mali_snapshots").upsert(row, { onConflict: "user_id,day" }).then(({ error: err }) => {
      if (!err) {
        setRaw((r) => (r ? { ...r, snapshots: [...r.snapshots.filter((s) => s.day !== day), row].sort((a, b) => a.day.localeCompare(b.day)) } : r));
      }
    });
  }, [raw, derived, db]);

  // ---- writes: each one saves, then reloads so every screen agrees ----
  const run = useCallback(
    async (label: string, write: () => PromiseLike<{ error: unknown }>) => {
      const { error: err } = await write();
      if (err) {
        console.error(label, err);
        say("That didn't save. Check your connection and try again.");
        return false;
      }
      await load();
      return true;
    },
    [load, say],
  );

  const actions = useMemo(
    () => ({
      addTxn(input: TxnInput) {
        const env = input.envelope_id ? derived?.envById.get(input.envelope_id) : undefined;
        const at = input.at ?? new Date().toISOString();
        const late = hourOf(at) >= 22 || hourOf(at) < 4;
        const review = input.kind === "expense" && env && derived?.sliceOf(env) === "lifestyle" && late ? "pending" : null;
        return run("addTxn", () => db.from("mali_transactions").insert({ review, ...input, at }));
      },
      updateTxn: (id: string, patch: Partial<Txn>) => run("updateTxn", () => db.from("mali_transactions").update(patch).eq("id", id)),
      deleteTxn: (id: string) => run("deleteTxn", () => db.from("mali_transactions").delete().eq("id", id)),
      review: (id: string, review: "worth" | "regret") =>
        run("review", () => db.from("mali_transactions").update({ review }).eq("id", id)),
      recordIncome: (txn: Record<string, unknown>, lines: PlanLine[]) =>
        run("recordIncome", () =>
          db.rpc("mali_record_income", {
            txn,
            allocs: lines.map((l) => ({ envelope_id: l.envelope_id, amount: l.amount, kind: l.kind, note: l.note ?? null })),
          }),
        ),
      /** Move envelope money. from/to null = "Ready to assign". */
      moveMoney(from: string | null, to: string | null, amount: number, note: string | null) {
        const rows: { envelope_id: string; amount: number; kind: "move"; note: string | null }[] = [];
        if (from) rows.push({ envelope_id: from, amount: -amount, kind: "move", note });
        if (to) rows.push({ envelope_id: to, amount, kind: "move", note });
        return run("moveMoney", () => db.from("mali_allocations").insert(rows));
      },
      runSweeps: (lines: PlanLine[]) =>
        run("runSweeps", () =>
          db.from("mali_allocations").insert(lines.map((l) => ({ envelope_id: l.envelope_id, amount: l.amount, kind: "sweep", note: l.note ?? null }))),
        ),
      saveEnvelope: (id: string | null, patch: Partial<Envelope>) =>
        run("saveEnvelope", () => (id ? db.from("mali_envelopes").update(patch).eq("id", id) : db.from("mali_envelopes").insert(patch))),
      saveGroup: (id: string | null, patch: Partial<Group>) =>
        run("saveGroup", () => (id ? db.from("mali_groups").update(patch).eq("id", id) : db.from("mali_groups").insert(patch))),
      saveAccount: (id: string | null, patch: Partial<Account>) =>
        run("saveAccount", () => (id ? db.from("mali_accounts").update(patch).eq("id", id) : db.from("mali_accounts").insert(patch))),
      saveDebt: (id: string | null, patch: Partial<Debt>) =>
        run("saveDebt", () => (id ? db.from("mali_debts").update(patch).eq("id", id) : db.from("mali_debts").insert(patch))),
      /** Borrowed money lands in an account and adds to a debt (new or existing). It is never income. */
      async borrow(debt: { id: string } | { name: string }, amount: number, accountId: string, note: string | null) {
        let debtId = "id" in debt ? debt.id : null;
        if (!debtId) {
          const priority = (raw?.debts.reduce((m, d) => Math.max(m, d.priority), 0) ?? 0) + 1;
          const { data, error: err } = await db
            .from("mali_debts")
            .insert({ name: (debt as { name: string }).name, opening_balance: 0, priority })
            .select("id")
            .single();
          if (err || !data) {
            say("Couldn't add that debt. Try again?");
            return false;
          }
          debtId = data.id as string;
        }
        return run("borrow", () =>
          db.from("mali_transactions").insert({ kind: "borrow", account_id: accountId, amount, debt_id: debtId, note }),
        );
      },
      saveSettings: (patch: Partial<Settings>) =>
        run("saveSettings", () => db.from("mali_settings").update(patch).eq("user_id", raw!.settings.user_id)),
      /** Records the difference between what the app thinks and what the account really holds. */
      reconcile(account: Account, actual: number) {
        const current = derived?.balances.get(account.id) ?? 0;
        const diff = Math.round((actual - current) * 100) / 100;
        if (!diff) return Promise.resolve(true);
        return run("reconcile", () =>
          db.from("mali_transactions").insert({ kind: "adjust", account_id: account.id, amount: diff, category: "Balance check", note: `Set to ${actual}` }),
        );
      },
    }),
    [db, run, derived, raw, say],
  );

  return { raw, derived, error, toast, say, reload: load, now, actions };
}

type MaliState = ReturnType<typeof useMaliState>;
const Ctx = createContext<MaliState | null>(null);

export function MaliProvider({ children }: { children: React.ReactNode }) {
  const state = useMaliState();
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useMali() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMali outside MaliProvider");
  return ctx;
}

/** For screens that only render once data has loaded. */
export function useLoaded() {
  const m = useMali();
  if (!m.raw || !m.derived) return null;
  return { ...m, raw: m.raw, derived: m.derived };
}
export type Loaded = NonNullable<ReturnType<typeof useLoaded>>;
