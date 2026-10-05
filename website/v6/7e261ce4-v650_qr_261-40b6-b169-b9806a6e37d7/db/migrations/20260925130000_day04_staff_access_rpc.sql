-- День 04: узкая RPC для серверного guard зон /admin и /scan.
-- Возвращает только boolean: aal2 И живая сессия И актуальное назначение нужной роли.
create function public.my_staff_access(_area text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select case _area
    when 'admin' then private.staff_session_ok()
      and private.has_role(array['owner','admin','editor','moderator']::public.staff_role[])
    when 'scan' then private.staff_session_ok()
      and exists (
        select 1 from public.staff_assignments s
        where s.user_id = auth.uid()
          and s.role = any (array['owner','admin','scanner','shift_lead']::public.staff_role[])
          and s.revoked_at is null and s.valid_from <= now()
          and (s.valid_until is null or s.valid_until > now())
      )
    else false
  end
$$;
revoke execute on function public.my_staff_access(text) from public, anon;
grant execute on function public.my_staff_access(text) to authenticated;
