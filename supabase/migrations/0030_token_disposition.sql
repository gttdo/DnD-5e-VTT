-- Hostility / Opportunity Attacks (#101).
--
-- Each placed creature token is HOSTILE or FRIENDLY to the party. The DM toggles
-- this from the initiative tracker; it drives who provokes an Opportunity Attack
-- from whom (a creature provokes only creatures of the OPPOSING disposition).
--
-- NULL = unset — the app treats a statblock creature with no disposition as
-- hostile, and a player character (character_id set) as party-side (friendly)
-- regardless of this column.

alter table public.tokens
  add column if not exists disposition text
  check (disposition is null or disposition in ('hostile', 'friendly'));
