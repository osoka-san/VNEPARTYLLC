-- (P1) Устаревший обход модерации: без версии/истории/outbox. Приложение его не вызывает.
drop function if exists public.review_application(uuid, public.application_status);
drop function if exists private.review_application(uuid, public.application_status);

-- (P2) Ключ идемпотентности привязан к событию: тот же ключ с другим событием — отказ, не чужая заявка.
create or replace function private.submit_application(_event uuid, _display_name text, _age_confirmed boolean, _consent_version text, _idempotency uuid)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_key_event uuid; v_email text; v_recent int;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if _idempotency is null or _event is null then raise exception 'invalid request' using errcode = '22023'; end if;
  select id, event_id into v_id, v_key_event from public.applications where user_id = v_uid and idempotency_key = _idempotency;
  if v_id is not null then
    if v_key_event <> _event then raise exception 'idempotency key reused with different payload' using errcode = 'PT422'; end if;
    return v_id;
  end if;
  select id into v_id from public.applications where user_id = v_uid and event_id = _event;
  if v_id is not null then return v_id; end if;
  if coalesce(char_length(trim(_display_name)), 0) not between 1 and 80 or _age_confirmed is not true
     or coalesce(_consent_version, '') !~ '^[a-z0-9._-]{3,40}$' then
    raise exception 'invalid request' using errcode = '22023';
  end if;
  if not exists (select 1 from public.events e where e.id = _event and e.status = 'published') then
    raise exception 'event unavailable' using errcode = '22023';
  end if;
  select count(*) into v_recent from public.applications where user_id = v_uid and created_at > now() - interval '1 hour';
  if v_recent >= 10 then raise exception 'rate limited' using errcode = 'P0001'; end if;
  select email into v_email from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_email is null then raise exception 'contact unconfirmed' using errcode = '42501'; end if;
  insert into public.applications(event_id, user_id, display_name, contact_email, age_confirmed, consent_version, consent_at, consent_method, idempotency_key)
    values (_event, v_uid, trim(_display_name), v_email, true, _consent_version, now(), 'web_form_checkbox', _idempotency)
    on conflict (event_id, user_id) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.applications where user_id = v_uid and event_id = _event;
    return v_id;
  end if;
  perform private.log_app(v_id, null, 'submitted', null, 'application.submit');
  return v_id;
end $$;
revoke all on function private.submit_application(uuid, text, boolean, text, uuid) from public, anon;