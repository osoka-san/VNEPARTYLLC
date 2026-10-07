revoke insert (event_id, note) on public.applications from authenticated;
revoke update (status) on public.applications from authenticated;
revoke insert, update, delete on public.applications from authenticated, anon, public;