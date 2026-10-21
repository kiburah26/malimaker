-- Only signed-in users may call the Mali Maker functions.
revoke execute on function public.mali_seed() from public, anon;
revoke execute on function public.mali_record_income(jsonb, jsonb) from public, anon;
grant execute on function public.mali_seed() to authenticated;
grant execute on function public.mali_record_income(jsonb, jsonb) to authenticated;
