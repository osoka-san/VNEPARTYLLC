alter table public.profiles
  add column if not exists telegram_id bigint unique,
  add column if not exists telegram_username text
    check (telegram_username is null or telegram_username ~ '^[A-Za-z][A-Za-z0-9_]{4,31}$');
create unique index if not exists profiles_telegram_username_lower_uq
  on public.profiles (lower(telegram_username));
grant update (telegram_username) on public.profiles to authenticated;

create table if not exists private.telegram_login_nonce (
  hash text primary key,
  used_at timestamptz not null default now()
);
revoke all on private.telegram_login_nonce from public, anon, authenticated;
grant all on private.telegram_login_nonce to service_role;

create or replace function public.telegram_consume_login(_hash text, _telegram_id bigint)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v uuid;
begin
  insert into private.telegram_login_nonce(hash) values (_hash);
  select id into v from public.profiles where telegram_id = _telegram_id;
  return v;
exception when unique_violation then
  raise exception 'replay' using errcode = '42501';
end $$;
revoke all on function public.telegram_consume_login(text, bigint) from public, anon, authenticated;
grant execute on function public.telegram_consume_login(text, bigint) to service_role;