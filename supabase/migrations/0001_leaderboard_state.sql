create table if not exists public.leaderboard_state (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.leaderboard_state enable row level security;
