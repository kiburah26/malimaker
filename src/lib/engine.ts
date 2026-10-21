// The Mali Maker budget engine: pure functions, no I/O.
// Money in envelopes is always KES. Account balances are in the account's currency.
// Kept free of runtime imports so it runs under `node --test` as well as in Next.
import type {
  Account,
  Allocation,
  Currency,
  Debt,
  Envelope,
  Group,
  Settings,
  Slice,
  SurplusSlice,
  Txn,
} from "./types";

// ---------------------------------------------------------------------------
// dates — Nairobi is UTC+3 all year, so a fixed offset is exact
// ---------------------------------------------------------------------------
const NAIROBI_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;

const shifted = (at: string | Date) => new Date(new Date(at).getTime() + NAIROBI_MS);

/** "2026-10-21" in Nairobi time. */
export const dayKey = (at: string | Date) => shifted(at).toISOString().slice(0, 10);
/** "2026-10" in Nairobi time. */
export const monthKey = (at: string | Date) => dayKey(at).slice(0, 7);
/** Hour of day (0–23) in Nairobi time. */
export const hourOf = (at: string | Date) => shifted(at).getUTCHours();

/** Monday of the week containing `at`, as "YYYY-MM-DD" (Nairobi time). */
export function weekKey(at: string | Date): string {
  const d = shifted(at);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(d.getTime() - dow * DAY_MS).toISOString().slice(0, 10);
}

export const addDays = (key: string, n: number) =>
  new Date(Date.parse(key + "T00:00:00Z") + n * DAY_MS).toISOString().slice(0, 10);

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Whole months from `fromMonth` to `toMonth` (same month = 0). */
export function monthsBetween(fromMonth: string, toMonth: string): number {
  const [y1, m1] = fromMonth.split("-").map(Number);
  const [y2, m2] = toMonth.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

// ---------------------------------------------------------------------------
// money
// ---------------------------------------------------------------------------
export const toKes = (amount: number, currency: Currency, usdKes: number) =>
  currency === "USD" ? amount * usdKes : amount;

/** Envelope money is kept in whole shillings. */
const whole = (n: number) => Math.round(n);

export function monthlyTarget(e: Pick<Envelope, "target" | "period">): number {
  return e.period === "week" ? (e.target * 52) / 12 : e.target;
}

/** What an envelope has to spend this month: its target, or for share envelopes, what came in. */
export function monthBudget(e: Pick<Envelope, "target" | "period" | "share">, stat: Pick<EnvStat, "fundedThisMonth"> | undefined): number {
  return (e.share ?? 0) > 0 ? stat?.fundedThisMonth ?? 0 : monthlyTarget(e);
}

// ---------------------------------------------------------------------------
// effects of a transaction
// ---------------------------------------------------------------------------

/** KES taken out of the transaction's envelope (0 if none). */
export function envelopeEffect(t: Txn): number {
  if (!t.counts || !t.envelope_id) return 0;
  if (t.kind === "expense" || t.kind === "debt_payment") {
    return t.kes_value ?? (t.amount + t.fee) * t.rate;
  }
  // A transfer's own fee can be charged to the envelope it was made for.
  if (t.kind === "transfer") return t.kes_value ?? t.fee * t.rate;
  return 0;
}

/** Change to an account's balance, in that account's currency. */
export function accountDelta(t: Txn, accountId: string): number {
  if (!t.counts) return 0;
  let d = 0;
  if (t.account_id === accountId) {
    if (t.kind === "expense" || t.kind === "debt_payment" || t.kind === "transfer") d -= t.amount + t.fee;
    else d += t.amount; // income, borrow, adjust (signed)
  }
  if (t.kind === "transfer" && t.to_account_id === accountId) d += t.to_amount ?? t.amount;
  return d;
}

export function accountBalances(accounts: Account[], txns: Txn[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const a of accounts) out.set(a.id, a.opening_balance);
  for (const t of txns) {
    if (!t.counts) continue;
    for (const id of [t.account_id, t.to_account_id]) {
      if (id && out.has(id)) out.set(id, out.get(id)! + accountDelta(t, id));
    }
    // a transfer to the same account would be counted twice above
    if (t.kind === "transfer" && t.account_id === t.to_account_id && out.has(t.account_id)) {
      out.set(t.account_id, out.get(t.account_id)! - accountDelta(t, t.account_id));
    }
  }
  return out;
}

export function debtBalances(debts: Debt[], txns: Txn[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of debts) out.set(d.id, d.opening_balance);
  for (const t of txns) {
    if (!t.counts || !t.debt_id || !out.has(t.debt_id)) continue;
    if (t.kind === "borrow") out.set(t.debt_id, out.get(t.debt_id)! + t.amount);
    if (t.kind === "debt_payment") out.set(t.debt_id, out.get(t.debt_id)! - t.amount);
  }
  return out;
}

// ---------------------------------------------------------------------------
// envelopes
// ---------------------------------------------------------------------------
export type EnvStat = {
  balance: number;
  fundedThisMonth: number; // from income splits only
  spentThisMonth: number;
  spentThisWeek: number;
  spentLastWeek: number;
  /** Week envelopes: this week's allowance after last week's overspend. */
  weekLimit: number;
};

export function envelopeStats(
  envelopes: Envelope[],
  allocations: Allocation[],
  txns: Txn[],
  now: Date = new Date(),
): Map<string, EnvStat> {
  const month = monthKey(now);
  const week = weekKey(now);
  const lastWeek = addDays(week, -7);
  const out = new Map<string, EnvStat>();
  for (const e of envelopes) {
    out.set(e.id, { balance: 0, fundedThisMonth: 0, spentThisMonth: 0, spentThisWeek: 0, spentLastWeek: 0, weekLimit: 0 });
  }
  for (const a of allocations) {
    const s = out.get(a.envelope_id);
    if (!s) continue;
    s.balance += a.amount;
    if (a.kind === "income" && monthKey(a.at) === month) s.fundedThisMonth += a.amount;
  }
  for (const t of txns) {
    const eff = envelopeEffect(t);
    if (!eff) continue;
    const s = out.get(t.envelope_id!);
    if (!s) continue;
    s.balance -= eff;
    if (monthKey(t.at) === month) s.spentThisMonth += eff;
    const wk = weekKey(t.at);
    if (wk === week) s.spentThisWeek += eff;
    else if (wk === lastWeek) s.spentLastWeek += eff;
  }
  for (const e of envelopes) {
    const s = out.get(e.id)!;
    s.weekLimit = e.target - Math.max(0, s.spentLastWeek - e.target);
  }
  return out;
}

/** Cash you hold that no envelope has claimed yet (can be negative = over-assigned). */
export function readyToAssign(
  accounts: Account[],
  balances: Map<string, number>,
  stats: Map<string, EnvStat>,
  usdKes: number,
): number {
  let cash = 0;
  for (const a of accounts) {
    if (a.archived || !a.spendable) continue;
    cash += toKes(balances.get(a.id) ?? 0, a.currency, usdKes);
  }
  let assigned = 0;
  for (const s of stats.values()) assigned += s.balance;
  return whole(cash - assigned);
}

export function netWorth(
  accounts: Account[],
  balances: Map<string, number>,
  debts: Debt[],
  debtBal: Map<string, number>,
  usdKes: number,
) {
  let assets = 0;
  for (const a of accounts) {
    if (a.archived || !a.in_net_worth) continue;
    assets += toKes(balances.get(a.id) ?? 0, a.currency, usdKes);
  }
  let liabilities = 0;
  for (const d of debts) if (!d.closed) liabilities += Math.max(0, debtBal.get(d.id) ?? 0);
  return { assets: whole(assets), liabilities: whole(liabilities), net: whole(assets - liabilities) };
}

// ---------------------------------------------------------------------------
// the split — what one income does
// ---------------------------------------------------------------------------
export type PlanLine = {
  envelope_id: string;
  amount: number;
  kind: "income" | "sweep";
  slice: Slice;
  note?: string;
};

export type SplitPlan = {
  lines: PlanLine[];
  tax: number;
  needs: number;
  surplus: number;
  bySlice: Record<Slice, number>;
  /** How much Needs and Lifestyle envelopes are short of their share this paycheck. */
  short: { needs: number; lifestyle: number };
};

export type PlanInput = {
  kes: number;
  taxable: boolean;
  settings: Pick<Settings, "tax_pct" | "tax_fixed" | "split" | "paychecks_per_month">;
  groups: Group[];
  envelopes: Envelope[];
  stats: Map<string, Pick<EnvStat, "balance" | "fundedThisMonth">>;
  /** Total still owed on open debts. */
  debtOwed: number;
};

const SURPLUS_ORDER: SurplusSlice[] = ["lifestyle", "sinking", "debt", "emergency", "invest"];

/** This paycheck's fair share for a spending envelope. */
function shareFor(e: Envelope, funded: number, ppm: number): number {
  const mt = monthlyTarget(e);
  const left = Math.max(0, mt - funded);
  return e.fill === "first" ? left : Math.min(left, mt / ppm);
}

/** Gives each envelope its want, scaled down evenly if the pot is too small. Returns what's left. */
function fillWants(
  pot: number,
  wants: { e: Envelope; want: number }[],
  give: (e: Envelope, amount: number) => void,
): { left: number; short: number } {
  const total = wants.reduce((s, w) => s + w.want, 0);
  if (total <= 0) return { left: pot, short: 0 };
  const scale = Math.min(1, pot / total);
  let used = 0;
  for (const w of wants) {
    const amt = Math.floor(w.want * scale); // round down so the shares never exceed the pot
    if (amt > 0) {
      give(w.e, amt);
      used += amt;
    }
  }
  return { left: Math.max(0, pot - used), short: whole(Math.max(0, total - pot)) };
}

export function planIncome(input: PlanInput): SplitPlan {
  const { settings, groups } = input;
  const ppm = Math.max(1, settings.paychecks_per_month);
  const sliceOf = new Map(groups.map((g) => [g.id, g.slice]));
  const sortKey = new Map(groups.map((g) => [g.id, g.sort]));
  const active = input.envelopes
    .filter((e) => !e.archived && sliceOf.has(e.group_id))
    .sort((a, b) => (sortKey.get(a.group_id)! - sortKey.get(b.group_id)!) || a.sort - b.sort);
  const of = (slice: Slice) => active.filter((e) => sliceOf.get(e.group_id) === slice);
  const stat = (e: Envelope) => input.stats.get(e.id) ?? { balance: 0, fundedThisMonth: 0 };

  const lines: PlanLine[] = [];
  const given = new Map<string, number>();
  const bySlice = { tax: 0, needs: 0, lifestyle: 0, sinking: 0, debt: 0, emergency: 0, invest: 0 } as Record<Slice, number>;
  const give = (e: Envelope, amount: number) => {
    if (amount <= 0) return;
    const slice = sliceOf.get(e.group_id)!;
    lines.push({ envelope_id: e.id, amount, kind: "income", slice });
    given.set(e.id, (given.get(e.id) ?? 0) + amount);
    bySlice[slice] += amount;
  };
  const balanceAfter = (e: Envelope) => stat(e).balance + (given.get(e.id) ?? 0);

  let remaining = whole(input.kes);

  // 1. Tax comes off the top: a fixed amount a month (split across paychecks), or a percentage
  const taxEnv = of("tax")[0];
  let tax = 0;
  if (input.taxable && taxEnv) {
    if (settings.tax_fixed != null) {
      const left = Math.max(0, settings.tax_fixed - stat(taxEnv).fundedThisMonth);
      tax = Math.min(remaining, Math.floor(Math.min(left, settings.tax_fixed / ppm)));
    } else {
      tax = whole((remaining * settings.tax_pct) / 100);
    }
  }
  if (taxEnv) give(taxEnv, tax);
  remaining -= tax;

  // 2. Needs, filled to their monthly targets
  const needWants = of("needs").map((e) => ({ e, want: shareFor(e, stat(e).fundedThisMonth, ppm) }));
  const needsFill = fillWants(remaining, needWants, give);
  const needs = remaining - needsFill.left;
  remaining = needsFill.left;

  // 3. Split what's left by percentage
  const surplus = remaining;
  const pct = SURPLUS_ORDER.reduce((s, k) => s + (settings.split[k] ?? 0), 0) || 100;
  const pots = {} as Record<SurplusSlice, number>;
  let potted = 0;
  for (const k of SURPLUS_ORDER) {
    pots[k] = Math.floor((surplus * (settings.split[k] ?? 0)) / pct);
    potted += pots[k];
  }
  pots.emergency += surplus - potted; // rounding crumbs

  // 4. Lifestyle. With shares set, the whole pot is divided by share, so it grows and shrinks
  //    with income. Without shares, envelopes fill up to their targets and the rest is saved.
  const lifestyle = of("lifestyle");
  const shares = lifestyle.filter((e) => (e.share ?? 0) > 0);
  let lifeFill: { left: number; short: number };
  if (shares.length) {
    const total = shares.reduce((s, e) => s + e.share!, 0);
    lifeFill = fillWants(pots.lifestyle, shares.map((e) => ({ e, want: (pots.lifestyle * e.share!) / total })), give);
    lifeFill.short = 0;
  } else {
    lifeFill = fillWants(pots.lifestyle, lifestyle.map((e) => ({ e, want: shareFor(e, stat(e).fundedThisMonth, ppm) })), give);
  }
  let overflow = lifeFill.left;

  // 5. Sinking funds: steady monthly ones first, then goals in priority order
  const sinking = of("sinking");
  const steady = sinking
    .filter((e) => e.target > 0)
    .map((e) => ({ e, want: shareFor(e, stat(e).fundedThisMonth, ppm) }));
  let sinkLeft = fillWants(pots.sinking, steady, give).left;
  for (const e of [...sinking].filter((x) => x.goal_amount).sort((a, b) => a.priority - b.priority)) {
    if (sinkLeft <= 0) break;
    const need = Math.max(0, whole(e.goal_amount! - balanceAfter(e)));
    const amt = Math.min(need, sinkLeft);
    give(e, amt);
    sinkLeft -= amt;
  }
  overflow += sinkLeft;

  // 6. Debt: hold money for repayments until everything owed is covered, then invest it
  const debtEnv = of("debt")[0];
  let toInvest = 0;
  if (debtEnv) {
    const need = Math.max(0, whole(input.debtOwed - balanceAfter(debtEnv)));
    const amt = Math.min(need, pots.debt);
    give(debtEnv, amt);
    toInvest += pots.debt - amt;
  } else {
    toInvest += pots.debt;
  }

  // 7. Emergency fund (plus anything Lifestyle or Sinking didn't need), up to its goal
  const efPot = pots.emergency + overflow;
  const efEnv = of("emergency")[0];
  if (efEnv) {
    const room = efEnv.goal_amount ? Math.max(0, whole(efEnv.goal_amount - balanceAfter(efEnv))) : efPot;
    const amt = Math.min(room, efPot);
    give(efEnv, amt);
    toInvest += efPot - amt;
  } else {
    toInvest += efPot;
  }

  // 8. Investments take the rest
  const invEnv = of("invest")[0];
  if (invEnv) give(invEnv, pots.invest + toInvest);

  return {
    lines,
    tax,
    needs,
    surplus,
    bySlice,
    short: { needs: needsFill.short, lifestyle: lifeFill.short },
  };
}

/**
 * Month-end sweeps: leftovers in envelopes with a sweep target move there.
 * Runs once per month, before the month's first income is split.
 */
export function planSweeps(
  envelopes: Envelope[],
  stats: Map<string, Pick<EnvStat, "balance">>,
  allocations: Allocation[],
  now: Date = new Date(),
): PlanLine[] {
  const month = monthKey(now);
  if (allocations.some((a) => a.kind === "sweep" && monthKey(a.at) === month)) return [];
  const lines: PlanLine[] = [];
  for (const e of envelopes) {
    if (e.archived || !e.sweep_to_id) continue;
    const bal = whole(stats.get(e.id)?.balance ?? 0);
    if (bal <= 0) continue;
    // only sweep what was left over from an earlier month
    const fundedNow = allocations
      .filter((a) => a.envelope_id === e.id && a.kind === "income" && monthKey(a.at) === month)
      .reduce((s, a) => s + a.amount, 0);
    const amt = whole(bal - fundedNow);
    if (amt <= 0) continue;
    const note = `Leftover from ${e.name}`;
    lines.push({ envelope_id: e.id, amount: -amt, kind: "sweep", slice: "lifestyle", note });
    lines.push({ envelope_id: e.sweep_to_id, amount: amt, kind: "sweep", slice: "sinking", note });
  }
  return lines;
}

/** True when nothing has been split from income yet this month. */
export const firstIncomeOfMonth = (allocations: Allocation[], now: Date = new Date()) =>
  !allocations.some((a) => a.kind === "income" && monthKey(a.at) === monthKey(now));

// ---------------------------------------------------------------------------
// goals
// ---------------------------------------------------------------------------
/** A pace needs about a month of income splits behind it; one paycheck isn't a trend. */
export const PACE_MIN_DAYS = 28;

function firstIncomeAt(allocations: Allocation[]): number | null {
  let first: number | null = null;
  for (const a of allocations) {
    if (a.kind !== "income") continue;
    const t = Date.parse(a.at);
    if (first === null || t < first) first = t;
  }
  return first;
}

export function hasPaceHistory(allocations: Allocation[], now: Date = new Date()): boolean {
  const first = firstIncomeAt(allocations);
  return first !== null && (now.getTime() - first) / DAY_MS >= PACE_MIN_DAYS;
}

/**
 * Average KES a month added by these allocations over the last two months (or since income
 * logging began, if sooner). Null until there's about a month of history.
 */
export function paceOf(rows: Allocation[], allocations: Allocation[], now: Date = new Date()): number | null {
  const first = firstIncomeAt(allocations);
  if (first === null) return null;
  const days = Math.min(61, (now.getTime() - first) / DAY_MS);
  if (days < PACE_MIN_DAYS) return null;
  const since = now.getTime() - days * DAY_MS;
  const added = rows
    .filter((a) => a.amount > 0 && a.kind !== "opening" && Date.parse(a.at) >= since)
    .reduce((s, a) => s + a.amount, 0);
  return whole(added / (days / 30.44));
}

export type GoalProgress = {
  saved: number;
  goal: number;
  pct: number;
  monthsLeft: number | null;
  neededPerMonth: number | null;
  pacePerMonth: number;
  projectedMonth: string | null;
  onTrack: boolean | null;
};

export function goalProgress(
  e: Envelope,
  stat: Pick<EnvStat, "balance"> | undefined,
  allocations: Allocation[],
  now: Date = new Date(),
): GoalProgress {
  const goal = e.goal_amount ?? 0;
  const saved = whole(stat?.balance ?? 0);
  const left = Math.max(0, goal - saved);
  const pacePerMonth = paceOf(allocations.filter((a) => a.envelope_id === e.id), allocations, now) ?? 0;
  const paceKnown = hasPaceHistory(allocations, now);
  let monthsLeft: number | null = null;
  let neededPerMonth: number | null = null;
  if (e.goal_date) {
    const days = (Date.parse(e.goal_date + "T23:59:59+03:00") - now.getTime()) / DAY_MS;
    monthsLeft = Math.max(0, days / 30.44);
    neededPerMonth = left === 0 ? 0 : monthsLeft > 0 ? whole(left / monthsLeft) : left;
  }
  const projectedMonth =
    left === 0 ? monthKey(now) : paceKnown && pacePerMonth > 0 ? addMonths(monthKey(now), Math.ceil(left / pacePerMonth)) : null;
  const onTrack =
    neededPerMonth === null ? null : left === 0 ? true : paceKnown ? pacePerMonth > 0 && pacePerMonth >= neededPerMonth : null;
  return {
    saved,
    goal,
    pct: goal > 0 ? Math.min(1, Math.max(0, saved / goal)) : 0,
    monthsLeft,
    neededPerMonth,
    pacePerMonth,
    projectedMonth,
    onTrack,
  };
}

// ---------------------------------------------------------------------------
// where money should sit
// ---------------------------------------------------------------------------
export type AccountHome = {
  account: Account;
  balance: number; // native
  kes: number;
  assigned: number;
  parts: { envelope: Envelope; amount: number }[];
  diff: number; // kes − assigned: positive = more here than its envelopes claim
};

export function accountHomes(
  accounts: Account[],
  balances: Map<string, number>,
  envelopes: Envelope[],
  stats: Map<string, Pick<EnvStat, "balance">>,
  usdKes: number,
): AccountHome[] {
  return accounts
    .filter((a) => !a.archived)
    .map((a) => {
      const balance = balances.get(a.id) ?? 0;
      const kes = whole(toKes(balance, a.currency, usdKes));
      const parts = envelopes
        .filter((e) => !e.archived && e.home_account_id === a.id)
        .map((e) => ({ envelope: e, amount: whole(Math.max(0, stats.get(e.id)?.balance ?? 0)) }))
        .filter((p) => p.amount > 0)
        .sort((x, y) => y.amount - x.amount);
      const assigned = parts.reduce((s, p) => s + p.amount, 0);
      return { account: a, balance, kes, assigned, parts, diff: a.spendable ? kes - assigned : 0 };
    });
}

export type MoveSuggestion = { from: Account; to: Account; amount: number };

/** Greedy pairing of accounts holding too much with accounts holding too little. */
export function moveSuggestions(homes: AccountHome[], minimum = 100): MoveSuggestion[] {
  const over = homes.filter((h) => h.account.spendable && h.diff >= minimum).map((h) => ({ h, left: h.diff }));
  const under = homes.filter((h) => h.account.spendable && h.diff <= -minimum).map((h) => ({ h, left: -h.diff }));
  over.sort((a, b) => b.left - a.left);
  under.sort((a, b) => b.left - a.left);
  const out: MoveSuggestion[] = [];
  for (const u of under) {
    for (const o of over) {
      if (u.left < minimum) break;
      if (o.left < minimum) continue;
      const amt = Math.min(o.left, u.left);
      out.push({ from: o.h.account, to: u.h.account, amount: whole(amt) });
      o.left -= amt;
      u.left -= amt;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// planner simulation
// ---------------------------------------------------------------------------
export type SimResult = {
  monthly: Record<Slice, number> & { income: number; short: number };
  goals: { envelope: Envelope; start: number; end: number; reached: string | null }[];
  debtLeft: number;
  debtFree: string | null;
};

/**
 * Projects `months` months of steady income: spending envelopes are assumed spent each
 * month, goal envelopes accumulate and debt allocations are paid out straight away.
 */
export function simulate(opts: {
  monthlyKes: number;
  months: number;
  taxable: boolean;
  settings: Pick<Settings, "tax_pct" | "tax_fixed" | "split" | "paychecks_per_month">;
  groups: Group[];
  envelopes: Envelope[];
  balances: Map<string, number>; // current envelope balances
  debtOwed: number;
  now?: Date;
}): SimResult {
  const now = opts.now ?? new Date();
  const ppm = Math.max(1, opts.settings.paychecks_per_month);
  const sliceOf = new Map(opts.groups.map((g) => [g.id, g.slice]));
  const goalEnvs = opts.envelopes.filter(
    (e) => !e.archived && ["sinking", "emergency", "invest", "tax"].includes(sliceOf.get(e.group_id) ?? ""),
  );
  const bal = new Map(opts.envelopes.map((e) => [e.id, opts.balances.get(e.id) ?? 0]));
  const reached = new Map<string, string | null>(goalEnvs.map((e) => [e.id, null]));
  let owed = opts.debtOwed;
  let debtFree: string | null = owed <= 0 ? monthKey(now) : null;
  let first: SimResult["monthly"] | null = null;
  const debtEnv = opts.envelopes.find((e) => sliceOf.get(e.group_id) === "debt");

  for (let m = 1; m <= opts.months; m++) {
    const month = addMonths(monthKey(now), m);
    const funded = new Map<string, number>();
    const tally = { tax: 0, needs: 0, lifestyle: 0, sinking: 0, debt: 0, emergency: 0, invest: 0, income: 0, short: 0 };
    for (let p = 0; p < ppm; p++) {
      const stats = new Map(
        opts.envelopes.map((e) => [e.id, { balance: bal.get(e.id) ?? 0, fundedThisMonth: funded.get(e.id) ?? 0 }]),
      );
      if (debtEnv) stats.set(debtEnv.id, { balance: 0, fundedThisMonth: 0 });
      const plan = planIncome({
        kes: opts.monthlyKes / ppm,
        taxable: opts.taxable,
        settings: opts.settings,
        groups: opts.groups,
        envelopes: opts.envelopes,
        stats,
        debtOwed: owed,
      });
      tally.income += opts.monthlyKes / ppm;
      tally.short += plan.short.needs + plan.short.lifestyle;
      for (const k of Object.keys(plan.bySlice) as Slice[]) tally[k] += plan.bySlice[k];
      for (const l of plan.lines) {
        funded.set(l.envelope_id, (funded.get(l.envelope_id) ?? 0) + l.amount);
        if (l.slice === "debt") owed = Math.max(0, owed - l.amount);
        else bal.set(l.envelope_id, (bal.get(l.envelope_id) ?? 0) + l.amount);
      }
    }
    // spending envelopes are used up; goal envelopes keep their money
    for (const e of opts.envelopes) {
      const s = sliceOf.get(e.group_id);
      if (s === "needs" || s === "lifestyle") bal.set(e.id, 0);
    }
    for (const e of goalEnvs) {
      if (!reached.get(e.id) && e.goal_amount && (bal.get(e.id) ?? 0) >= e.goal_amount) reached.set(e.id, month);
    }
    if (!debtFree && owed <= 0) debtFree = month;
    if (!first) first = { ...tally };
  }

  return {
    monthly: first ?? { tax: 0, needs: 0, lifestyle: 0, sinking: 0, debt: 0, emergency: 0, invest: 0, income: 0, short: 0 },
    goals: goalEnvs.map((e) => ({
      envelope: e,
      start: whole(opts.balances.get(e.id) ?? 0),
      end: whole(bal.get(e.id) ?? 0),
      reached: e.goal_amount && (opts.balances.get(e.id) ?? 0) >= e.goal_amount ? monthKey(now) : reached.get(e.id) ?? null,
    })),
    debtLeft: whole(owed),
    debtFree,
  };
}
