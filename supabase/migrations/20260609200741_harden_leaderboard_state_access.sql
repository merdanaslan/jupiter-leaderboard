do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'leaderboard_state'
      and policyname = 'service_role_manages_leaderboard_state'
  ) then
    execute 'create policy service_role_manages_leaderboard_state on public.leaderboard_state for all to service_role using (true) with check (true)';
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
