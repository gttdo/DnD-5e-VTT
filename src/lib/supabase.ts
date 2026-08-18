import { createClient } from "@supabase/supabase-js";
import type { Character } from "../types/character";
import type { TokenType, TokenDetails, MonsterStatblock, SpellAreaShape } from "../types/content";
import type { TokenLoot } from "./loot";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // Surface in the console instead of crashing so dev can still load the UI.
  console.warn(
    "[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — auth and cloud sync are disabled."
  );
}

export const supabase = createClient<Database>(
  url ?? "https://placeholder.supabase.co",
  anonKey ?? "placeholder"
);

export const supabaseConfigured = Boolean(url && anonKey);

// ---------------------------------------------------------------------------
// Database types — must stay in sync with supabase/migrations/0001_initial_schema.sql
// ---------------------------------------------------------------------------

/**
 * NOTE ON `Relationships` AND `Views` BELOW
 * postgrest-js's GenericSchema constraint requires a `Views` key on the schema
 * and a non-optional `Relationships` on every table. Omitting either makes the
 * whole schema fail the constraint, and the client silently degrades every
 * table to `never` — which shows up as a wall of "not assignable to parameter
 * of type 'never'" errors at each .insert()/.update() call, far from the cause.
 * We model no FK relationships or views, so both are empty.
 */
export interface Database {
  public: {
    Views: Record<string, never>;
    Tables: {
      profiles: {
        Row: { user_id: string; display_name: string | null; created_at: string };
        Insert: { user_id: string; display_name?: string | null };
        Update: { display_name?: string | null };
        Relationships: [];
      };
      characters: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          data: Character;
          is_public: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; owner_id: string; name: string; data: Character; is_public?: boolean };
        Update: { name?: string; data?: Character; is_public?: boolean };
        Relationships: [];
      };
      games: {
        Row: {
          id: string;
          name: string;
          dm_user_id: string;
          join_code: string;
          created_at: string;
          active_scene_id: string | null;
          region_map_url: string | null;
        };
        Insert: { id?: string; name: string; dm_user_id: string; join_code: string };
        Update: { name?: string; active_scene_id?: string | null; region_map_url?: string | null };
        Relationships: [];
      };
      journal_entries: {
        Row: {
          id: string;
          game_id: string;
          author_id: string;
          author_name: string;
          title: string | null;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          author_id: string;
          author_name?: string;
          title?: string | null;
          body: string;
        };
        Update: { title?: string | null; body?: string };
        Relationships: [];
      };
      scenes: {
        Row: {
          id: string;
          game_id: string;
          name: string;
          image_url: string | null;
          grid_cols: number;
          grid_rows: number;
          map_id: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
          in_combat: boolean;
          round: number;
          turn_index: number;
          fog_enabled: boolean;
          fog_revealed: number[];
        };
        Insert: {
          id?: string;
          game_id: string;
          name?: string;
          image_url?: string | null;
          grid_cols?: number;
          grid_rows?: number;
          map_id?: string | null;
          created_by: string;
        };
        Update: {
          name?: string;
          image_url?: string | null;
          grid_cols?: number;
          grid_rows?: number;
          map_id?: string | null;
          in_combat?: boolean;
          round?: number;
          turn_index?: number;
          fog_enabled?: boolean;
          fog_revealed?: number[];
        };
        Relationships: [];
      };
      maps: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          image_url: string;
          prompt: string | null;
          family: string | null;
          style: string | null;
          size: string | null;
          is_public: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name?: string;
          image_url: string;
          prompt?: string | null;
          family?: string | null;
          style?: string | null;
          size?: string | null;
          is_public?: boolean;
        };
        Update: {
          name?: string;
          image_url?: string;
          prompt?: string | null;
          family?: string | null;
          style?: string | null;
          size?: string | null;
          is_public?: boolean;
        };
        Relationships: [];
      };
      game_members: {
        Row: {
          game_id: string;
          user_id: string;
          character_id: string | null;
          role: "player" | "dm";
          joined_at: string;
        };
        Insert: {
          game_id: string;
          user_id: string;
          character_id?: string | null;
          role?: "player" | "dm";
        };
        Update: { character_id?: string | null; role?: "player" | "dm" };
        /* Declared so useGames' `games!inner(...)` embed resolves — postgrest
           types an embedded select against this list, not the live schema. */
        Relationships: [
          {
            foreignKeyName: "game_members_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
        ];
      };
      tokens: {
        Row: {
          id: string;
          game_id: string;
          scene_id: string;
          label: string;
          x: number;
          y: number;
          color: string;
          image_url: string | null;
          character_id: string | null;
          controller: "dm" | "player" | "ai";
          size: "tiny" | "small" | "medium" | "large" | "huge" | "gargantuan";
          token_id: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
          initiative: number | null;
          hidden: boolean;
          statblock: MonsterStatblock | null;
          hp_current: number | null;
          hp_max: number | null;
          char_level: number | null;
          conditions: string[] | null;
          loot: TokenLoot | null;
          kind: "prop" | "spell" | null;
          area: { shape?: SpellAreaShape; size?: number; damageType?: string; level?: number; facing?: number; movable?: boolean; effect?: unknown; conc?: unknown } | null;
          disposition: "hostile" | "friendly" | null;
        };
        Insert: {
          id?: string;
          game_id: string;
          scene_id: string;
          label: string;
          x?: number;
          y?: number;
          color?: string;
          image_url?: string | null;
          character_id?: string | null;
          controller?: "dm" | "player" | "ai";
          size?: "tiny" | "small" | "medium" | "large" | "huge" | "gargantuan";
          token_id?: string | null;
          created_by: string;
          initiative?: number | null;
          hidden?: boolean;
          statblock?: MonsterStatblock | null;
          hp_current?: number | null;
          hp_max?: number | null;
          char_level?: number | null;
          conditions?: string[] | null;
          loot?: TokenLoot | null;
          kind?: "prop" | "spell" | null;
          area?: { shape?: SpellAreaShape; size?: number; damageType?: string; level?: number; facing?: number; movable?: boolean } | null;
          disposition?: "hostile" | "friendly" | null;
        };
        Update: {
          label?: string;
          x?: number;
          y?: number;
          color?: string;
          image_url?: string | null;
          character_id?: string | null;
          controller?: "dm" | "player" | "ai";
          scene_id?: string;
          size?: "tiny" | "small" | "medium" | "large" | "huge" | "gargantuan";
          token_id?: string | null;
          initiative?: number | null;
          hidden?: boolean;
          statblock?: MonsterStatblock | null;
          hp_current?: number | null;
          hp_max?: number | null;
          char_level?: number | null;
          conditions?: string[] | null;
          loot?: TokenLoot | null;
          kind?: "prop" | "spell" | null;
          area?: { shape?: SpellAreaShape; size?: number; damageType?: string; level?: number; facing?: number; movable?: boolean } | null;
          disposition?: "hostile" | "friendly" | null;
        };
        Relationships: [];
      };
      drawings: {
        Row: {
          id: string;
          scene_id: string;
          game_id: string;
          kind: "pen" | "rect" | "ellipse" | "arrow";
          color: string;
          points: number[];
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          scene_id: string;
          game_id: string;
          kind: "pen" | "rect" | "ellipse" | "arrow";
          color?: string;
          points: number[];
          created_by: string;
        };
        Update: { color?: string; points?: number[] };
        Relationships: [];
      };
      token_assets: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          image_url: string;
          prompt: string | null;
          family: string | null;
          size_category: "tiny" | "small" | "medium" | "large" | "huge" | "gargantuan";
          creature_type: string | null;
          token_type: TokenType | null;
          details: TokenDetails | null;
          is_public: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name?: string;
          image_url: string;
          prompt?: string | null;
          family?: string | null;
          size_category?: "tiny" | "small" | "medium" | "large" | "huge" | "gargantuan";
          creature_type?: string | null;
          token_type?: TokenType | null;
          details?: TokenDetails | null;
          is_public?: boolean;
        };
        Update: {
          name?: string;
          image_url?: string;
          prompt?: string | null;
          family?: string | null;
          size_category?: "tiny" | "small" | "medium" | "large" | "huge" | "gargantuan";
          creature_type?: string | null;
          token_type?: TokenType | null;
          details?: TokenDetails | null;
          is_public?: boolean;
        };
        Relationships: [];
      };
    };
    Functions: {
      find_game_by_code: {
        Args: { _code: string };
        Returns: Array<{ id: string; name: string }>;
      };
      join_game_by_code: {
        Args: { _code: string; _character_id?: string | null };
        Returns: Array<{ id: string; name: string }>;
      };
      is_game_member: {
        Args: { _game_id: string; _user_id?: string };
        Returns: boolean;
      };
    };
  };
}
