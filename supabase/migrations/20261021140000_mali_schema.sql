-- MALI MAKER — schema v1
-- Every table: user_id (= auth.uid()), RLS "own rows only". Child tables use
-- composite FKs (parent_id, user_id) so a row can never point at another
-- user's parent. Amounts are numeric; envelope money is always KES.

-- ---------------------------------------------------------------------------
-- settings (one row per user)
-- ---------------------------------------------------------------------------
create table public.mali_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  tax_pct numeric not null default 25 check (tax_pct between 0 and 60),
  -- percentages of what's left after tax and Needs; must add up to 100
  split jsonb not null default '{"lifestyle":10,"sinking":20,"debt":20,"emergency":45,"invest":5}',
  paychecks_per_month int not null default 2 check (paychecks_per_month between 1 and 6),
  usd_kes numeric not null default 129.3 check (usd_kes > 0),
  rate_updated_at timestamptz,
  night_cap numeric check (night_cap > 0),
  night_started_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- accounts — where money physically sits
-- ---------------------------------------------------------------------------
create table public.mali_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  kind text not null default 'bank'
    check (kind in ('bank', 'mobile', 'mmf', 'crypto', 'usd', 'cash', 'business')),
  currency text not null default 'KES' check (currency in ('KES', 'USD')),
  opening_balance numeric not null default 0,
  in_net_worth boolean not null default true,
  spendable boolean not null default true,   -- false = held for someone else (business)
  archived boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

-- ---------------------------------------------------------------------------
-- envelope groups — what money is for. slice decides which part of the split feeds it.
-- ---------------------------------------------------------------------------
create table public.mali_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  emoji text not null default '•',
  tier int not null check (tier in (1, 2, 3)),
  slice text not null
    check (slice in ('tax', 'needs', 'lifestyle', 'sinking', 'debt', 'emergency', 'invest')),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.mali_envelopes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  group_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  target numeric not null default 0 check (target >= 0),       -- per period
  period text not null default 'month' check (period in ('month', 'week')),
  fill text not null default 'split' check (fill in ('split', 'first')),
  goal_amount numeric check (goal_amount > 0),
  goal_date date,
  priority int not null default 0,                              -- sinking-fund fill order
  home_account_id uuid,
  sweep_to_id uuid,                                             -- month-end leftovers go here
  protected boolean not null default false,
  archived boolean not null default false,
  sort int not null default 0,
  note text,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (group_id, user_id) references public.mali_groups (id, user_id) on delete cascade,
  foreign key (home_account_id, user_id) references public.mali_accounts (id, user_id) on delete set null (home_account_id),
  foreign key (sweep_to_id, user_id) references public.mali_envelopes (id, user_id) on delete set null (sweep_to_id)
);

-- ---------------------------------------------------------------------------
-- debts
-- ---------------------------------------------------------------------------
create table public.mali_debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  opening_balance numeric not null default 0 check (opening_balance >= 0),
  interest numeric not null default 0 check (interest >= 0),   -- fixed interest, already in the balance
  due_date date,
  installment numeric check (installment > 0),
  priority int not null default 0,
  closed boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

-- ---------------------------------------------------------------------------
-- transactions
--   expense       account −(amount+fee), envelope −kes_value
--   income        account +amount (fee = platform fee taken before it landed)
--   transfer      account −(amount+fee), to_account +to_amount (conversion when currencies differ)
--   debt_payment  account −(amount+fee), envelope −kes_value, debt −amount
--   borrow        account +amount, debt +amount (never income, never split)
--   adjust        account +amount (signed), to reconcile a balance
-- counts = false for history imported from Money Manager (shown, never in balances).
-- ---------------------------------------------------------------------------
create table public.mali_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null
    check (kind in ('expense', 'income', 'transfer', 'debt_payment', 'borrow', 'adjust')),
  account_id uuid not null,
  amount numeric not null,
  fee numeric not null default 0 check (fee >= 0),
  rate numeric not null default 1 check (rate > 0),             -- KES per unit of the account currency
  kes_value numeric,                                            -- envelope effect, in KES
  to_account_id uuid,
  to_amount numeric,
  envelope_id uuid,
  debt_id uuid,
  taxable boolean not null default true,
  category text,
  note text,
  tags text[] not null default '{}',
  review text check (review in ('pending', 'worth', 'regret')),
  counts boolean not null default true,
  source text not null default 'app',
  created_at timestamptz not null default now(),
  unique (id, user_id),
  constraint mali_txn_amount_sign check (kind = 'adjust' or amount > 0),
  constraint mali_txn_transfer check (kind <> 'transfer' or to_account_id is not null),
  foreign key (account_id, user_id) references public.mali_accounts (id, user_id) on delete cascade,
  foreign key (to_account_id, user_id) references public.mali_accounts (id, user_id) on delete cascade,
  foreign key (envelope_id, user_id) references public.mali_envelopes (id, user_id) on delete set null (envelope_id),
  foreign key (debt_id, user_id) references public.mali_debts (id, user_id) on delete set null (debt_id)
);
create index mali_transactions_user_at on public.mali_transactions (user_id, at desc);

-- ---------------------------------------------------------------------------
-- allocations — money given to (or taken from) an envelope, in KES
-- ---------------------------------------------------------------------------
create table public.mali_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  envelope_id uuid not null,
  amount numeric not null check (amount <> 0),
  at timestamptz not null default now(),
  kind text not null check (kind in ('income', 'move', 'sweep', 'opening', 'adjust')),
  txn_id uuid,
  note text,
  created_at timestamptz not null default now(),
  foreign key (envelope_id, user_id) references public.mali_envelopes (id, user_id) on delete cascade,
  foreign key (txn_id, user_id) references public.mali_transactions (id, user_id) on delete cascade
);
create index mali_allocations_user_env on public.mali_allocations (user_id, envelope_id);

-- ---------------------------------------------------------------------------
-- net worth, one snapshot per day
-- ---------------------------------------------------------------------------
create table public.mali_snapshots (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  assets numeric not null,
  liabilities numeric not null,
  primary key (user_id, day)
);

-- ---------------------------------------------------------------------------
-- RLS: own rows only
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['mali_settings', 'mali_accounts', 'mali_groups', 'mali_envelopes',
    'mali_debts', 'mali_transactions', 'mali_allocations', 'mali_snapshots']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- record an income and its split in one go
-- ---------------------------------------------------------------------------
create or replace function public.mali_record_income(txn jsonb, allocs jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare new_id uuid;
begin
  insert into public.mali_transactions
    (at, kind, account_id, amount, fee, rate, kes_value, taxable, category, note, tags)
  values (
    coalesce((txn ->> 'at')::timestamptz, now()), 'income', (txn ->> 'account_id')::uuid,
    (txn ->> 'amount')::numeric, coalesce((txn ->> 'fee')::numeric, 0),
    coalesce((txn ->> 'rate')::numeric, 1), (txn ->> 'kes_value')::numeric,
    coalesce((txn ->> 'taxable')::boolean, true), txn ->> 'category', txn ->> 'note',
    coalesce(array(select jsonb_array_elements_text(txn -> 'tags')), '{}')
  )
  returning id into new_id;

  insert into public.mali_allocations (envelope_id, amount, at, kind, txn_id, note)
  select (a ->> 'envelope_id')::uuid, (a ->> 'amount')::numeric,
         coalesce((txn ->> 'at')::timestamptz, now()), coalesce(a ->> 'kind', 'income'),
         new_id, a ->> 'note'
  from jsonb_array_elements(allocs) a
  where (a ->> 'amount')::numeric <> 0;

  return new_id;
end $$;
