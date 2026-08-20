import { useEffect, useState } from "react";
import { CharacterSheet } from "./components/CharacterSheet";
import { CharacterRoster } from "./components/CharacterRoster";
import { CharacterBuilder } from "./components/CharacterBuilder";
import { CharacterCreateMethod } from "./components/CharacterCreateMethod";
import { CharacterImport } from "./components/CharacterImport";
import { CharacterQuickBuild } from "./components/CharacterQuickBuild";
import { GamesScreen } from "./components/GamesScreen";
import { MapLibraryScreen } from "./components/MapLibraryScreen";
import { TokenLibraryScreen } from "./components/TokenLibraryScreen";
import { TableCanvas } from "./components/TableCanvas";
import { ProjectorBoard } from "./components/ProjectorBoard";
import { ChangeBackgroundDialog } from "./components/ChangeBackgroundDialog";
import { AuthScreen } from "./components/AuthScreen";
import { Landing } from "./components/Landing";
import { AppShell, type ShellSection } from "./components/AppShell";
import { DiceLogProvider } from "./state/DiceLog";
import { useCharacter } from "./state/useCharacter";
import { useRoster } from "./state/useRoster";
import { useAuth } from "./state/useAuth";
import { useToast } from "./state/Toast";
import type { Game } from "./state/useGames";
import type { Character } from "./types/character";
import type { BuilderState } from "./lib/characterBuilder";
import { Icon } from "./components/ui/Icon";
import { generateCharacterBackground } from "./lib/classArt";
import { supabase } from "./lib/supabase";

type Screen = "roster" | "games" | "maps" | "tokens" | "create-method" | "quick" | "import" | "builder" | "sheet" | "table";

// Remember the last view across reloads so refreshing lands you back where you
// were — not always on a character sheet. Stored in localStorage (the app is
// otherwise single-URL; only the projector uses the hash). `gameId` lets a
// reload restore a live table by re-fetching that one game.
const NAV_KEY = "vtt:lastNav";
interface PersistedNav {
  screen: Screen;
  gameId?: string | null;
}
const readNav = (): PersistedNav | null => {
  try {
    const raw = localStorage.getItem(NAV_KEY);
    return raw ? (JSON.parse(raw) as PersistedNav) : null;
  } catch {
    return null;
  }
};

/**
 * Which nav section a given internal screen belongs to. Sheet + builder are
 * character-adjacent; table is campaign-adjacent. Keeps the active tab
 * highlighted even in deep sub-views.
 */
const sectionForScreen = (screen: Screen): ShellSection => {
  switch (screen) {
    case "roster":
    case "sheet":
    case "builder":
    case "create-method":
    case "import":
    case "quick":
      return "characters";
    case "maps":
      return "maps";
    case "tokens":
      return "tokens";
    case "games":
    case "table":
    default:
      return "campaigns";
  }
};

function App() {
  const auth = useAuth();
  const toast = useToast();
  const { characters, ownedIds, publicIds, activeId, loading: rosterLoading, create, remove, select, updateCharacter, setCharacterPublic, cloneCharacter } = useRoster();
  // We hold the full Game (not just its id) so App doesn't need its own
  // useGames() subscription — two useGames() instances would fight for the
  // same realtime channel name and one would fail to subscribe.
  const [activeGame, setActiveGame] = useState<Game | null>(null);
  // Restore the last view. Builder is never restored (no half-finished creation
  // on reload); a sheet needs an active character; a table is restored async by
  // the effect below (we keep `screen` on "table" and fetch the game).
  // An invite link (#/join/<code>) lands here — carry the code to the Games
  // screen so the join field is prefilled. The branded pre-join lobby is a
  // later slice; for now a signed-in player sees the code ready to accept.
  const [joinCodeFromUrl] = useState<string | null>(() => {
    const m = window.location.hash.match(/^#\/join\/([\w-]+)/);
    return m ? m[1] : null;
  });
  const [screen, setScreen] = useState<Screen>(() => {
    if (joinCodeFromUrl) return "games";
    const nav = readNav();
    if (!nav) return activeId ? "sheet" : "roster";
    if (nav.screen === "builder") return "roster";
    if (nav.screen === "sheet") return activeId ? "sheet" : "roster";
    return nav.screen;
  });
  // The game id to re-fetch when a reload lands back on a table.
  const [restoreGameId, setRestoreGameId] = useState<string | null>(() => {
    const nav = readNav();
    return nav?.screen === "table" ? nav.gameId ?? null : null;
  });
  // Unauthenticated flow: null = show the marketing landing; a mode = show the
  // auth screen with that tab preselected (from the landing's CTAs).
  const [authMode, setAuthMode] = useState<"signin" | "signup" | null>(null);
  // Signed-in users can revisit the marketing landing via the home brand mark.
  const [showLanding, setShowLanding] = useState(false);
  const [bgDialogOpen, setBgDialogOpen] = useState(false);
  // A BuilderState parsed from an uploaded PDF (Import-from-PDF, #110). When set,
  // the builder opens pre-filled at Review; cleared for the from-scratch path.
  const [importedState, setImportedState] = useState<BuilderState | null>(null);
  const api = useCharacter(activeId);

  // Remember the current view so a reload returns here instead of a sheet.
  useEffect(() => {
    try {
      localStorage.setItem(NAV_KEY, JSON.stringify({ screen, gameId: activeGame?.id ?? null }));
    } catch {
      /* ignore private-mode / quota errors */
    }
  }, [screen, activeGame]);

  // A reload that landed on a table: re-fetch that one game and drop back into
  // it. If it's gone or unreadable, fall back to the games list.
  useEffect(() => {
    if (!restoreGameId || activeGame || !auth.session || !auth.user) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("game_members")
        .select("role, character_id, games!inner(id, name, dm_user_id, join_code, created_at, active_scene_id)")
        .eq("user_id", auth.user!.id)
        .eq("game_id", restoreGameId)
        .maybeSingle();
      if (cancelled) return;
      const g = (data as { games?: Game } | null)?.games;
      if (error || !g) {
        setRestoreGameId(null);
        setScreen("games");
        return;
      }
      setActiveGame({
        ...g,
        my_role: (data as { role: "player" | "dm" }).role,
        my_character_id: (data as { character_id: string | null }).character_id,
      });
      setRestoreGameId(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [restoreGameId, activeGame, auth.session, auth.user]);

  // Player projector: a chrome-free read-only board at #/display/<gameId>,
  // opened in its own tab and cast to a shared screen. Bypasses the whole app
  // shell + auth-screen flow (it still relies on the shared Supabase session
  // for RLS-governed reads).
  const [displayGameId] = useState<string | null>(() => {
    const m = window.location.hash.match(/^#\/display\/([\w-]+)/);
    return m ? m[1] : null;
  });

  if (auth.loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <div className="dim">Loading…</div>
      </div>
    );
  }

  if (displayGameId) return <ProjectorBoard gameId={displayGameId} />;

  if (!auth.session) {
    return authMode ? (
      <AuthScreen initialMode={authMode} onBack={() => setAuthMode(null)} />
    ) : (
      <Landing onEnter={(mode) => setAuthMode(mode)} />
    );
  }

  const openSheet = (id: string) => {
    select(id);
    setScreen("sheet");
  };

  // Persist a background URL onto a character. Re-reads the latest saved data
  // first so we merge onto (not clobber) concurrent edits. Shared by the
  // creation auto-gen and the Change-background dialog.
  const persistBackground = async (id: string, url: string) => {
    const { data } = await supabase.from("characters").select("data").eq("id", id).single();
    const latest = data?.data as Character | undefined;
    if (!latest) return;
    await supabase
      .from("characters")
      .update({ data: { ...latest, bgImage: url } })
      .eq("id", id);
  };

  // Auto-generate a backdrop right after character creation (fire-and-forget).
  const generateAndSaveBackground = (c: Character) => {
    toast.info("Conjuring your character's portrait…");
    void generateCharacterBackground(c)
      .then(({ url }) => {
        if (!url) {
          toast.error("Couldn't generate character art — you can set one from the sheet.");
          return;
        }
        void persistBackground(c.id, url).then(() =>
          toast.success("Your character's portrait is ready.")
        );
      })
      .catch(() => {
        // Never fail silently if the request throws/times out.
        toast.error("Couldn't generate character art — you can set one from the sheet.");
      });
  };

  // Clicking a top-nav section drops any in-flight sub-view state
  // (leaving a game, leaving a sheet) and lands on the section's home.
  const onSelectSection = (s: ShellSection) => {
    setShowLanding(false); // leave the home/landing view when a tab is picked
    if (s === "characters") setScreen("roster");
    else if (s === "maps") setScreen("maps");
    else if (s === "tokens") setScreen("tokens");
    else if (s === "campaigns") {
      setActiveGame(null);
      setScreen("games");
    }
  };

  return (
    <DiceLogProvider>
      <AppShell
        section={showLanding ? null : sectionForScreen(screen)}
        onSelectSection={onSelectSection}
        onHome={() => setShowLanding(true)}
        userEmail={auth.user?.email}
        onSignOut={auth.signOut}
        immersive={!showLanding && screen === "table"}
      >
        {showLanding && (
          <Landing
            signedIn
            embedded
            onEnter={() => setShowLanding(false)}
            onNavigate={onSelectSection}
          />
        )}

        {!showLanding && screen === "roster" && (
          <CharacterRoster
            characters={characters}
            ownedIds={ownedIds}
            publicIds={publicIds}
            onOpen={openSheet}
            onCreate={() => setScreen("create-method")}
            onDelete={(id) => {
              void remove(id);
              if (activeId === id) setScreen("roster");
            }}
            onPublish={(id, pub) => void setCharacterPublic(id, pub)}
            onClone={async (id) => {
              const { id: newId } = await cloneCharacter(id);
              if (newId) openSheet(newId);
            }}
          />
        )}

        {!showLanding && screen === "maps" && <MapLibraryScreen />}

        {!showLanding && screen === "tokens" && <TokenLibraryScreen />}

        {!showLanding && screen === "games" && (
          <GamesScreen
            characters={characters}
            initialJoinCode={joinCodeFromUrl}
            onOpenGame={(game) => {
              setActiveGame(game);
              setScreen("table");
            }}
          />
        )}

        {!showLanding && screen === "table" && !activeGame && restoreGameId && (
          <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
            <div className="dim">Returning to your table…</div>
          </div>
        )}

        {!showLanding && screen === "table" && activeGame && (
          <>
            <TableCanvas
              game={activeGame}
              characters={characters}
              ownedCharacterIds={ownedIds}
              onUpdateCharacter={updateCharacter}
              onBack={() => {
                setActiveGame(null);
                setScreen("games");
              }}
            />
          </>
        )}

        {!showLanding && screen === "create-method" && (
          <CharacterCreateMethod
            onStandard={() => {
              setImportedState(null);
              setScreen("builder");
            }}
            onPremade={() => setScreen("roster")}
            onQuick={() => setScreen("quick")}
            onImport={() => setScreen("import")}
            onCancel={() => setScreen("roster")}
          />
        )}

        {!showLanding && screen === "quick" && (
          <CharacterQuickBuild
            onCancel={() => setScreen("create-method")}
            onBuilt={(state) => {
              setImportedState(state);
              setScreen("builder");
            }}
          />
        )}

        {!showLanding && screen === "import" && (
          <CharacterImport
            onCancel={() => setScreen("create-method")}
            onImported={(state, notes) => {
              setImportedState(state);
              setScreen("builder");
              notes.forEach((n) => toast.info(n));
            }}
          />
        )}

        {!showLanding && screen === "builder" && (
          <CharacterBuilder
            initialState={importedState ?? undefined}
            initialStep={importedState ? "Review" : undefined}
            onCancel={() => {
              setImportedState(null);
              setScreen("create-method");
            }}
            onFinish={(c) => {
              setImportedState(null);
              void create(c);
              select(c.id);
              setScreen("sheet");
              // Generate a unique 21:9 backdrop for this character in the
              // background. The sheet shows the class-art fallback until it
              // lands, then swaps in via the realtime character subscription.
              generateAndSaveBackground(c);
            }}
          />
        )}

        {!showLanding && screen === "sheet" && (
          <>
            <div className="sheet-actionbar">
              <button
                className="ghost"
                onClick={() => setScreen("roster")}
                style={{ fontSize: 12, padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <Icon name="back" size={14} />
                My Characters
              </button>
              {api.character?.id && (
                <button
                  className="ghost"
                  onClick={() => setBgDialogOpen(true)}
                  title="Change this character's sheet background"
                  style={{ fontSize: 12, padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto" }}
                >
                  <Icon name="image" size={14} />
                  Change background
                </button>
              )}
            </div>
            {api.loading || rosterLoading ? (
              <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
                <div className="dim">Loading character…</div>
              </div>
            ) : (
              <CharacterSheet character={api.character} api={api} />
            )}
            {/* Dice rolling is scoped to the VTT (#124) — no dice/log FABs on
                the character-sheet page. */}
            {bgDialogOpen && api.character?.id && (
              <ChangeBackgroundDialog
                character={api.character}
                onClose={() => setBgDialogOpen(false)}
                onApply={(url) => api.setBackground(url)}
              />
            )}
          </>
        )}
      </AppShell>
    </DiceLogProvider>
  );
}

export default App;
