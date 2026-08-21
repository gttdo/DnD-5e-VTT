import { supabase } from "./supabase";

/**
 * Content packs (P1) — serialize a campaign into a portable manifest, and
 * install a manifest into a fresh campaign on the DM's list.
 *
 * The manifest is just the campaign's rows with their real UUIDs; install
 * remaps every id to a new one, preserving the reference graph (scene →
 * chapter, doc → scene, hotspot → scene/map). Images are referenced, never
 * copied — the publisher's storage bucket is ours and never deletes.
 *
 * One serialization serves three consumers: the marketplace shelf, the human
 * DM who customizes an installed pack, and (later) the AI DM that runs it.
 */

export const PACK_VERSION = 1;

export interface PackManifest {
  version: number;
  chapters: PackChapter[];
  scenes: PackScene[];
  documents: PackDoc[];
  region_maps: PackRegionMap[];
  hotspots: PackHotspot[];
}

interface PackChapter {
  ref: string; // local id, remapped on install
  title: string;
  position: number;
  status: "draft" | "published";
  region_map_ref: string | null;
}
interface PackScene {
  ref: string;
  chapter_ref: string | null;
  name: string;
  description: string;
  image_url: string | null;
  cinematic_url: string | null;
  map_id: string | null;
  grid_cols: number;
  grid_rows: number;
  mode: string | null;
}
interface PackDoc {
  ref: string;
  scene_ref: string | null;
  chapter_ref: string | null;
  kind: string;
  title: string;
  content: string;
  visibility: string;
  position: number;
  meta: Record<string, unknown>;
}
interface PackRegionMap {
  ref: string;
  name: string;
  image_url: string;
}
interface PackHotspot {
  scene_ref: string | null;
  region_map_ref: string | null;
  target_scene_ref: string | null;
  target_map_ref: string | null;
  x: number;
  y: number;
  label: string | null;
  hidden: boolean;
}

export interface PackCard {
  id: string;
  name: string;
  tagline: string;
  cover_url: string | null;
  level_min: number | null;
  level_max: number | null;
  published: boolean;
  created_by: string;
}

// ---------------------------------------------------------------- serialize
/** Read a campaign's rows and build a portable manifest (publisher tool). */
export const serializeCampaign = async (gameId: string): Promise<{ manifest: PackManifest | null; error: string | null }> => {
  const [{ data: chapters }, { data: scenes }, { data: docs }, { data: regionMaps }] = await Promise.all([
    supabase.from("chapters").select("*").eq("game_id", gameId).order("position"),
    supabase.from("scenes").select("*").eq("game_id", gameId).order("created_at"),
    supabase.from("campaign_documents").select("*").eq("game_id", gameId).order("position"),
    supabase.from("region_maps").select("*").eq("game_id", gameId).order("created_at"),
  ]);

  const sceneIds = (scenes ?? []).map((s) => s.id);
  const mapIds = (regionMaps ?? []).map((m) => m.id);
  // Hotspots live on scenes OR region maps; fetch both sets.
  const { data: sceneHotspots } = sceneIds.length
    ? await supabase.from("hotspots").select("*").in("scene_id", sceneIds)
    : { data: [] };
  const { data: mapHotspots } = mapIds.length
    ? await supabase.from("hotspots").select("*").in("region_map_id", mapIds)
    : { data: [] };
  const hotspots = [...(sceneHotspots ?? []), ...(mapHotspots ?? [])];

  const manifest: PackManifest = {
    version: PACK_VERSION,
    chapters: (chapters ?? []).map((c) => ({
      ref: c.id,
      title: c.title,
      position: c.position,
      status: c.status,
      region_map_ref: c.region_map_id,
    })),
    scenes: (scenes ?? []).map((s) => ({
      ref: s.id,
      chapter_ref: s.chapter_id ?? null,
      name: s.name,
      description: s.description ?? "",
      image_url: s.image_url,
      cinematic_url: s.cinematic_url ?? null,
      map_id: s.map_id,
      grid_cols: s.grid_cols,
      grid_rows: s.grid_rows,
      mode: s.mode ?? null,
    })),
    documents: (docs ?? []).map((d) => ({
      ref: d.id,
      scene_ref: d.scene_id ?? null,
      chapter_ref: d.chapter_id ?? null,
      kind: d.kind,
      title: d.title,
      content: d.content,
      visibility: d.visibility,
      position: d.position,
      meta: d.meta ?? {},
    })),
    region_maps: (regionMaps ?? []).map((m) => ({ ref: m.id, name: m.name, image_url: m.image_url })),
    hotspots: hotspots.map((h) => ({
      scene_ref: h.scene_id ?? null,
      region_map_ref: h.region_map_id ?? null,
      target_scene_ref: h.target_scene_id ?? null,
      target_map_ref: h.target_map_id ?? null,
      x: h.x,
      y: h.y,
      label: h.label ?? null,
      hidden: h.hidden ?? false,
    })),
  };
  return { manifest, error: null };
};

// ------------------------------------------------------------------ install
/**
 * Install a manifest into a NEW campaign owned by the caller. Sequential by
 * necessity — later inserts need the ids the earlier ones return. `opts.
 * autoPublish` forces every chapter live (solo play; the draft-unboxing
 * ritual is only for human DMs).
 */
export const installPack = async (
  card: PackCard,
  manifest: PackManifest,
  userId: string,
  opts?: { autoPublish?: boolean }
): Promise<{ gameId: string | null; error: string | null }> => {
  const genCode = () => {
    const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)];
    return s;
  };

  // 1. The campaign.
  const { data: game, error: gameErr } = await supabase
    .from("games")
    .insert({
      name: card.name,
      dm_user_id: userId,
      join_code: genCode(),
      description: card.tagline,
      cover_url: card.cover_url,
      level_min: card.level_min,
      level_max: card.level_max,
    })
    .select()
    .single();
  if (gameErr || !game) return { gameId: null, error: gameErr?.message ?? "Could not create campaign" };
  const gameId = game.id as string;
  await supabase.from("game_members").insert({ game_id: gameId, user_id: userId, role: "dm" });

  const idMap = new Map<string, string>(); // manifest ref → new uuid

  // 2. Region maps (chapters + hotspots reference them).
  for (const m of manifest.region_maps) {
    const { data } = await supabase
      .from("region_maps")
      .insert({ game_id: gameId, name: m.name, image_url: m.image_url, created_by: userId })
      .select("id")
      .single();
    if (data) idMap.set(m.ref, data.id);
  }

  // 3. Chapters.
  for (const c of manifest.chapters) {
    const { data } = await supabase
      .from("chapters")
      .insert({
        game_id: gameId,
        title: c.title,
        position: c.position,
        status: opts?.autoPublish ? "published" : c.status,
        region_map_id: c.region_map_ref ? idMap.get(c.region_map_ref) ?? null : null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (data) idMap.set(c.ref, data.id);
  }

  // 4. Scenes.
  for (const s of manifest.scenes) {
    const { data } = await supabase
      .from("scenes")
      .insert({
        game_id: gameId,
        name: s.name,
        description: s.description,
        chapter_id: s.chapter_ref ? idMap.get(s.chapter_ref) ?? null : null,
        image_url: s.image_url,
        cinematic_url: s.cinematic_url,
        map_id: s.map_id,
        grid_cols: s.grid_cols,
        grid_rows: s.grid_rows,
        mode: s.mode ?? "tactical",
        created_by: userId,
      })
      .select("id")
      .single();
    if (data) idMap.set(s.ref, data.id);
  }

  // 5. Documents.
  for (const d of manifest.documents) {
    await supabase.from("campaign_documents").insert({
      game_id: gameId,
      kind: d.kind,
      title: d.title,
      content: d.content,
      visibility: d.visibility,
      scene_id: d.scene_ref ? idMap.get(d.scene_ref) ?? null : null,
      chapter_id: d.chapter_ref ? idMap.get(d.chapter_ref) ?? null : null,
      position: d.position,
      meta: d.meta,
      created_by: userId,
    });
  }

  // 6. Hotspots — remap both the host and the target.
  for (const h of manifest.hotspots) {
    const scene_id = h.scene_ref ? idMap.get(h.scene_ref) ?? null : null;
    const region_map_id = h.region_map_ref ? idMap.get(h.region_map_ref) ?? null : null;
    if (!scene_id && !region_map_id) continue; // orphan — skip
    await supabase.from("hotspots").insert({
      scene_id,
      region_map_id,
      target_scene_id: h.target_scene_ref ? idMap.get(h.target_scene_ref) ?? null : null,
      target_map_id: h.target_map_ref ? idMap.get(h.target_map_ref) ?? null : null,
      x: h.x,
      y: h.y,
      label: h.label,
      hidden: h.hidden,
      created_by: userId,
    });
  }

  // Stage the first scene so the table opens on something.
  const firstScene = manifest.scenes[0]?.ref ? idMap.get(manifest.scenes[0].ref) : null;
  if (firstScene) await supabase.from("games").update({ active_scene_id: firstScene }).eq("id", gameId);

  return { gameId, error: null };
};

// ------------------------------------------------------------- shelf + publish
export const fetchShelf = async (): Promise<PackCard[]> => {
  const { data } = await supabase
    .from("packs")
    .select("id, name, tagline, cover_url, level_min, level_max, published, created_by")
    .order("created_at", { ascending: false });
  return (data ?? []) as PackCard[];
};

export const fetchManifest = async (packId: string): Promise<PackManifest | null> => {
  const { data } = await supabase.from("packs").select("manifest").eq("id", packId).single();
  return (data?.manifest as PackManifest) ?? null;
};

export const isPublisher = async (userId: string): Promise<boolean> => {
  const { data } = await supabase.from("pack_publishers").select("user_id").eq("user_id", userId).maybeSingle();
  return Boolean(data);
};

/** Publisher tool: serialize a campaign and write it to the shelf. */
export const publishCampaignAsPack = async (
  gameId: string,
  userId: string,
  card: { name: string; tagline: string; cover_url: string | null; level_min: number | null; level_max: number | null },
  published: boolean
): Promise<{ error: string | null }> => {
  const { manifest, error } = await serializeCampaign(gameId);
  if (error || !manifest) return { error: error ?? "Serialize failed" };
  const { error: insErr } = await supabase.from("packs").insert({
    ...card,
    manifest,
    published,
    created_by: userId,
  });
  return { error: insErr?.message ?? null };
};
