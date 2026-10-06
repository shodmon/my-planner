-- Run once in Supabase: SQL Editor -> New query -> paste -> Run
create table if not exists tasks (
  user_id   uuid not null default auth.uid(),
  id        text not null,
  updated   bigint not null,
  deleted   boolean not null default false,
  data      jsonb not null default '{}',
  synced_at timestamptz not null default now(),
  primary key (user_id, id)
);
create or replace function touch_synced() returns trigger language plpgsql as $$
begin new.synced_at = clock_timestamp(); return new; end $$;
drop trigger if exists tasks_touch on tasks;
create trigger tasks_touch before insert or update on tasks for each row execute function touch_synced();
create index if not exists tasks_synced on tasks (user_id, synced_at);
alter table tasks enable row level security;
drop policy if exists own_rows on tasks;
create policy own_rows on tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
