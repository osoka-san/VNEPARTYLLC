alter table public.staff_assignments drop constraint event_scoped_roles;
alter table public.staff_assignments add constraint event_scoped_roles check (
  (role in ('moderator','scanner','shift_lead') and event_id is not null)
  or (role in ('owner','admin','editor','finance') and event_id is null));

create or replace function public.apply_payment_event(_provider text, _env text, _event_id text, _payment_id text, _order uuid, _kind text, _amount bigint, _currency text, _occurred_at timestamptz)
  returns text language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  return private.apply_payment_event(_provider, _env, _event_id, _payment_id, _order, _kind, _amount, _currency, _occurred_at);
end $$;
create or replace function public.expire_reservations() returns integer language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  return private.expire_reservations();
end $$;
revoke execute on function public.apply_payment_event(text,text,text,text,uuid,text,bigint,text,timestamptz), public.expire_reservations() from public, anon, authenticated;
grant execute on function public.apply_payment_event(text,text,text,text,uuid,text,bigint,text,timestamptz), public.expire_reservations() to service_role;