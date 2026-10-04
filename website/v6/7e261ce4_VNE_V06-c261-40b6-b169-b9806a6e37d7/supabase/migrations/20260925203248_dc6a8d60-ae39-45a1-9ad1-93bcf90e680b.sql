grant select on public.invites to authenticated;
create policy "invites: staff read" on public.invites for select to authenticated
using (private.staff_session_ok() and private.has_role(array['owner'::public.staff_role,'admin'::public.staff_role,'moderator'::public.staff_role]));