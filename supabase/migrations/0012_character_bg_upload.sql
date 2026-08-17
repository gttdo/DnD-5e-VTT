-- Let signed-in users upload their own character-sheet backdrops.
--
-- The map-images bucket is already public-read; generated art is written by the
-- generate-map edge function (service role). This adds the one missing piece:
-- an INSERT policy so an authenticated client can upload a file directly (used
-- by the "Change background → Upload" option). Files land under character-bg/.

drop policy if exists "map_images_auth_insert" on storage.objects;
create policy "map_images_auth_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'map-images');
