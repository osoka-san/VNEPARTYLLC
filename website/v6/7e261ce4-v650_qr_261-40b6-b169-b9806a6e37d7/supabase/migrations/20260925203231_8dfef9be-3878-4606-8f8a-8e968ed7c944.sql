create type public.invite_status as enum ('created','sent','failed','accepted','revoked','expired','replaced');

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  request_id uuid references public.membership_requests(id),
  email text not null,
  status public.invite_status not null default 'created',
  issued_by uuid,
  invited_user_id uuid,
  expires_at timestamptz not null default now() + interval '7 days',
  sent_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index invites_request_idx on public.invites(request_id, created_at desc);
create index invites_user_idx on public.invites(invited_user_id);
grant all on public.invites to service_role;
revoke all on public.invites from anon, authenticated;
alter table public.invites enable row level security;

alter table public.membership_requests add column if not exists current_invite_id uuid references public.invites(id);

create table public.site_sections (
  key text primary key check (key ~ '^[a-z0-9_-]{2,40}$'),
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 4000),
  status text not null default 'draft' check (status in ('draft','published')),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.site_sections to anon, authenticated;
grant all on public.site_sections to service_role;
alter table public.site_sections enable row level security;
create policy "sections: public read published" on public.site_sections for select to anon, authenticated using (status = 'published');

create or replace function private.invite_code() returns text language plpgsql volatile set search_path = '' as $$
declare a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; b bytea := extensions.gen_random_bytes(8); r text := 'VNE-'; i int;
begin
  for i in 0..7 loop
    if i = 4 then r := r || '-'; end if;
    r := r || substr(a, (get_byte(b, i) % 31) + 1, 1);
  end loop;
  return r;
end $$;

create or replace function public.issue_invite(_request uuid, _actor uuid)
returns table(id uuid, code text) language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_code text; v_email text; n int := 0;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  select r.email into v_email from public.membership_requests r where r.id = _request and r.status = 'approved';
  if v_email is null then raise exception 'not approved' using errcode = '22023'; end if;
  update public.invites i set status = 'replaced', updated_at = now()
   where i.request_id = _request and i.status in ('created','sent','failed');
  loop
    n := n + 1;
    begin
      insert into public.invites(code, request_id, email, issued_by)
      values (private.invite_code(), _request, v_email, _actor) returning invites.id, invites.code into v_id, v_code;
      exit;
    exception when unique_violation then
      if n > 5 then raise; end if;
    end;
  end loop;
  update public.membership_requests set current_invite_id = v_id, updated_at = now() where membership_requests.id = _request;
  insert into private.audit_log(actor, action, object_type, object_id, result, details)
  values (_actor, 'invite.issue', 'invite', v_id, 'ok', jsonb_build_object('code', v_code, 'request', _request));
  return query select v_id, v_code;
end $$;

create or replace function public.mark_invite(_invite uuid, _sent boolean, _user uuid default null, _error text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.invites set
    status = case when _sent then 'sent'::public.invite_status else 'failed'::public.invite_status end,
    sent_at = case when _sent then now() else sent_at end,
    invited_user_id = coalesce(_user, invited_user_id),
    error = case when _sent then null else left(_error, 240) end,
    updated_at = now()
  where id = _invite and status = 'created';
  insert into private.audit_log(action, object_type, object_id, result, details)
  values (case when _sent then 'invite.sent' else 'invite.failed' end, 'invite', _invite, 'ok', jsonb_build_object('error', left(_error, 240)));
end $$;

create or replace function public.accept_invite(_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.invites set status = 'accepted', accepted_at = now(), updated_at = now()
   where invited_user_id = _user and status = 'sent' and expires_at > now()
   returning id into v;
  if v is not null then
    insert into private.audit_log(actor, action, object_type, object_id, result) values (_user, 'invite.accept', 'invite', v, 'ok');
  end if;
end $$;

create or replace function public.revoke_invite(_invite uuid, _actor uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.invites set status = 'revoked', revoked_at = now(), updated_at = now()
   where id = _invite and status in ('created','sent','failed') returning id into v;
  insert into private.audit_log(actor, action, object_type, object_id, result)
  values (_actor, 'invite.revoke', 'invite', _invite, case when v is null then 'noop' else 'ok' end);
  return v is not null;
end $$;

create or replace function public.save_site_section(_key text, _title text, _body text, _status text, _actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.site_sections(key, title, body, status, updated_by)
  values (_key, _title, _body, _status, _actor)
  on conflict (key) do update set title = excluded.title, body = excluded.body, status = excluded.status,
    updated_by = excluded.updated_by, updated_at = now();
  insert into private.audit_log(actor, action, object_type, result, details)
  values (_actor, 'section.save', 'site_section', 'ok', jsonb_build_object('key', _key, 'status', _status));
end $$;

create or replace function public.request_history(_request uuid)
returns table(at timestamptz, action text, result text, details jsonb) language sql stable security definer set search_path = '' as $$
  select a.at, a.action, a.result, a.details from private.audit_log a
  where auth.role() = 'service_role' and (a.object_id = _request
     or a.object_id in (select i.id from public.invites i where i.request_id = _request))
  order by a.at desc limit 50
$$;

revoke all on function private.invite_code() from public, anon, authenticated;
revoke all on function public.issue_invite(uuid,uuid), public.mark_invite(uuid,boolean,uuid,text), public.accept_invite(uuid),
  public.revoke_invite(uuid,uuid), public.save_site_section(text,text,text,text,uuid), public.request_history(uuid) from public, anon, authenticated;
grant execute on function public.issue_invite(uuid,uuid), public.mark_invite(uuid,boolean,uuid,text), public.accept_invite(uuid),
  public.revoke_invite(uuid,uuid), public.save_site_section(text,text,text,text,uuid), public.request_history(uuid) to service_role;