import type { CharacterSheetSnapshot } from "../types/snapshots";

/**
 * Scrape /characters/{id} into a `CharacterSheetSnapshot`.
 *
 * Stub for now — wired to a real parser in a follow-up commit.
 * See docs/recon/dndbeyond-character-sheet.md for the v1 text-pattern
 * approach (regexes per region) and §6 Phase B for the React fiber
 * fallback that reads the Redux store directly.
 */
export const scrapeCharacterSheet = async (
  charId: number
): Promise<CharacterSheetSnapshot | null> => {
  console.log("[dnd-ext] scrapeCharacterSheet — stub for id", charId);
  // We return null while stubbed so the message bus doesn't accidentally
  // overwrite a real snapshot in Supabase with empty data.
  return null;
};
