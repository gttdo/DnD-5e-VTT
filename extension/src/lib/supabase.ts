import { createClient } from "@supabase/supabase-js";
import type { Character } from "../types/character";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // Surface in the console instead of crashing so dev can still load the UI.
  console.warn(
    "[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — auth and cloud sync are disabled."
  );
}

// `as any` because supabase-js v2 type inference produces `never` for our
// Database schema under the extension's tsconfig — the runtime behavior is
// fine; we just lose IntelliSense on table/RPC calls. Worth revisiting once
// we adopt supabase-codegen for the schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: any = createClient<Database>(
  url ?? "https://placeholder.supabase.co",
  anonKey ?? "placeholder"
);

export const supabaseConfigured = Boolean(url && anonKey);

// ---------------------------------------------------------------------------
// Database types — must stay in sync with supabase/migrations/0001_initial_schema.sql
// ---------------------------------------------------------------------------

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { user_id: string; display_name: string | null; created_at: string };
        Insert: { user_id: string; display_name?: string | null };
        Update: { display_name?: string | null };
      };
      characters: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          data: Character;
          created_at: string;
          updated_at: string;
        };
        Insert: { id?: string; owner_id: string; name: string; data: Character };
        Update: { name?: string; data?: Character };
      };
      games: {
        Row: {
          id: string;
          name: string;
          dm_user_id: string;
          join_code: string;
          created_at: string;
        };
        Insert: { id?: string; name: string; dm_user_id: string; join_code: string };
        Update: { name?: string };
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
      };
    };
    Functions: {
      find_game_by_code: {
        Args: { _code: string };
        Returns: Array<{ id: string; name: string }>;
      };
      is_game_member: {
        Args: { _game_id: string; _user_id?: string };
        Returns: boolean;
      };
    };
  };
}
