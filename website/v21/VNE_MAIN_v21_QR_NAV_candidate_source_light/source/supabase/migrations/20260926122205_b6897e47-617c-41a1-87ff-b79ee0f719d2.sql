create table public.site_media (
  slot text primary key check (slot ~ '^[a-z0-9_-]{2,40}$'),
  value jsonb not null default '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
grant select on public.site_media to anon, authenticated;
grant all on public.site_media to service_role;
alter table public.site_media enable row level security;
create policy "site_media: public read" on public.site_media for select to anon, authenticated using (true);