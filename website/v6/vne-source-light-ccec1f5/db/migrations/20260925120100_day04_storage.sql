-- Хранилище: применяется только если схема storage существует (Supabase).
-- public-media — публичные художественные изображения, чтение для всех, запись только service_role.
-- private-docs — закрытые файлы участника, путь начинается с его user id.
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'storage schema absent: skipped (local plain Postgres)';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values
    ('public-media', 'public-media', true, 5242880, array['image/avif','image/webp','image/jpeg','image/png']),
    ('private-docs', 'private-docs', false, 2097152, array['application/pdf','image/jpeg','image/png'])
  on conflict (id) do nothing;
  execute $p$create policy "private-docs: owner read" on storage.objects for select to authenticated
    using (bucket_id = 'private-docs' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy "private-docs: owner upload" on storage.objects for insert to authenticated
    with check (bucket_id = 'private-docs' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
end $$;
