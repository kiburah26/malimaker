-- Most KES Wants can get in a month; anything above it goes to Debt. Null = no cap.
alter table public.mali_settings add column lifestyle_cap numeric check (lifestyle_cap >= 0);
