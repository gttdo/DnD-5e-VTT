-- DM-only token visibility.
--
-- tokens.hidden = true means only the DM sees the token — on the board AND in
-- the initiative order. The filtering is done client-side: every player still
-- RECEIVES hidden rows over realtime, their UI just doesn't render them.
--
-- Why not enforce with RLS? Filtering SELECT by role breaks realtime's UPDATE
-- delivery in the hide direction: when a token flips to hidden, players lose
-- SELECT on the row, so the change event is withheld — and the token they can
-- no longer "see" stays frozen on their board. Client-side filtering keeps
-- sync correct at the cost of being inspectable by a determined cheater, which
-- is the right trade for a table of friends.

alter table public.tokens
  add column if not exists hidden boolean not null default false;
