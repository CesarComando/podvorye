-- Рационы подворья: хозяйство, участники, приглашения, учёт вопросов помощнику.
-- Все данные хозяйства — один JSON-документ farms.data (как в первой версии приложения).

create table if not exists public.farms (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Моё подворье',
  data jsonb not null default '{}'::jsonb,
  report text,                 -- готовый текст отчёта (собирает приложение при каждом сохранении)
  report_email text,           -- куда слать еженедельный отчёт
  report_sent_at timestamptz,
  ai_enabled boolean not null default false, -- помощник Claude включается вручную только своим хозяйствам

  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.farm_members (
  farm_id uuid not null references public.farms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  email text,
  joined_at timestamptz not null default now(),
  primary key (farm_id, user_id)
);
create index if not exists farm_members_user_idx on public.farm_members(user_id);

-- Приглашение — одноразовый код, который владелец передаёт человеку сам (лично, в мессенджере).
create table if not exists public.farm_invites (
  code text primary key,
  farm_id uuid not null references public.farms(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default (now() at time zone 'Europe/Riga')::date,
  count int not null default 0,
  primary key (user_id, day)
);

alter table public.farms enable row level security;
alter table public.farm_members enable row level security;
alter table public.farm_invites enable row level security;
alter table public.ai_usage enable row level security;

-- Проверка членства без рекурсии RLS.
create or replace function public.is_farm_member(p_farm uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from farm_members where farm_id = p_farm and user_id = auth.uid())
$$;
create or replace function public.is_farm_owner(p_farm uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from farm_members where farm_id = p_farm and user_id = auth.uid() and role = 'owner')
$$;

drop policy if exists farms_select on public.farms;
create policy farms_select on public.farms for select to authenticated using (public.is_farm_member(id));
drop policy if exists farms_update on public.farms;
create policy farms_update on public.farms for update to authenticated
  using (public.is_farm_member(id)) with check (public.is_farm_member(id));
-- ai_enabled и отметку об отправке отчёта телефон менять не может.
revoke update on public.farms from authenticated;
grant update (name, data, report, report_email) on public.farms to authenticated;

drop policy if exists members_select on public.farm_members;
create policy members_select on public.farm_members for select to authenticated using (public.is_farm_member(farm_id));
drop policy if exists members_delete on public.farm_members;
create policy members_delete on public.farm_members for delete to authenticated
  using (public.is_farm_owner(farm_id) and user_id <> auth.uid());

drop policy if exists invites_select on public.farm_invites;
create policy invites_select on public.farm_invites for select to authenticated using (public.is_farm_owner(farm_id));
drop policy if exists invites_delete on public.farm_invites;
create policy invites_delete on public.farm_invites for delete to authenticated using (public.is_farm_owner(farm_id));
-- ai_usage: только сервер (service_role), политик для клиентов нет.

-- updated_at и updated_by ставит база, а не телефон.
create or replace function public.farms_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists farms_touch on public.farms;
create trigger farms_touch before update on public.farms for each row execute function public.farms_touch();

-- Моё хозяйство: найти или создать (первый вход владельца).
create or replace function public.my_farm()
returns public.farms language plpgsql security definer set search_path = public as $$
declare f farms;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select farms.* into f from farms join farm_members m on m.farm_id = farms.id
    where m.user_id = auth.uid() order by m.joined_at desc limit 1;  -- последнее, куда присоединился
  if found then return f; end if;
  insert into farms default values returning * into f;
  insert into farm_members(farm_id, user_id, role, email)
    values (f.id, auth.uid(), 'owner', (select email from auth.users where id = auth.uid()));
  return f;
end $$;

-- Создать код-приглашение (только владелец). 8 символов без похожих букв и цифр.
create or replace function public.create_invite(p_farm uuid)
returns text language plpgsql security definer set search_path = public as $$
declare c text; alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int;
begin
  if not is_farm_owner(p_farm) then raise exception 'only owner'; end if;
  delete from farm_invites where expires_at < now();
  c := '';
  for i in 1..8 loop c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
  insert into farm_invites(code, farm_id, created_by) values (c, p_farm, auth.uid());
  return c;
end $$;

-- Присоединиться по коду. Пустое хозяйство, созданное при первом входе, удаляется.
create or replace function public.join_farm(p_code text)
returns public.farms language plpgsql security definer set search_path = public as $$
declare inv farm_invites; f farms; old uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into inv from farm_invites where code = upper(trim(p_code)) and expires_at > now();
  if not found then raise exception 'invite not found'; end if;
  -- своё пустое хозяйство (без животных и других участников) убираем
  for old in select m.farm_id from farm_members m join farms fa on fa.id = m.farm_id
      where m.user_id = auth.uid() and m.role = 'owner' and m.farm_id <> inv.farm_id
        and coalesce(jsonb_array_length(fa.data->'animals'), 0) = 0
        and (select count(*) from farm_members x where x.farm_id = m.farm_id) = 1 loop
    delete from farms where id = old;
  end loop;
  insert into farm_members(farm_id, user_id, role, email)
    values (inv.farm_id, auth.uid(), 'member', (select email from auth.users where id = auth.uid()))
    on conflict do nothing;
  delete from farm_invites where code = inv.code;
  select * into f from farms where id = inv.farm_id;
  return f;
end $$;

-- Счётчик вопросов помощнику за день (вызывает только Edge Function).
create or replace function public.ai_bump(p_user uuid)
returns int language sql security definer set search_path = public as $$
  insert into ai_usage(user_id, day, count) values (p_user, (now() at time zone 'Europe/Riga')::date, 1)
  on conflict (user_id, day) do update set count = ai_usage.count + 1
  returning count
$$;

revoke all on function public.ai_bump(uuid) from public, anon, authenticated;
revoke all on function public.my_farm() from public, anon;
revoke all on function public.create_invite(uuid) from public, anon;
revoke all on function public.join_farm(text) from public, anon;
revoke all on function public.is_farm_member(uuid) from public, anon;
revoke all on function public.is_farm_owner(uuid) from public, anon;
grant execute on function public.my_farm() to authenticated;
grant execute on function public.create_invite(uuid) to authenticated;
grant execute on function public.join_farm(text) to authenticated;
grant execute on function public.is_farm_member(uuid) to authenticated;
grant execute on function public.is_farm_owner(uuid) to authenticated;

-- Живое обновление: что записала Настя, сразу видно у вас.
do $$ begin
  alter publication supabase_realtime add table public.farms;
exception when duplicate_object then null; end $$;
