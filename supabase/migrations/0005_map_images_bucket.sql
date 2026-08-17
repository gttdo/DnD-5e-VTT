-- ============================================================================
-- 0005_map_images_bucket.sql
--
-- Storage bucket for generated + uploaded map images.
--
-- Bucket is public: rendering a map is <image href="…public/map-images/…" />
-- which needs GET on the URL to work without a signed-URL round-trip. The
-- object names contain unguessable UUIDs so URL guessing is impractical.
--
-- Writes go through the Edge Function generate-map (task #6), which uses the
-- service_role key and bypasses RLS. No RLS write policy is needed for
-- authenticated clients.
--
-- Idempotent: safe to re-run.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('map-images', 'map-images', true)
on conflict (id) do update set public = true;

-- Public read (so the CDN URL works from <image href>).
drop policy if exists "map_images_public_read" on storage.objects;
create policy "map_images_public_read" on storage.objects
  for select using (bucket_id = 'map-images');
