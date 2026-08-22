-- ============================================================================
-- D&D 5e VTT — 0046: per-scene ambience (the Ambiance channel)
--
-- Paste into Supabase SQL Editor → Run. Idempotent: safe to re-run.
--
-- A scene can carry a looping ambient track, chosen in the editor like a face.
-- Stored as a URL/path (bundled /Soundtrack/*.m4a today, storage-hosted later),
-- played at the table through the per-device Ambiance channel.
-- ============================================================================

alter table public.scenes add column if not exists ambience_url text;
