-- Private storage for meal photos. Each person's photos live in a folder named
-- after their user id, and only they can read, add or delete them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meal-photos', 'meal-photos', false, 3145728, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do nothing;

create policy "meal photos: own read" on storage.objects for select to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "meal photos: own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "meal photos: own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
