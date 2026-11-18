-- Личный бюджет: у каждого человека свой документ, другие участники хозяйства его не видят.
create table if not exists public.private_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.private_data enable row level security;

drop policy if exists private_select on public.private_data;
create policy private_select on public.private_data for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists private_insert on public.private_data;
create policy private_insert on public.private_data for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists private_update on public.private_data;
create policy private_update on public.private_data for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.private_data from anon;
grant select, insert, update on public.private_data to authenticated;
