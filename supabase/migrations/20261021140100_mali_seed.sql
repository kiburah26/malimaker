-- MALI MAKER — starter accounts, envelope groups and envelopes for a new user.
-- Called from the app on first load (no settings row yet). Amounts are starting
-- points; everything is editable in the app.

create or replace function public.mali_seed()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  a_mpesa1 uuid; a_mpesa2 uuid; a_im uuid; a_loop uuid; a_etica uuid; a_usdt uuid;
  g uuid;
  e_trip uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.mali_settings where user_id = uid) then return; end if;

  insert into public.mali_settings (user_id) values (uid);

  -- accounts --------------------------------------------------------------
  insert into public.mali_accounts (name, kind, currency, sort) values ('M-Pesa line 1', 'mobile', 'KES', 1) returning id into a_mpesa1;
  insert into public.mali_accounts (name, kind, currency, sort) values ('M-Pesa line 2', 'mobile', 'KES', 2) returning id into a_mpesa2;
  insert into public.mali_accounts (name, kind, currency, sort) values ('I&M', 'bank', 'KES', 3) returning id into a_im;
  insert into public.mali_accounts (name, kind, currency, sort) values ('Equity', 'bank', 'KES', 4);
  insert into public.mali_accounts (name, kind, currency, sort) values ('NCBA', 'bank', 'KES', 5);
  insert into public.mali_accounts (name, kind, currency, sort) values ('Loop', 'bank', 'KES', 6) returning id into a_loop;
  insert into public.mali_accounts (name, kind, currency, sort) values ('Etica (MMF)', 'mmf', 'KES', 7) returning id into a_etica;
  insert into public.mali_accounts (name, kind, currency, sort) values ('USDT', 'crypto', 'USD', 8) returning id into a_usdt;
  insert into public.mali_accounts (name, kind, currency, sort) values ('Deel', 'usd', 'USD', 9);
  insert into public.mali_accounts (name, kind, currency, sort, in_net_worth, spendable)
    values ('Connect business', 'business', 'KES', 10, false, false);

  -- Tier 1 · Essentials (fixed, filled first, protected) ---------------------
  insert into public.mali_groups (name, emoji, tier, slice, sort) values ('Home & bills', '🏠', 1, 'needs', 1) returning id into g;
  insert into public.mali_envelopes (group_id, name, target, fill, home_account_id, protected, sort) values
    (g, 'Rent', 18300, 'first', a_im, true, 1),
    (g, 'WiFi', 1500, 'first', a_im, true, 2),
    (g, 'Electricity', 1500, 'split', a_mpesa1, true, 3),
    (g, 'Water', 450, 'split', a_mpesa1, true, 4),
    (g, 'Gas', 500, 'split', a_mpesa1, true, 5),
    (g, 'Laundry', 2500, 'split', a_mpesa1, true, 6),
    (g, 'Drinking water', 200, 'split', a_mpesa1, true, 7);

  insert into public.mali_groups (name, emoji, tier, slice, sort) values ('Shopping', '🛒', 1, 'needs', 2) returning id into g;
  insert into public.mali_envelopes (group_id, name, target, fill, home_account_id, protected, sort, note) values
    (g, 'Food shopping', 5000, 'first', a_mpesa1, true, 1, 'Start-of-month staples: rice, sugar, flour, oil'),
    (g, 'Household supplies', 1500, 'split', a_mpesa1, true, 2, 'Toiletries and cleaning');

  insert into public.mali_groups (name, emoji, tier, slice, sort) values ('Weekly', '🍳', 1, 'needs', 3) returning id into g;
  insert into public.mali_envelopes (group_id, name, target, period, home_account_id, protected, sort, note) values
    (g, 'Weekly', 1000, 'week', a_mpesa1, true, 1, 'Breakfast, meat, groceries, top-ups until the next big shop');

  insert into public.mali_groups (name, emoji, tier, slice, sort) values ('Getting around', '🚌', 1, 'needs', 4) returning id into g;
  insert into public.mali_envelopes (group_id, name, target, home_account_id, protected, sort, note) values
    (g, 'Fare', 2500, a_mpesa1, true, 1, 'Daily and work fare. Night-out fare goes in Night out.');

  insert into public.mali_groups (name, emoji, tier, slice, sort) values ('Connectivity', '📱', 1, 'needs', 5) returning id into g;
  insert into public.mali_envelopes (group_id, name, target, home_account_id, protected, sort) values
    (g, 'Airtime & bundles', 700, a_mpesa1, true, 1);

  insert into public.mali_groups (name, emoji, tier, slice, sort) values ('Health & care', '🩺', 1, 'needs', 6) returning id into g;
  insert into public.mali_envelopes (group_id, name, target, home_account_id, protected, sort, note) values
    (g, 'Meds & pharmacy', 500, a_mpesa1, true, 1, null),
    (g, 'Self-care', 3000, a_mpesa1, true, 2, 'Hair, grooming, gym');

  insert into public.mali_groups (name, emoji, tier, slice, sort) values ('Work essentials', '💼', 1, 'needs', 7) returning id into g;
  insert into public.mali_envelopes (group_id, name, target, home_account_id, protected, sort, note) values
    (g, 'Work tools', 3000, a_im, true, 1, 'Claude and other tools you need to earn');

  insert into public.mali_groups (name, emoji, tier, slice, sort) values ('Buffer', '🧯', 1, 'needs', 8) returning id into g;
  insert into public.mali_envelopes (group_id, name, target, home_account_id, protected, sort, note) values
    (g, 'Buffer', 2000, a_mpesa1, true, 1, 'Lost money and small surprises');

  -- Tier 2 · Building your future (percent of what's left, protected) --------
  insert into public.mali_groups (name, emoji, tier, slice, sort) values ('Tax set-aside', '🧾', 2, 'tax', 10) returning id into g;
  insert into public.mali_envelopes (group_id, name, home_account_id, protected, sort, note) values
    (g, 'Tax set-aside', a_etica, true, 1, 'Income tax on Deel and gig income, paid at filing');

  insert into public.mali_groups (name, emoji, tier, slice, sort) values ('Debt', '💳', 2, 'debt', 11) returning id into g;
  insert into public.mali_envelopes (group_id, name, home_account_id, protected, sort) values
    (g, 'Debt payments', a_im, true, 1);

  insert into public.mali_groups (name, emoji, tier, slice, sort) values ('Emergency', '🛟', 2, 'emergency', 12) returning id into g;
  insert into public.mali_envelopes (group_id, name, goal_amount, goal_date, home_account_id, protected, sort) values
    (g, 'Emergency fund', 600000, '2027-03-30', a_etica, true, 1);

  insert into public.mali_groups (name, emoji, tier, slice, sort) values ('Investments', '📈', 2, 'invest', 13) returning id into g;
  insert into public.mali_envelopes (group_id, name, goal_amount, goal_date, home_account_id, protected, sort) values
    (g, 'Investments', 100000, '2027-03-30', a_usdt, true, 1);

  insert into public.mali_groups (name, emoji, tier, slice, sort) values ('Sinking funds', '🎯', 2, 'sinking', 14) returning id into g;
  insert into public.mali_envelopes (group_id, name, goal_amount, goal_date, priority, home_account_id, protected, sort, note) values
    (g, 'Fridge', 55000, '2026-11-27', 1, a_loop, true, 1, 'Black Friday, 55k max'),
    (g, 'iPhone 17 Pro', 175000, '2027-01-31', 2, a_loop, true, 2, 'Deep Blue. Buy with cash, not credit.');
  insert into public.mali_envelopes (group_id, name, goal_amount, goal_date, priority, home_account_id, protected, sort, note) values
    (g, 'Birthday trip', 150000, '2027-03-31', 3, a_loop, true, 3, 'April, abroad. Update the amount once you pick a place.')
    returning id into e_trip;
  insert into public.mali_envelopes (group_id, name, target, priority, home_account_id, protected, sort, note) values
    (g, 'DJ & work gear', 0, 4, a_loop, true, 4, 'Equipment, accessories, laptop replacement'),
    (g, 'Home upgrades', 0, 5, a_loop, true, 5, 'Furniture and decor'),
    (g, 'Home repairs', 500, 6, a_loop, true, 6, null),
    (g, 'Health big-ticket', 500, 7, a_loop, true, 7, 'Spectacles, dental');

  -- Tier 3 · Lifestyle (10% of what's left, capped by these targets) ---------
  insert into public.mali_groups (name, emoji, tier, slice, sort) values ('Giving', '💛', 3, 'lifestyle', 20) returning id into g;
  insert into public.mali_envelopes (group_id, name, target, home_account_id, sort) values
    (g, 'Family', 3000, a_mpesa1, 1),
    (g, 'Friends', 2000, a_mpesa1, 2);

  insert into public.mali_groups (name, emoji, tier, slice, sort) values ('Night out', '🌙', 3, 'lifestyle', 21) returning id into g;
  insert into public.mali_envelopes (group_id, name, target, home_account_id, sweep_to_id, sort, note) values
    (g, 'Night out', 5000, a_mpesa2, e_trip, 1, 'Drinks, fare, tickets, concerts. Leftovers go to the trip.');

  insert into public.mali_groups (name, emoji, tier, slice, sort) values ('Outings', '🌳', 3, 'lifestyle', 22) returning id into g;
  insert into public.mali_envelopes (group_id, name, target, home_account_id, sort, note) values
    (g, 'Outings', 1500, a_mpesa1, 1, 'Daytime and family outings');

  insert into public.mali_groups (name, emoji, tier, slice, sort) values ('Ordering out', '🍔', 3, 'lifestyle', 23) returning id into g;
  insert into public.mali_envelopes (group_id, name, target, home_account_id, sort, note) values
    (g, 'Ordering out', 2500, a_mpesa1, 1, 'Meals plus their delivery fees');

  insert into public.mali_groups (name, emoji, tier, slice, sort) values ('Apparel', '👗', 3, 'lifestyle', 24) returning id into g;
  insert into public.mali_envelopes (group_id, name, target, home_account_id, sort) values
    (g, 'Apparel', 1500, a_mpesa1, 1);

  insert into public.mali_groups (name, emoji, tier, slice, sort) values ('Fun', '🎧', 3, 'lifestyle', 25) returning id into g;
  insert into public.mali_envelopes (group_id, name, target, home_account_id, sort, note) values
    (g, 'Hobbies', 1000, a_mpesa1, 1, null),
    (g, 'Subscriptions', 1500, a_im, 2, 'Personal: Netflix, Spotify'),
    (g, 'Treats', 1000, a_mpesa1, 3, 'Guilty pleasures: wine at home, sweets');

  insert into public.mali_groups (name, emoji, tier, slice, sort) values ('Growth', '📚', 3, 'lifestyle', 26) returning id into g;
  insert into public.mali_envelopes (group_id, name, target, home_account_id, sort) values
    (g, 'Books & courses', 1000, a_mpesa1, 1);

  insert into public.mali_groups (name, emoji, tier, slice, sort) values ('Networking', '🤝', 3, 'lifestyle', 27) returning id into g;
  insert into public.mali_envelopes (group_id, name, target, home_account_id, sort, note) values
    (g, 'Networking events', 1000, a_mpesa1, 1, 'Business events. Tag them "business".');
end $$;
