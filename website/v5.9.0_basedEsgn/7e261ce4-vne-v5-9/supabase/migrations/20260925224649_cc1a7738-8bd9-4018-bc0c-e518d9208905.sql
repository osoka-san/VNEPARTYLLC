drop policy if exists "private-docs: owner read" on storage.objects;
drop policy if exists "private-docs: owner upload" on storage.objects;
drop policy if exists "private-docs: owner update" on storage.objects;
drop policy if exists "private-docs: owner delete" on storage.objects;

create policy "private-docs: owner read" on storage.objects for select to authenticated
  using (bucket_id = 'private-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "private-docs: owner upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'private-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "private-docs: owner update" on storage.objects for update to authenticated
  using (bucket_id = 'private-docs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'private-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "private-docs: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'private-docs' and (storage.foldername(name))[1] = auth.uid()::text);