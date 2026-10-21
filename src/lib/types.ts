export type Slice = "tax" | "needs" | "lifestyle" | "sinking" | "debt" | "emergency" | "invest";
export type SurplusSlice = "lifestyle" | "sinking" | "debt" | "emergency" | "invest";
export type Split = Record<SurplusSlice, number>;

export type Settings = {
  user_id: string;
  tax_pct: number;
  split: Split;
  paychecks_per_month: number;
  usd_kes: number;
  rate_updated_at: string | null;
  night_cap: number | null;
  night_started_at: string | null;
};

export type AccountKind = "bank" | "mobile" | "mmf" | "crypto" | "usd" | "cash" | "business";
export type Currency = "KES" | "USD";

export type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  currency: Currency;
  opening_balance: number;
  in_net_worth: boolean;
  spendable: boolean;
  archived: boolean;
  sort: number;
};

export type Group = {
  id: string;
  name: string;
  emoji: string;
  tier: 1 | 2 | 3;
  slice: Slice;
  sort: number;
};

export type Envelope = {
  id: string;
  group_id: string;
  name: string;
  target: number;
  period: "month" | "week";
  fill: "split" | "first";
  goal_amount: number | null;
  goal_date: string | null;
  priority: number;
  home_account_id: string | null;
  sweep_to_id: string | null;
  protected: boolean;
  archived: boolean;
  sort: number;
  note: string | null;
};

export type Debt = {
  id: string;
  name: string;
  opening_balance: number;
  interest: number;
  due_date: string | null;
  installment: number | null;
  priority: number;
  closed: boolean;
  note: string | null;
};

export type TxnKind = "expense" | "income" | "transfer" | "debt_payment" | "borrow" | "adjust";

export type Txn = {
  id: string;
  at: string;
  kind: TxnKind;
  account_id: string;
  amount: number;
  fee: number;
  rate: number;
  kes_value: number | null;
  to_account_id: string | null;
  to_amount: number | null;
  envelope_id: string | null;
  debt_id: string | null;
  taxable: boolean;
  category: string | null;
  note: string | null;
  tags: string[];
  review: "pending" | "worth" | "regret" | null;
  counts: boolean;
  source: string;
};

export type AllocationKind = "income" | "move" | "sweep" | "opening" | "adjust";

export type Allocation = {
  id: string;
  envelope_id: string;
  amount: number;
  at: string;
  kind: AllocationKind;
  txn_id: string | null;
  note: string | null;
};

export type Snapshot = { day: string; assets: number; liabilities: number };
