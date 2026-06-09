create table if not exists public.leaderboard_state (
  id text primary key,
  version bigint not null default 0,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.leaderboard_state enable row level security;

revoke all on table public.leaderboard_state from anon, authenticated;
grant select, insert, update, delete on table public.leaderboard_state to service_role;
