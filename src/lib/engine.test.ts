// Run with: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  accountBalances,
  accountHomes,
  dayKey,
  debtBalances,
  envelopeStats,
  goalProgress,
  moveSuggestions,
  netWorth,
  planIncome,
  planSweeps,
  readyToAssign,
  simulate,
  weekKey,
} from "./engine.ts";
import type { Account, Allocation, Debt, Envelope, Group, Txn } from "./types.ts";

const settings = {
  tax_pct: 25,
  split: { lifestyle: 10, sinking: 20, debt: 20, emergency: 45, invest: 5 },
  paychecks_per_month: 2,
};

const groups: Group[] = [
  { id: "g-tax", name: "Tax", emoji: "", tier: 2, slice: "tax", sort: 0 },
  { id: "g-needs", name: "Home", emoji: "", tier: 1, slice: "needs", sort: 1 },
  { id: "g-life", name: "Fun", emoji: "", tier: 3, slice: "lifestyle", sort: 2 },
  { id: "g-sink", name: "Sinking", emoji: "", tier: 2, slice: "sinking", sort: 3 },
  { id: "g-debt", name: "Debt", emoji: "", tier: 2, slice: "debt", sort: 4 },
  { id: "g-ef", name: "EF", emoji: "", tier: 2, slice: "emergency", sort: 5 },
  { id: "g-inv", name: "Inv", emoji: "", tier: 2, slice: "invest", sort: 6 },
];

const env = (id: string, group_id: string, extra: Partial<Envelope> = {}): Envelope => ({
  id,
  group_id,
  name: id,
  target: 0,
  period: "month",
  fill: "split",
  goal_amount: null,
  goal_date: null,
  priority: 0,
  home_account_id: null,
  sweep_to_id: null,
  protected: false,
  archived: false,
  sort: 0,
  note: null,
  ...extra,
});

const envelopes: Envelope[] = [
  env("tax", "g-tax"),
  env("rent", "g-needs", { target: 18000, fill: "first" }),
  env("weekly", "g-needs", { target: 1200, period: "week", sort: 1 }), // 5,200/month
  env("night", "g-life", { target: 5000, sweep_to_id: "trip" }),
  env("fridge", "g-sink", { goal_amount: 55000, priority: 1 }),
  env("trip", "g-sink", { goal_amount: 150000, priority: 2 }),
  env("repairs", "g-sink", { target: 1000 }),
  env("debt", "g-debt"),
  env("ef", "g-ef", { goal_amount: 600000 }),
  env("inv", "g-inv"),
];

const blank = () => new Map(envelopes.map((e) => [e.id, { balance: 0, fundedThisMonth: 0 }]));
const sum = (lines: { amount: number }[]) => lines.reduce((s, l) => s + l.amount, 0);

test("every shilling of an income gets a job", () => {
  const plan = planIncome({ kes: 254130, taxable: true, settings, groups, envelopes, stats: blank(), debtOwed: 203170 });
  assert.equal(sum(plan.lines), 254130);
  assert.equal(plan.tax, Math.round(254130 * 0.25));
});

test("tax first, then needs, then the percentage split", () => {
  const plan = planIncome({ kes: 200000, taxable: true, settings, groups, envelopes, stats: blank(), debtOwed: 500000 });
  const by = (id: string) => sum(plan.lines.filter((l) => l.envelope_id === id));
  assert.equal(by("tax"), 50000);
  assert.equal(by("rent"), 18000, "fill=first takes the whole month on the first paycheck");
  assert.equal(by("weekly"), 2600, "split envelopes take half the month per paycheck");
  const surplus = 200000 - 50000 - 18000 - 2600;
  assert.equal(plan.surplus, surplus);
  assert.equal(by("night"), 2500);
  assert.equal(by("debt"), Math.floor(surplus * 0.2));
  // fridge goal is filled before the trip
  assert.ok(by("fridge") > 0 && by("trip") === 0);
});

test("second paycheck of the month doesn't refill fill=first envelopes", () => {
  const stats = blank();
  stats.set("rent", { balance: 18000, fundedThisMonth: 18000 });
  stats.set("weekly", { balance: 2600, fundedThisMonth: 2600 });
  const plan = planIncome({ kes: 100000, taxable: false, settings, groups, envelopes, stats, debtOwed: 0 });
  assert.equal(sum(plan.lines.filter((l) => l.envelope_id === "rent")), 0);
  assert.equal(sum(plan.lines.filter((l) => l.envelope_id === "weekly")), 2600);
});

test("a lean paycheck scales Needs down instead of going negative", () => {
  const plan = planIncome({ kes: 10000, taxable: false, settings, groups, envelopes, stats: blank(), debtOwed: 0 });
  assert.ok(plan.needs <= 10000);
  assert.ok(plan.short.needs > 0);
  assert.equal(sum(plan.lines), 10000);
});

test("debt money goes to investments once nothing is owed", () => {
  const plan = planIncome({ kes: 100000, taxable: false, settings, groups, envelopes, stats: blank(), debtOwed: 0 });
  assert.equal(sum(plan.lines.filter((l) => l.envelope_id === "debt")), 0);
  assert.ok(sum(plan.lines.filter((l) => l.envelope_id === "inv")) > Math.floor(plan.surplus * 0.05));
});

test("a full emergency fund overflows into investments", () => {
  const stats = blank();
  stats.set("ef", { balance: 600000, fundedThisMonth: 0 });
  const plan = planIncome({ kes: 100000, taxable: false, settings, groups, envelopes, stats, debtOwed: 1e9 });
  assert.equal(sum(plan.lines.filter((l) => l.envelope_id === "ef")), 0);
});

const accounts: Account[] = [
  { id: "mpesa", name: "M-Pesa", kind: "mobile", currency: "KES", opening_balance: 1000, in_net_worth: true, spendable: true, archived: false, sort: 0 },
  { id: "deel", name: "Deel", kind: "usd", currency: "USD", opening_balance: 100, in_net_worth: true, spendable: true, archived: false, sort: 1 },
  { id: "biz", name: "Biz", kind: "business", currency: "KES", opening_balance: 27500, in_net_worth: false, spendable: false, archived: false, sort: 2 },
];

const txn = (t: Partial<Txn>): Txn => ({
  id: Math.random().toString(36),
  at: "2026-10-21T12:00:00Z",
  kind: "expense",
  account_id: "mpesa",
  amount: 0,
  fee: 0,
  rate: 1,
  kes_value: null,
  to_account_id: null,
  to_amount: null,
  envelope_id: null,
  debt_id: null,
  taxable: true,
  category: null,
  note: null,
  tags: [],
  review: null,
  counts: true,
  source: "app",
  ...t,
});

test("balances: fees come out of the account and the envelope; imported history never counts", () => {
  const txns = [
    txn({ amount: 300, fee: 7, envelope_id: "night" }),
    txn({ kind: "transfer", account_id: "deel", amount: 50, fee: 1, to_account_id: "mpesa", to_amount: 6400 }),
    txn({ amount: 99999, envelope_id: "night", counts: false }),
  ];
  const bal = accountBalances(accounts, txns);
  assert.equal(bal.get("mpesa"), 1000 - 307 + 6400);
  assert.equal(bal.get("deel"), 49);
  const allocs: Allocation[] = [{ id: "a", envelope_id: "night", amount: 2500, at: "2026-10-01T09:00:00Z", kind: "income", txn_id: null, note: null }];
  const stats = envelopeStats(envelopes, allocs, txns, new Date("2026-10-21T12:00:00Z"));
  assert.equal(stats.get("night")!.balance, 2500 - 307);
  assert.equal(stats.get("night")!.spentThisMonth, 307);
});

test("ready to assign ignores business money; net worth subtracts debts", () => {
  const bal = accountBalances(accounts, []);
  const stats = envelopeStats(envelopes, [], []);
  assert.equal(readyToAssign(accounts, bal, stats, 130), 1000 + 13000);
  const debts: Debt[] = [{ id: "d", name: "Mum", opening_balance: 5000, interest: 0, due_date: null, installment: null, priority: 1, closed: false, note: null }];
  const dbal = debtBalances(debts, [txn({ kind: "debt_payment", amount: 1000, debt_id: "d" })]);
  assert.equal(dbal.get("d"), 4000);
  assert.deepEqual(netWorth(accounts, bal, debts, dbal, 130), { assets: 14000, liabilities: 4000, net: 10000 });
});

test("weekly overspend comes off next week's allowance", () => {
  const now = new Date("2026-10-21T12:00:00Z"); // Wednesday
  const lastWeek = txn({ at: "2026-10-14T12:00:00Z", amount: 1500, envelope_id: "weekly" });
  const stats = envelopeStats(envelopes, [], [lastWeek], now);
  assert.equal(stats.get("weekly")!.weekLimit, 1200 - 300);
});

test("Nairobi dates: 22:30 UTC is already tomorrow; weeks start Monday", () => {
  assert.equal(dayKey("2026-10-31T22:30:00Z"), "2026-11-01");
  assert.equal(weekKey("2026-10-25T12:00:00Z"), "2026-10-19"); // Sunday → Monday before
  assert.equal(weekKey("2026-10-26T00:30:00+03:00"), "2026-10-26");
});

test("month-end sweep moves Night out leftovers to the trip, once", () => {
  const stats = new Map([["night", { balance: 1800 }]]);
  const now = new Date("2026-11-03T09:00:00Z");
  const lines = planSweeps(envelopes, stats, [], now);
  assert.deepEqual(lines.map((l) => [l.envelope_id, l.amount]), [["night", -1800], ["trip", 1800]]);
  const done: Allocation[] = [{ id: "s", envelope_id: "trip", amount: 1800, at: now.toISOString(), kind: "sweep", txn_id: null, note: null }];
  assert.equal(planSweeps(envelopes, stats, done, now).length, 0);
});

test("goal pace and on-track", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  const e = envelopes.find((x) => x.id === "ef")!;
  const g = goalProgress({ ...e, goal_date: "2027-03-30" }, { balance: 80000 }, [
    { id: "1", envelope_id: "ef", amount: 100000, at: "2026-10-01T12:00:00Z", kind: "income", txn_id: null, note: null },
    { id: "2", envelope_id: "ef", amount: 80000, at: "2026-01-01T12:00:00Z", kind: "opening", txn_id: null, note: null },
  ], now);
  assert.equal(g.pacePerMonth, 50000);
  assert.ok(g.neededPerMonth! > 90000);
  assert.equal(g.onTrack, false);
});

test("move suggestions pair over- and under-funded accounts", () => {
  const homed = envelopes.map((e) => (e.id === "fridge" ? { ...e, home_account_id: "mpesa" } : e));
  const bal = new Map([["mpesa", 0], ["deel", 100], ["biz", 27500]]);
  const stats = new Map([["fridge", { balance: 5000 }]]);
  const homes = accountHomes(accounts, bal, homed, stats, 130);
  const moves = moveSuggestions(homes);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].from.id, "deel");
  assert.equal(moves[0].to.id, "mpesa");
  assert.equal(moves[0].amount, 5000);
});

test("simulation pays debt down and fills goals over time", () => {
  const res = simulate({
    monthlyKes: 254130,
    months: 6,
    taxable: true,
    settings,
    groups,
    envelopes,
    balances: new Map(),
    debtOwed: 203170,
    now: new Date("2026-10-21T12:00:00Z"),
  });
  assert.ok(res.monthly.debt > 0);
  assert.ok(res.debtLeft < 203170);
  assert.equal(res.goals.find((g) => g.envelope.id === "fridge")!.reached, "2026-12"); // ~32k a month into sinking funds
});
