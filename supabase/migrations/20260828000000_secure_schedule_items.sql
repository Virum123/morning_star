alter table public.schedule_items enable row level security;

revoke all on table public.schedule_items from anon, authenticated;
grant select, insert, update, delete on table public.schedule_items to authenticated;

do $policy_cleanup$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'schedule_items'
  loop
    execute format(
      'drop policy if exists %I on public.schedule_items',
      existing_policy.policyname
    );
  end loop;
end
$policy_cleanup$;

create policy "schedule_select_own"
on public.schedule_items
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "schedule_insert_own"
on public.schedule_items
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and deleted_at is null
);

create policy "schedule_update_own"
on public.schedule_items
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "schedule_delete_own"
on public.schedule_items
for delete
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists schedule_items_user_active_idx
on public.schedule_items (user_id, start_at, created_at)
where deleted_at is null;

create index if not exists schedule_items_user_trash_idx
on public.schedule_items (user_id, deleted_at desc)
where deleted_at is not null;
