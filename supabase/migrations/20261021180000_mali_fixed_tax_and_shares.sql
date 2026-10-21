-- Tax can be a fixed amount a month instead of a percentage.
alter table public.mali_settings add column tax_fixed numeric check (tax_fixed >= 0);
-- Lifestyle envelopes can take a percentage share of the Lifestyle pot instead of a fixed target.
alter table public.mali_envelopes add column share numeric check (share >= 0 and share <= 100);
