-- Привязка конкретной ссылки приглашения к конкретной строке: храним только SHA-256 серверного nonce.
alter table public.invites add column if not exists token_hash text;
alter table public.invites add constraint invites_token_hash_format check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$');
create unique index if not exists invites_token_hash_uniq on public.invites(token_hash) where token_hash is not null;

drop function public.mark_invite(uuid, boolean, uuid, text);
create function public.mark_invite(_invite uuid, _sent boolean, _user uuid default null, _error text default null, _token_hash text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  if _sent and (_token_hash is null or _token_hash !~ '^[0-9a-f]{64}$') then
    raise exception 'token hash required' using errcode = '22023'; end if;
  update public.invites set
    status = case when _sent then 'sent'::public.invite_status else 'failed'::public.invite_status end,
    sent_at = case when _sent then now() else sent_at end,
    invited_user_id = coalesce(_user, invited_user_id),
    token_hash = case when _sent then _token_hash else null end,
    error = case when _sent then null else left(_error, 240) end,
    updated_at = now()
  where id = _invite and status = 'created';
  insert into private.audit_log(action, object_type, object_id, result, details)
  values (case when _sent then 'invite.sent' else 'invite.failed' end, 'invite', _invite, 'ok', jsonb_build_object('error', left(_error, 240)));
end $$;
revoke all on function public.mark_invite(uuid, boolean, uuid, text, text) from public, anon, authenticated;
grant execute on function public.mark_invite(uuid, boolean, uuid, text, text) to service_role;

-- Принятие: атомарно, только строка с совпавшим token_hash, этого пользователя, текущая, отправленная, неистёкшая.
drop function public.accept_invite(uuid);
create function public.accept_invite(_user uuid, _token_hash text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.invites where invited_user_id = _user)
     or exists (select 1 from public.invites where invited_user_id = _user and status = 'accepted') then
    return 'not_required';
  end if;
  if _token_hash is not null and _token_hash ~ '^[0-9a-f]{64}$' then
    update public.invites i set status = 'accepted', accepted_at = now(), updated_at = now()
     where i.invited_user_id = _user and i.token_hash = _token_hash
       and i.status = 'sent' and i.expires_at > now() and i.revoked_at is null
       and i.id = (select r.current_invite_id from public.membership_requests r where r.id = i.request_id)
     returning i.id into v;
  end if;
  insert into private.audit_log(actor, action, object_type, object_id, result)
    values (_user, 'invite.accept', 'invite', v, case when v is null then 'denied' else 'ok' end);
  return case when v is null then 'denied' else 'accepted' end;
end $$;
revoke execute on function public.accept_invite(uuid, text) from public, anon, authenticated;
grant execute on function public.accept_invite(uuid, text) to service_role;