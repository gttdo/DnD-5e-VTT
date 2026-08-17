-- ============================================================================
-- 0025_reconcile_spell_names_srd.sql
--
-- The spell art files were renamed from British / BG3 spellings to SRD
-- (Colour->Color, Armour->Armor, Favour->Favor, Bone Chill->Chill Touch).
-- If you already ran the OLD 0023 (British names), this repairs those live
-- rows in place: renames the token + repoints image_url to the renamed file
-- + fixes the name embedded in details. Run this ONCE, then run 0024.
--
-- Safe to run even if you re-ran the new 0023: it only touches the 5 rows and
-- no-ops if the British names are already gone.
-- Idempotent.
-- ============================================================================

do $$
declare
  me uuid;
begin
  select id into me from auth.users where email = 'vinces.gerardo@gmail.com';
  if me is null then
    raise exception 'No auth user for that email — edit the OWNER email.';
  end if;

  update public.token_assets t set
    name = m.new_name,
    image_url = m.new_url,
    details = jsonb_set(coalesce(t.details, '{}'::jsonb), '{spell,name}', to_jsonb(m.new_name))
  from (values
    ('Bone Chill',        'Chill Touch',      '/icons/spells/cantrips/chill_touch.png'),
    ('Colour Spray',      'Color Spray',      '/icons/spells/level_1/color_spray.png'),
    ('Mage Armour',       'Mage Armor',       '/icons/spells/level_1/mage_armor.png'),
    ('Divine Favour',     'Divine Favor',     '/icons/spells/level_1/divine_favor.png'),
    ('Armour of Agathys', 'Armor of Agathys', '/icons/spells/level_1/armor_of_agathys.png')
  ) as m(old_name, new_name, new_url)
  where t.owner_id = me and t.token_type = 'spell' and t.name = m.old_name;
end $$;
