-- ===== Events: extended fields =====
alter table public.events
  add column if not exists description text not null default '',
  add column if not exists starts_at timestamptz,
  add column if not exists timezone text not null default 'Europe/Moscow',
  add column if not exists capacity integer check (capacity is null or capacity between 1 and 100000),
  add column if not exists sales_open boolean not null default false,
  add column if not exists sales_close_at timestamptz,
  add column if not exists reserve_ttl_minutes integer not null default 15 check (reserve_ttl_minutes between 5 and 240),
  add column if not exists qr_release_at timestamptz,
  add column if not exists address_reveal_at timestamptz,
  add column if not exists entry_opens_at timestamptz,
  add column if not exists entry_closes_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists is_synthetic boolean not null default false,
  add column if not exists version integer not null default 1,
  add column if not exists updated_at timestamptz not null default now();

create or replace function private.events_validate() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.slug !~ '^[a-z0-9-]{2,80}$' then raise exception 'invalid slug' using errcode = '22023'; end if;
  if new.timezone not in (select name from pg_catalog.pg_timezone_names) then raise exception 'invalid timezone' using errcode = '22023'; end if;
  if new.sales_close_at is not null and new.starts_at is not null and new.sales_close_at > new.starts_at then raise exception 'sales close after start' using errcode = '22023'; end if;
  if new.entry_opens_at is not null and new.entry_closes_at is not null and new.entry_closes_at <= new.entry_opens_at then raise exception 'entry window order' using errcode = '22023'; end if;
  if new.qr_release_at is not null and new.entry_opens_at is not null and new.qr_release_at > new.entry_opens_at then raise exception 'qr after entry' using errcode = '22023'; end if;
  if new.address_reveal_at is not null and new.starts_at is not null and new.address_reveal_at > new.starts_at then raise exception 'address after start' using errcode = '22023'; end if;
  if new.sales_open and (new.status <> 'published' or new.capacity is null or new.starts_at is null or new.sales_close_at is null or new.cancelled_at is not null) then
    raise exception 'sales require published event with capacity and dates' using errcode = '22023'; end if;
  return new;
end $$;
drop trigger if exists events_validate on public.events;
create trigger events_validate before insert or update on public.events for each row execute function private.events_validate();

-- ===== Private venue details (never public) =====
create table public.event_private_details (
  event_id uuid primary key references public.events(id) on delete restrict,
  venue_address text not null default '',
  staff_notes text not null default '',
  updated_by uuid,
  updated_at timestamptz not null default now()
);
revoke all on public.event_private_details from anon, authenticated, public;
grant select on public.event_private_details to authenticated;
grant all on public.event_private_details to service_role;
alter table public.event_private_details enable row level security;

-- ===== Tiers =====
create table public.event_tiers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  amount_minor bigint not null check (amount_minor between 0 and 100000000),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.event_tiers to anon, authenticated;
grant all on public.event_tiers to service_role;
alter table public.event_tiers enable row level security;

-- ===== Enums =====
create type public.reservation_status as enum ('active','converted','expired','cancelled');
create type public.order_status as enum ('awaiting_payment','paid','failed','cancelled','expired','needs_review','refunded');
create type public.payment_status as enum ('pending','succeeded','failed','refunded');
create type public.participation_status as enum ('active','revoked','refunded');

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  tier_id uuid not null references public.event_tiers(id) on delete restrict,
  user_id uuid not null,
  application_id uuid not null references public.applications(id) on delete restrict,
  status public.reservation_status not null default 'active',
  expires_at timestamptz not null,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index reservations_event_active on public.reservations(event_id) where status = 'active';

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references public.reservations(id) on delete restrict,
  user_id uuid not null,
  event_id uuid not null references public.events(id) on delete restrict,
  tier_id uuid not null references public.event_tiers(id) on delete restrict,
  tier_name text not null,
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  environment text not null check (environment in ('sandbox','live')),
  status public.order_status not null default 'awaiting_payment',
  review_reason text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_event on public.orders(event_id, created_at desc);
create index orders_user on public.orders(user_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  provider text not null,
  environment text not null check (environment in ('sandbox','live')),
  provider_payment_id text not null,
  status public.payment_status not null default 'pending',
  amount_minor bigint not null,
  currency text not null,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, environment, provider_payment_id)
);

create table public.payment_events (
  id bigint generated always as identity primary key,
  provider text not null,
  environment text not null,
  provider_event_id text not null,
  provider_payment_id text not null,
  order_id uuid not null references public.orders(id) on delete restrict,
  kind text not null,
  amount_minor bigint not null,
  currency text not null,
  occurred_at timestamptz not null,
  outcome text not null,
  received_at timestamptz not null default now(),
  unique (provider, environment, provider_event_id)
);

create table public.participations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  user_id uuid not null,
  status public.participation_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index participations_one_active on public.participations(event_id, user_id) where status = 'active';

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null,
  idempotency_key uuid not null unique,
  request_hash text not null,
  actor uuid not null,
  environment text not null,
  status text not null default 'succeeded_sandbox',
  created_at timestamptz not null default now()
);

grant select on public.reservations, public.orders, public.payments, public.payment_events, public.participations, public.refunds to authenticated;
grant all on public.reservations, public.orders, public.payments, public.payment_events, public.participations, public.refunds to service_role;
alter table public.reservations enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.participations enable row level security;
alter table public.refunds enable row level security;

-- ===== Capabilities =====
create or replace function private.staff_can(_cap text, _event uuid default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.staff_session_ok() and case _cap
    when 'shell' then exists (select 1 from public.staff_assignments s where s.user_id = auth.uid()
      and s.role = any (array['owner','admin','editor','moderator','finance']::public.staff_role[])
      and s.revoked_at is null and s.valid_from <= now() and (s.valid_until is null or s.valid_until > now()))
    when 'membership' then private.has_role(array['owner','admin']::public.staff_role[], null)
    when 'team' then private.has_role(array['owner','admin']::public.staff_role[], null)
    when 'content' then private.has_role(array['owner','admin','editor']::public.staff_role[], null)
    when 'event_moderate' then _event is not null and private.has_role(array['owner','admin','moderator']::public.staff_role[], _event)
    when 'events_manage' then private.has_role(array['owner','admin']::public.staff_role[], null)
    when 'orders_view' then private.has_role(array['owner','admin','finance']::public.staff_role[], null)
      or (_event is not null and private.has_role(array['shift_lead']::public.staff_role[], _event))
    when 'finance_refund' then private.has_role(array['owner','finance']::public.staff_role[], null)
    when 'payment_simulate' then private.has_role(array['owner','admin','finance']::public.staff_role[], null)
    else false end
$$;

-- ===== Policies =====
create policy "private details: event managers" on public.event_private_details for select to authenticated
  using (private.staff_can('events_manage'));
create policy "tiers: public of published" on public.event_tiers for select to anon, authenticated
  using (active and exists (select 1 from public.events e where e.id = event_id and e.status = 'published'));
create policy "tiers: managers" on public.event_tiers for select to authenticated using (private.staff_can('events_manage'));
create policy "reservations: own" on public.reservations for select to authenticated using (user_id = auth.uid() and private.is_admitted(auth.uid()));
create policy "reservations: staff" on public.reservations for select to authenticated using (private.staff_can('orders_view', event_id));
create policy "orders: own" on public.orders for select to authenticated using (user_id = auth.uid() and private.is_admitted(auth.uid()));
create policy "orders: staff" on public.orders for select to authenticated using (private.staff_can('orders_view', event_id));
create policy "payments: own" on public.payments for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()) and private.is_admitted(auth.uid()));
create policy "payments: staff" on public.payments for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id and private.staff_can('orders_view', o.event_id)));
create policy "payment events: staff" on public.payment_events for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id and private.staff_can('orders_view', o.event_id)));
create policy "participations: own" on public.participations for select to authenticated using (user_id = auth.uid() and private.is_admitted(auth.uid()));
create policy "participations: staff" on public.participations for select to authenticated using (private.staff_can('orders_view', event_id));
create policy "refunds: staff" on public.refunds for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id and private.staff_can('orders_view', o.event_id)));
create policy "events: managers read all" on public.events for select to authenticated using (private.staff_can('events_manage'));

-- ===== Helpers =====
create or replace function private.seats_taken(_event uuid) returns integer language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.participations p where p.event_id = _event and p.status = 'active')::int
       + (select count(*) from public.reservations r where r.event_id = _event and r.status = 'active' and r.expires_at > now())::int
$$;

-- ===== Guest: reserve seat (one atomic operation) =====
create or replace function private.reserve_seat(_event uuid, _tier uuid, _idem uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); e public.events; t public.event_tiers; r public.reservations; o public.orders; v_app uuid;
begin
  if u is null or not private.is_admitted(u) then raise exception 'forbidden' using errcode = '42501'; end if;
  if _idem is null then raise exception 'idempotency required' using errcode = '22023'; end if;
  -- replay of the same command returns the existing result
  select * into r from public.reservations where user_id = u and idempotency_key = _idem;
  if found then
    if r.event_id <> _event or r.tier_id <> _tier then raise exception 'idempotency key reused' using errcode = '22023'; end if;
    select * into o from public.orders where reservation_id = r.id;
    return jsonb_build_object('order_id', o.id, 'replayed', true);
  end if;
  select * into e from public.events where id = _event for update;  -- serializes last-seat contention
  if not found or e.status <> 'published' or not e.sales_open or e.cancelled_at is not null then raise exception 'sales closed' using errcode = 'P0001'; end if;
  if now() >= e.sales_close_at then raise exception 'sales closed' using errcode = 'P0001'; end if;
  select a.id into v_app from public.applications a where a.event_id = _event and a.user_id = u and a.status = 'approved' limit 1;
  if v_app is null then raise exception 'not approved' using errcode = '42501'; end if;
  select * into t from public.event_tiers where id = _tier and event_id = _event and active;
  if not found then raise exception 'tier unavailable' using errcode = 'P0001'; end if;
  -- expire stale holds of this event right here; does not rely on cron
  update public.reservations set status = 'expired', updated_at = now() where event_id = _event and status = 'active' and expires_at <= now();
  update public.orders o2 set status = 'expired', updated_at = now(), version = version + 1
    from public.reservations r2 where r2.id = o2.reservation_id and r2.event_id = _event and r2.status = 'expired' and o2.status = 'awaiting_payment';
  if exists (select 1 from public.participations p where p.event_id = _event and p.user_id = u and p.status = 'active')
     or exists (select 1 from public.reservations x where x.event_id = _event and x.user_id = u and x.status = 'active') then
    raise exception 'already holding' using errcode = 'P0002'; end if;
  if private.seats_taken(_event) >= e.capacity then raise exception 'sold out' using errcode = 'P0003'; end if;
  insert into public.reservations(event_id, tier_id, user_id, application_id, expires_at, idempotency_key)
    values (_event, _tier, u, v_app, now() + make_interval(mins => e.reserve_ttl_minutes), _idem) returning * into r;
  insert into public.orders(reservation_id, user_id, event_id, tier_id, tier_name, amount_minor, currency, environment)
    values (r.id, u, _event, _tier, t.name, t.amount_minor, t.currency, 'sandbox') returning * into o;
  insert into private.audit_log(actor, action, object_type, object_id, result, details)
    values (u, 'order.create', 'order', o.id, 'ok', jsonb_build_object('event', _event, 'amount_minor', o.amount_minor, 'currency', o.currency));
  return jsonb_build_object('order_id', o.id, 'replayed', false);
end $$;

create or replace function private.cancel_my_order(_order uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); o public.orders;
begin
  if u is null or not private.is_admitted(u) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into o from public.orders where id = _order and user_id = u for update;
  if not found then raise exception 'not found' using errcode = '42501'; end if;
  if o.status <> 'awaiting_payment' then return o.status::text; end if;
  update public.orders set status = 'cancelled', updated_at = now(), version = version + 1 where id = o.id;
  update public.reservations set status = 'cancelled', updated_at = now() where id = o.reservation_id and status = 'active';
  insert into private.audit_log(actor, action, object_type, object_id, result) values (u, 'order.cancel', 'order', o.id, 'ok');
  return 'cancelled';
end $$;

-- ===== Provider event reconciliation (service_role only, after signature check) =====
create or replace function private.apply_payment_event(_provider text, _env text, _event_id text, _payment_id text,
  _order uuid, _kind text, _amount bigint, _currency text, _occurred_at timestamptz) returns text
language plpgsql security definer set search_path = '' as $$
declare o public.orders; r public.reservations; p public.payments; v_outcome text; rank_new int; rank_old int;
begin
  if _kind not in ('pending','succeeded','failed') then return 'invalid_kind'; end if;
  if exists (select 1 from public.payment_events where provider = _provider and environment = _env and provider_event_id = _event_id) then return 'duplicate'; end if;
  select * into o from public.orders where id = _order for update;
  if not found then return 'unknown_order'; end if;
  if o.environment <> _env or o.amount_minor <> _amount or o.currency <> _currency then return 'mismatch'; end if;
  select * into p from public.payments where provider = _provider and environment = _env and provider_payment_id = _payment_id for update;
  if found and p.order_id <> o.id then return 'mismatch'; end if;
  if not found then
    insert into public.payments(order_id, provider, environment, provider_payment_id, amount_minor, currency, last_event_at)
      values (o.id, _provider, _env, _payment_id, _amount, _currency, _occurred_at) returning * into p;
  end if;
  -- monotonic reconciliation: pending(0) < failed(1) < succeeded(2); refunded is terminal and set only by refund
  rank_new := case _kind when 'pending' then 0 when 'failed' then 1 else 2 end;
  rank_old := case p.status when 'pending' then 0 when 'failed' then 1 when 'succeeded' then 2 else 3 end;
  if rank_new <= rank_old and not (rank_new = 0 and rank_old = 0) then
    v_outcome := 'stale';
  elsif _kind = 'pending' then
    v_outcome := 'pending';
  else
    update public.payments set status = _kind::public.payment_status, last_event_at = _occurred_at, updated_at = now() where id = p.id;
    select * into r from public.reservations where id = o.reservation_id for update;
    if _kind = 'failed' then
      if o.status = 'awaiting_payment' then
        update public.orders set status = 'failed', updated_at = now(), version = version + 1 where id = o.id;
        update public.reservations set status = 'cancelled', updated_at = now() where id = r.id and status = 'active';
      end if;
      v_outcome := 'failed';
    elsif o.status = 'awaiting_payment' and r.status = 'active' and r.expires_at > now() then
      update public.orders set status = 'paid', updated_at = now(), version = version + 1 where id = o.id;
      update public.reservations set status = 'converted', updated_at = now() where id = r.id;
      insert into public.participations(order_id, event_id, user_id) values (o.id, o.event_id, o.user_id);
      insert into private.outbox(topic, payload, status) values ('participation.confirmed', jsonb_build_object('order', o.id), 'held');
      v_outcome := 'paid';
    elsif o.status = 'paid' then
      v_outcome := 'already_paid';
    else
      -- late / after cancel / after failure: never grant a seat over capacity automatically
      update public.orders set status = 'needs_review', review_reason = 'late_payment:' || o.status::text, updated_at = now(), version = version + 1 where id = o.id;
      if r.status = 'active' then update public.reservations set status = 'expired', updated_at = now() where id = r.id; end if;
      insert into private.outbox(topic, payload, status) values ('order.needs_review', jsonb_build_object('order', o.id), 'held');
      v_outcome := 'needs_review';
    end if;
  end if;
  insert into public.payment_events(provider, environment, provider_event_id, provider_payment_id, order_id, kind, amount_minor, currency, occurred_at, outcome)
    values (_provider, _env, _event_id, _payment_id, o.id, _kind, _amount, _currency, _occurred_at, v_outcome);
  insert into private.audit_log(action, object_type, object_id, result, details)
    values ('payment.event', 'order', o.id, case when v_outcome in ('stale','already_paid') then 'noop' else 'ok' end,
      jsonb_build_object('kind', _kind, 'outcome', v_outcome, 'provider', _provider, 'env', _env));
  return v_outcome;
end $$;

create or replace function private.expire_reservations() returns integer
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  with x as (update public.reservations set status = 'expired', updated_at = now() where status = 'active' and expires_at <= now() returning id)
  select count(*) into n from x;
  update public.orders o set status = 'expired', updated_at = now(), version = version + 1
    from public.reservations r where r.id = o.reservation_id and r.status = 'expired' and o.status = 'awaiting_payment';
  return n;
end $$;

-- ===== Staff: events =====
create or replace function private.admin_save_event(_id uuid, _expected_version int, _data jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid; u uuid := auth.uid();
begin
  if not private.staff_can('events_manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if _id is null then
    insert into public.events(slug, title, description, starts_at, timezone, capacity, sales_close_at, reserve_ttl_minutes,
      qr_release_at, address_reveal_at, entry_opens_at, entry_closes_at, is_synthetic)
    values (_data->>'slug', _data->>'title', coalesce(_data->>'description',''), (_data->>'starts_at')::timestamptz,
      coalesce(_data->>'timezone','Europe/Moscow'), (_data->>'capacity')::int, (_data->>'sales_close_at')::timestamptz,
      coalesce((_data->>'reserve_ttl_minutes')::int, 15), (_data->>'qr_release_at')::timestamptz, (_data->>'address_reveal_at')::timestamptz,
      (_data->>'entry_opens_at')::timestamptz, (_data->>'entry_closes_at')::timestamptz, coalesce((_data->>'is_synthetic')::boolean, false))
    returning id into v;
  else
    update public.events set slug = _data->>'slug', title = _data->>'title', description = coalesce(_data->>'description',''),
      starts_at = (_data->>'starts_at')::timestamptz, timezone = coalesce(_data->>'timezone', timezone), capacity = (_data->>'capacity')::int,
      sales_close_at = (_data->>'sales_close_at')::timestamptz, reserve_ttl_minutes = coalesce((_data->>'reserve_ttl_minutes')::int, reserve_ttl_minutes),
      qr_release_at = (_data->>'qr_release_at')::timestamptz, address_reveal_at = (_data->>'address_reveal_at')::timestamptz,
      entry_opens_at = (_data->>'entry_opens_at')::timestamptz, entry_closes_at = (_data->>'entry_closes_at')::timestamptz,
      version = version + 1, updated_at = now()
    where id = _id and version = _expected_version returning id into v;
    if v is null then raise exception 'version conflict' using errcode = '40001'; end if;
  end if;
  insert into private.audit_log(actor, action, object_type, object_id, result) values (u, 'event.save', 'event', v, 'ok');
  return v;
end $$;

create or replace function private.admin_event_transition(_id uuid, _action text, _expected_version int) returns text
language plpgsql security definer set search_path = '' as $$
declare e public.events; u uuid := auth.uid();
begin
  if not private.staff_can('events_manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into e from public.events where id = _id for update;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if e.version <> _expected_version then raise exception 'version conflict' using errcode = '40001'; end if;
  case _action
    when 'publish' then update public.events set status = 'published' where id = _id;
    when 'unpublish' then update public.events set status = 'draft', sales_open = false where id = _id;
    when 'open_sales' then update public.events set sales_open = true where id = _id;
    when 'close_sales' then update public.events set sales_open = false where id = _id;
    when 'archive' then update public.events set status = 'archived', sales_open = false where id = _id;
    when 'cancel' then update public.events set cancelled_at = now(), sales_open = false where id = _id;
      -- sandbox cancellation: open holds are cancelled; paid orders go to review, nothing is deleted
      update public.orders o set status = 'cancelled', updated_at = now(), version = o.version + 1 where o.event_id = _id and o.status = 'awaiting_payment';
      update public.reservations set status = 'cancelled', updated_at = now() where event_id = _id and status = 'active';
      update public.orders o set status = 'needs_review', review_reason = 'event_cancelled', updated_at = now(), version = o.version + 1 where o.event_id = _id and o.status = 'paid';
    else raise exception 'invalid action' using errcode = '22023';
  end case;
  update public.events set version = version + 1, updated_at = now() where id = _id;
  insert into private.audit_log(actor, action, object_type, object_id, result) values (u, 'event.' || _action, 'event', _id, 'ok');
  return _action;
end $$;

create or replace function private.admin_save_tier(_event uuid, _tier uuid, _name text, _amount bigint, _currency text, _active boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not private.staff_can('events_manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  if _tier is null then
    insert into public.event_tiers(event_id, name, amount_minor, currency, active) values (_event, _name, _amount, upper(_currency), _active) returning id into v;
  else
    -- price changes never touch existing orders (they keep their snapshot)
    update public.event_tiers set name = _name, amount_minor = _amount, currency = upper(_currency), active = _active, updated_at = now()
      where id = _tier and event_id = _event returning id into v;
  end if;
  insert into private.audit_log(actor, action, object_type, object_id, result, details) values (auth.uid(), 'tier.save', 'event', _event, 'ok', jsonb_build_object('tier', v));
  return v;
end $$;

create or replace function private.admin_save_private_details(_event uuid, _address text, _notes text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.staff_can('events_manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.event_private_details(event_id, venue_address, staff_notes, updated_by) values (_event, left(_address, 500), left(_notes, 2000), auth.uid())
  on conflict (event_id) do update set venue_address = excluded.venue_address, staff_notes = excluded.staff_notes, updated_by = excluded.updated_by, updated_at = now();
  insert into private.audit_log(actor, action, object_type, object_id, result) values (auth.uid(), 'event.private_details', 'event', _event, 'ok');
end $$;

-- ===== Staff: sandbox refund =====
create or replace function private.refund_sandbox(_order uuid, _amount bigint, _idem uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o public.orders; f public.refunds; h text; u uuid := auth.uid(); done bigint;
begin
  select * into o from public.orders where id = _order for update;
  if not found or not private.staff_can('finance_refund') then raise exception 'forbidden' using errcode = '42501'; end if;
  h := encode(extensions.digest(_order::text || ':' || _amount::text, 'sha256'), 'hex');
  select * into f from public.refunds where idempotency_key = _idem;
  if found then
    if f.request_hash <> h then raise exception 'idempotency key reused' using errcode = '22023'; end if;
    return jsonb_build_object('refund_id', f.id, 'replayed', true);
  end if;
  if o.environment <> 'sandbox' then raise exception 'live refunds disabled' using errcode = '42501'; end if;
  if o.status not in ('paid','needs_review') then raise exception 'not refundable' using errcode = 'P0001'; end if;
  select coalesce(sum(amount_minor),0) into done from public.refunds where order_id = o.id;
  if _amount <= 0 or _amount + done > o.amount_minor then raise exception 'invalid amount' using errcode = '22023'; end if;
  insert into public.refunds(order_id, amount_minor, currency, idempotency_key, request_hash, actor, environment)
    values (o.id, _amount, o.currency, _idem, h, u, o.environment) returning * into f;
  if _amount + done = o.amount_minor then
    update public.orders set status = 'refunded', updated_at = now(), version = version + 1 where id = o.id;
    update public.participations set status = 'refunded', updated_at = now() where order_id = o.id and status = 'active';
    update public.payments set status = 'refunded', updated_at = now() where order_id = o.id and status = 'succeeded';
  end if;
  insert into private.outbox(topic, payload, status) values ('order.refunded', jsonb_build_object('order', o.id, 'refund', f.id), 'held');
  insert into private.audit_log(actor, action, object_type, object_id, result, details)
    values (u, 'order.refund_sandbox', 'order', o.id, 'ok', jsonb_build_object('amount_minor', _amount));
  return jsonb_build_object('refund_id', f.id, 'replayed', false);
end $$;

create or replace function private.order_history(_order uuid) returns table(at timestamptz, action text, result text, details jsonb)
language sql stable security definer set search_path = '' as $$
  select a.at, a.action, a.result, a.details from private.audit_log a
  where a.object_id = _order and exists (select 1 from public.orders o where o.id = _order and private.staff_can('orders_view', o.event_id))
  order by a.at desc limit 100
$$;

-- ===== Public wrappers (invoker) =====
create or replace function public.reserve_seat(_event uuid, _tier uuid, _idem uuid) returns jsonb language sql set search_path = '' as $$ select private.reserve_seat(_event, _tier, _idem) $$;
create or replace function public.cancel_my_order(_order uuid) returns text language sql set search_path = '' as $$ select private.cancel_my_order(_order) $$;
create or replace function public.admin_save_event(_id uuid, _expected_version int, _data jsonb) returns uuid language sql set search_path = '' as $$ select private.admin_save_event(_id, _expected_version, _data) $$;
create or replace function public.admin_event_transition(_id uuid, _action text, _expected_version int) returns text language sql set search_path = '' as $$ select private.admin_event_transition(_id, _action, _expected_version) $$;
create or replace function public.admin_save_tier(_event uuid, _tier uuid, _name text, _amount bigint, _currency text, _active boolean) returns uuid language sql set search_path = '' as $$ select private.admin_save_tier(_event, _tier, _name, _amount, _currency, _active) $$;
create or replace function public.admin_save_private_details(_event uuid, _address text, _notes text) returns void language sql set search_path = '' as $$ select private.admin_save_private_details(_event, _address, _notes) $$;
create or replace function public.refund_sandbox(_order uuid, _amount bigint, _idem uuid) returns jsonb language sql set search_path = '' as $$ select private.refund_sandbox(_order, _amount, _idem) $$;
create or replace function public.order_history(_order uuid) returns table(at timestamptz, action text, result text, details jsonb) language sql stable set search_path = '' as $$ select * from private.order_history(_order) $$;
create or replace function public.apply_payment_event(_provider text, _env text, _event_id text, _payment_id text, _order uuid, _kind text, _amount bigint, _currency text, _occurred_at timestamptz)
  returns text language plpgsql set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  return private.apply_payment_event(_provider, _env, _event_id, _payment_id, _order, _kind, _amount, _currency, _occurred_at);
end $$;
create or replace function public.expire_reservations() returns integer language plpgsql set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  return private.expire_reservations();
end $$;

-- ===== EXECUTE grants =====
revoke execute on function private.reserve_seat(uuid,uuid,uuid), private.cancel_my_order(uuid), private.apply_payment_event(text,text,text,text,uuid,text,bigint,text,timestamptz),
  private.expire_reservations(), private.admin_save_event(uuid,int,jsonb), private.admin_event_transition(uuid,text,int),
  private.admin_save_tier(uuid,uuid,text,bigint,text,boolean), private.admin_save_private_details(uuid,text,text),
  private.refund_sandbox(uuid,bigint,uuid), private.order_history(uuid), private.seats_taken(uuid), private.events_validate() from public, anon;
grant execute on function private.reserve_seat(uuid,uuid,uuid), private.cancel_my_order(uuid), private.admin_save_event(uuid,int,jsonb),
  private.admin_event_transition(uuid,text,int), private.admin_save_tier(uuid,uuid,text,bigint,text,boolean),
  private.admin_save_private_details(uuid,text,text), private.refund_sandbox(uuid,bigint,uuid), private.order_history(uuid) to authenticated;
revoke execute on function private.apply_payment_event(text,text,text,text,uuid,text,bigint,text,timestamptz), private.expire_reservations() from authenticated;
grant execute on function private.apply_payment_event(text,text,text,text,uuid,text,bigint,text,timestamptz), private.expire_reservations() to service_role;

revoke execute on function public.reserve_seat(uuid,uuid,uuid), public.cancel_my_order(uuid), public.admin_save_event(uuid,int,jsonb),
  public.admin_event_transition(uuid,text,int), public.admin_save_tier(uuid,uuid,text,bigint,text,boolean),
  public.admin_save_private_details(uuid,text,text), public.refund_sandbox(uuid,bigint,uuid), public.order_history(uuid),
  public.apply_payment_event(text,text,text,text,uuid,text,bigint,text,timestamptz), public.expire_reservations() from public, anon;
grant execute on function public.reserve_seat(uuid,uuid,uuid), public.cancel_my_order(uuid), public.admin_save_event(uuid,int,jsonb),
  public.admin_event_transition(uuid,text,int), public.admin_save_tier(uuid,uuid,text,bigint,text,boolean),
  public.admin_save_private_details(uuid,text,text), public.refund_sandbox(uuid,bigint,uuid), public.order_history(uuid) to authenticated;
revoke execute on function public.apply_payment_event(text,text,text,text,uuid,text,bigint,text,timestamptz), public.expire_reservations() from authenticated;
grant execute on function public.apply_payment_event(text,text,text,text,uuid,text,bigint,text,timestamptz), public.expire_reservations() to service_role;