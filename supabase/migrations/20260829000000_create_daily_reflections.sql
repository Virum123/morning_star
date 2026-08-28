create table if not exists public.daily_reflections (
  user_id uuid not null references auth.users(id) on delete cascade,
  reflection_date date not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, reflection_date),
  constraint daily_reflections_content_length
    check (char_length(content) between 1 and 1000),
  constraint daily_reflections_content_not_blank
    check (content ~ '[^[:space:]]')
);

alter table public.daily_reflections enable row level security;

revoke all on table public.daily_reflections from anon, authenticated;
grant select, insert, update, delete on table public.daily_reflections to authenticated;

drop policy if exists "daily_reflections_select_own" on public.daily_reflections;
drop policy if exists "daily_reflections_insert_own" on public.daily_reflections;
drop policy if exists "daily_reflections_update_own" on public.daily_reflections;
drop policy if exists "daily_reflections_delete_own" on public.daily_reflections;

create policy "daily_reflections_select_own"
on public.daily_reflections
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "daily_reflections_insert_own"
on public.daily_reflections
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "daily_reflections_update_own"
on public.daily_reflections
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "daily_reflections_delete_own"
on public.daily_reflections
for delete
to authenticated
using ((select auth.uid()) = user_id);
