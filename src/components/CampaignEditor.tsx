import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../state/useAuth";
import { useToast } from "../state/Toast";
import { useConfirm } from "../state/Confirm";
import { useScenes, type Scene } from "../state/useScenes";
import { useChapters, useCampaignDocs, useDocShares, useCampaignMemory, type Chapter, type CampaignDoc, type DocKind } from "../state/useCampaign";

/**
 * Share state for the whole editor — which docs have been shared, and the
 * actions to share/unshare — provided once and consumed by every DocCard,
 * avoiding prop-drilling through the page components. (Story/Journal.)
 */
interface SharePlayer {
  user_id: string;
  name: string;
}
interface SharesApi {
  /** Any share at all (party or a specific player). */
  isShared: (docId: string) => boolean;
  /** Shared with the whole party specifically. */
  isPartyShared: (docId: string) => boolean;
  /** Player user_ids this doc is privately shared with. */
  playersFor: (docId: string) => string[];
  /** The campaign's players, to offer in the picker. */
  players: SharePlayer[];
  shareParty: (docId: string) => void;
  sharePlayer: (docId: string, userId: string) => void;
  /** Remove one audience: party (null) or a specific player. */
  unshareOne: (docId: string, recipientId: string | null) => void;
  /** Remove every share on the doc. */
  unshare: (docId: string) => void;
}
const SharesContext = createContext<SharesApi>({
  isShared: () => false,
  isPartyShared: () => false,
  playersFor: () => [],
  players: [],
  shareParty: () => {},
  sharePlayer: () => {},
  unshareOne: () => {},
  unshare: () => {},
});
import { useSessions, sessionDuration, type GameSession } from "../state/useSessions";
import { useCastRoster, type CastMember } from "../state/useCastRoster";
import { useRegionMaps } from "../state/useRegionNav";
import { draftReadAloud, draftRecap, SCRIBE_GENRES, type ScribeGenre } from "../lib/scribe";
import { HandoutDocBody } from "./HandoutEditor";
import { EMPTY_FIELDS } from "../lib/handouts";
import { generateNarration } from "../lib/narrate";
import { AMBIENCE_TRACKS, resolveAmbience } from "../lib/soundtrack";
import type { Game } from "../state/useGames";
import type { MapAsset } from "../state/useMaps";
import { MapPickerDialog } from "./MapPickerDialog";
import { GenerateMapDialog } from "./GenerateMapDialog";
import { Dialog } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { Icon } from "./ui/Icon";
import { EmptyState } from "./ui/EmptyState";

/**
 * The Campaign Editor (docs/campaign-editor.md, slice 1a) — the DM's prep
 * surface. Left rail: the story tree (chapters → scenes, draft/publish).
 * Main pane: one scene's prep face — description, the two image faces, and
 * its documents (notes, read-alouds, quests). The same scenes the table
 * plays; the editor is just their other face.
 */

interface Props {
  game: Game;
  onOpenTable: () => void;
  onBack: () => void;
}

type Selection =
  | { type: "overview" }
  | { type: "scene"; id: string }
  | { type: "chapter"; id: string }
  | { type: "session"; id: string };

const KIND_LABEL: Record<DocKind, string> = {
  note: "Note",
  read_aloud: "Read-aloud",
  quest: "Quest",
  recap: "Recap",
  handout: "Handout",
};

/** The scene Documents section groups docs by kind, one tab each. */
const DOC_TABS: DocKind[] = ["note", "read_aloud", "quest", "handout"];

export const CampaignEditor = ({ game, onOpenTable, onBack }: Props) => {
  const { user } = useAuth();
  const toast = useToast();
  const { confirm } = useConfirm();
  const isDM = game.dm_user_id === user?.id;

  // Fresh campaign row — the list row we were handed may predate 0041 columns.
  const [campaign, setCampaign] = useState<Game>(game);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.from("games").select("*").eq("id", game.id).single();
      if (!cancelled && data) setCampaign((prev) => ({ ...prev, ...(data as Game) }));
    })();
    return () => {
      cancelled = true;
    };
  }, [game.id]);

  const { chapters, createChapter, updateChapter, moveChapter, deleteChapter } = useChapters(game.id);
  const { docs, createDoc, updateDoc, deleteDoc } = useCampaignDocs(game.id);
  // Share state (Story/Journal) — sharing a doc files it in players' Journals,
  // to the whole party or to specific players (Slice B).
  const { shares, shareWithParty, shareWithPlayer, unshareOne, unshare: unshareDoc } = useDocShares(game.id);
  const cast = useCastRoster(game.id);
  const sharePlayers = useMemo<SharePlayer[]>(
    () => cast.members.filter((m) => m.role === "player").map((m) => ({ user_id: m.user_id, name: m.name })),
    [cast.members]
  );
  const sharesApi = useMemo<SharesApi>(
    () => ({
      isShared: (id) => shares.some((s) => s.document_id === id),
      isPartyShared: (id) => shares.some((s) => s.document_id === id && s.audience === "party"),
      playersFor: (id) => shares.filter((s) => s.document_id === id && s.audience === "player").map((s) => s.recipient_id!).filter(Boolean),
      players: sharePlayers,
      shareParty: (id) => {
        // Party share supersedes individual ones — clear players, then share all.
        void unshareDoc(id).then(() =>
          shareWithParty(id).then(({ error }) => (error ? toast.error(error) : toast.success("Shared with the party — it's in every journal.")))
        );
      },
      sharePlayer: (id, uid) => {
        // A targeted share is private — drop any party share so it's not public.
        void unshareOne(id, null).then(() =>
          shareWithPlayer(id, uid).then(({ error }) => {
            if (error) toast.error(error);
            else toast.success(`Shared privately with ${sharePlayers.find((p) => p.user_id === uid)?.name ?? "the player"}.`);
          })
        );
      },
      unshareOne: (id, rid) => void unshareOne(id, rid),
      unshare: (id) => void unshareDoc(id),
    }),
    [shares, sharePlayers, shareWithParty, shareWithPlayer, unshareOne, unshareDoc, toast]
  );
  const {
    scenes,
    createScene,
    deleteScene,
    updateSceneMeta,
    setSceneImageUrl,
    setSceneCinematicUrl,
    stageSceneId,
  } = useScenes(game.id, game.active_scene_id ?? null);
  const { regionMaps } = useRegionMaps(game.id);
  const rootRegionMap = regionMaps[0] ?? null;
  // Table-time (#0041 §5): sessions for the Timeline tab. canManage lets a
  // stale forgotten session auto-close from the editor too.
  const { sessions } = useSessions(game.id, { canManage: true });
  // (The Cast roster — `cast` — is declared above; it feeds both the Cast tab
  // and the per-player share picker.)

  const [tab, setTab] = useState<"story" | "timeline" | "cast">("story");
  const [selection, setSelection] = useState<Selection>({ type: "overview" });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null); // chapter/scene id
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [regionMapOpen, setRegionMapOpen] = useState(false);
  const [moveSceneId, setMoveSceneId] = useState<string | null>(null);

  const selectedScene = selection.type === "scene" ? scenes.find((s) => s.id === selection.id) ?? null : null;

  const scenesOf = useCallback(
    (chapterId: string | null) => scenes.filter((s) => (s.chapter_id ?? null) === chapterId),
    [scenes]
  );
  const unfiled = scenesOf(null);

  // ------------------------------------------------------------------ tree ops
  const addChapter = async () => {
    const { chapter, error } = await createChapter(`Chapter ${chapters.length + 1}`);
    if (error) toast.error(error);
    else if (chapter) {
      setRenamingId(chapter.id);
      setRenameDraft(chapter.title);
    }
  };

  const addScene = async (chapterId: string | null) => {
    const { scene, error } = await createScene("Untitled Scene", { chapter_id: chapterId ?? undefined });
    if (error) toast.error(error);
    else if (scene) {
      setSelection({ type: "scene", id: scene.id });
      setRenamingId(scene.id);
      setRenameDraft(scene.name);
    }
  };

  const commitRename = async () => {
    if (!renamingId) return;
    const title = renameDraft.trim();
    setRenamingId(null);
    if (!title) return;
    const chapter = chapters.find((c) => c.id === renamingId);
    if (chapter) {
      if (title !== chapter.title) void updateChapter(chapter.id, { title });
      return;
    }
    const scene = scenes.find((s) => s.id === renamingId);
    if (scene && title !== scene.name) void updateSceneMeta(scene.id, { name: title });
  };

  const publishFlow = async (chapter: Chapter) => {
    if (chapter.status === "published") {
      if (
        await confirm({
          title: "Unpublish chapter",
          message: `Unpublish "${chapter.title}"? Its scenes become invisible to players again — pins to them are hidden and travel is refused.`,
          confirmLabel: "Unpublish",
        })
      ) {
        void updateChapter(chapter.id, { status: "draft" });
      }
      return;
    }
    // Readiness check — inform, never block.
    const chScenes = scenesOf(chapter.id);
    const noMap = chScenes.filter((s) => !s.image_url && !s.cinematic_url).length;
    const emptyRA = docs.filter(
      (d) => d.kind === "read_aloud" && d.scene_id && chScenes.some((s) => s.id === d.scene_id) && !d.content.trim()
    ).length;
    const warnings = [
      chScenes.length === 0 ? "This chapter has no scenes yet." : null,
      noMap > 0 ? `${noMap} scene${noMap === 1 ? " has" : "s have"} no map yet.` : null,
      emptyRA > 0 ? `${emptyRA} read-aloud${emptyRA === 1 ? " is" : "s are"} still empty.` : null,
    ].filter(Boolean);
    const message =
      (warnings.length ? warnings.join(" ") + "\n\n" : "") +
      "Players will be able to travel to this chapter's scenes.";
    if (
      await confirm({
        title: `Publish "${chapter.title}"?`,
        message,
        confirmLabel: warnings.length ? "Publish anyway" : "Publish",
      })
    ) {
      void updateChapter(chapter.id, { status: "published" });
      toast.success(`"${chapter.title}" is live — players can travel there.`);
    }
  };

  const removeScene = async (scene: Scene) => {
    // Look for pins that would dangle — worth a louder warning.
    const { data: pin } = await supabase
      .from("hotspots")
      .select("id")
      .eq("target_scene_id", scene.id)
      .limit(1)
      .maybeSingle();
    const extra = [
      scene.id === stageSceneId ? "It is currently STAGED at the table." : null,
      pin ? "A map pin points at it." : null,
    ]
      .filter(Boolean)
      .join(" ");
    if (
      await confirm({
        title: "Delete scene",
        message: `Delete "${scene.name}" and its documents? ${extra ? extra + " " : ""}This cannot be undone.`,
        confirmLabel: "Delete scene",
        danger: true,
      })
    ) {
      if (selection.type === "scene" && selection.id === scene.id) setSelection({ type: "overview" });
      void deleteScene(scene.id);
    }
  };

  const removeChapter = async (chapter: Chapter) => {
    const n = scenesOf(chapter.id).length;
    if (
      await confirm({
        title: "Delete chapter",
        message: `Delete "${chapter.title}"? ${n ? `Its ${n} scene${n === 1 ? "" : "s"} move to Unfiled — nothing else is deleted.` : "It has no scenes."}`,
        confirmLabel: "Delete chapter",
        danger: true,
      })
    ) {
      void deleteChapter(chapter.id);
    }
  };

  if (!isDM) {
    return (
      <div style={{ padding: 48 }}>
        <EmptyState icon="rules" title="DM only">
          The Campaign Editor is the Dungeon Master's prep room.
        </EmptyState>
      </div>
    );
  }

  // ------------------------------------------------------------------- render
  return (
    <SharesContext.Provider value={sharesApi}>
    <div className="camped screen-enter">
      {/* Top bar */}
      <div className="camped-topbar">
        <button className="ghost camped-back" onClick={onBack}>
          <Icon name="back" size={14} />
          Games
        </button>
        <span className="camped-name" onClick={() => setSettingsOpen(true)} title="Campaign settings">
          {campaign.name}
        </span>
        {campaign.level_min != null && campaign.level_max != null && (
          <button className="camped-lvlchip" onClick={() => setSettingsOpen(true)}>
            Levels {campaign.level_min}–{campaign.level_max}
          </button>
        )}
        <span style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" icon="settings" onClick={() => setSettingsOpen(true)}>
          Settings
        </Button>
        <Button variant="primary" size="sm" icon="swords" onClick={onOpenTable}>
          Open table
        </Button>
      </div>

      <div className="camped-panes">
        {/* ------------------------------------------------ left rail */}
        <div className="camped-side">
          <div className="camped-tabs">
            <button className={tab === "story" ? "is-on" : ""} onClick={() => setTab("story")}>
              Story
            </button>
            <button className={tab === "timeline" ? "is-on" : ""} onClick={() => setTab("timeline")}>
              Timeline
            </button>
            <button className={tab === "cast" ? "is-on" : ""} onClick={() => setTab("cast")}>
              Cast
            </button>
          </div>

          {tab === "cast" && (
            <div className="dim" style={{ fontSize: 13, padding: "8px 10px" }}>
              The campaign's people — every member and the character they
              brought. Lives with this table only; never exported in packs.
            </div>
          )}

          {tab === "timeline" && sessions.length === 0 && (
            <EmptyState icon="rules" title="No sessions yet" compact>
              Start a session from the table to begin the record — recaps will
              collect here.
            </EmptyState>
          )}
          {tab === "timeline" &&
            sessions.map((s) => {
              const hasRecap = docs.some((d) => d.kind === "recap" && d.session_id === s.id);
              const isSel = selection.type === "session" && selection.id === s.id;
              return (
                <button
                  key={s.id}
                  className={`camped-sessionrow ${isSel ? "is-sel" : ""}`}
                  onClick={() => setSelection({ type: "session", id: s.id })}
                >
                  <span className="camped-sessionnum">Session {s.number}</span>
                  <span className="camped-sessionmeta">
                    {new Date(s.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })} ·{" "}
                    {s.ended_at ? sessionDuration(s) : "live now"}
                  </span>
                  {!s.ended_at && <span className="camped-sessionlive" />}
                  {hasRecap && s.ended_at && <span className="camped-sessionrecap">Recap ✓</span>}
                </button>
              );
            })}

          {tab === "story" && (
            <>
              <button
                className={`camped-toprow ${selection.type === "overview" ? "is-sel" : ""}`}
                onClick={() => setSelection({ type: "overview" })}
              >
                <Icon name="sparkles" size={13} />
                Campaign overview
              </button>
              <button className="camped-toprow" onClick={() => setRegionMapOpen(true)} disabled={!rootRegionMap}>
                <Icon name="map" size={13} />
                {rootRegionMap ? `Regional map — ${rootRegionMap.name}` : "No regional map yet"}
              </button>
              <div className="camped-treesep" />

              {chapters.map((ch, i) => {
                const chScenes = scenesOf(ch.id);
                const isCollapsed = collapsed.has(ch.id);
                return (
                  <div key={ch.id} className="camped-chapter">
                    <div className="camped-chrow">
                      <button
                        className="camped-caret"
                        onClick={() =>
                          setCollapsed((prev) => {
                            const next = new Set(prev);
                            if (next.has(ch.id)) next.delete(ch.id);
                            else next.add(ch.id);
                            return next;
                          })
                        }
                      >
                        <Icon name={isCollapsed ? "right" : "down"} size={12} />
                      </button>
                      {renamingId === ch.id ? (
                        <input
                          className="camped-rename"
                          value={renameDraft}
                          autoFocus
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => e.key === "Enter" && commitRename()}
                        />
                      ) : (
                        <button
                          className={`camped-chtitle is-link ${selection.type === "chapter" && selection.id === ch.id ? "is-sel" : ""}`}
                          onClick={() => setSelection({ type: "chapter", id: ch.id })}
                          title="Open this chapter's hub"
                        >
                          {i + 1} · {ch.title}
                        </button>
                      )}
                      {ch.status === "draft" && <span className="camped-draft">Draft</span>}
                      <button className="camped-dots" onClick={() => setMenuFor(menuFor === ch.id ? null : ch.id)}>
                        <Icon name="more" size={14} />
                      </button>
                      {menuFor === ch.id && (
                        <div className="camped-menu" onClick={() => setMenuFor(null)}>
                          <button
                            onClick={() => {
                              setRenamingId(ch.id);
                              setRenameDraft(ch.title);
                            }}
                          >
                            Rename
                          </button>
                          <button disabled={i === 0} onClick={() => void moveChapter(ch.id, -1)}>
                            Move up
                          </button>
                          <button disabled={i === chapters.length - 1} onClick={() => void moveChapter(ch.id, 1)}>
                            Move down
                          </button>
                          <div className="camped-menusep" />
                          <button className="is-gold" onClick={() => void publishFlow(ch)}>
                            {ch.status === "draft" ? "Publish chapter…" : "Unpublish chapter"}
                          </button>
                          <div className="camped-menusep" />
                          <button className="is-danger" onClick={() => void removeChapter(ch)}>
                            Delete chapter
                          </button>
                        </div>
                      )}
                    </div>
                    {!isCollapsed && (
                      <>
                        {chScenes.map((s) => (
                          <SceneRow
                            key={s.id}
                            scene={s}
                            selected={selection.type === "scene" && selection.id === s.id}
                            renaming={renamingId === s.id}
                            renameDraft={renameDraft}
                            setRenameDraft={setRenameDraft}
                            commitRename={commitRename}
                            menuOpen={menuFor === s.id}
                            onToggleMenu={() => setMenuFor(menuFor === s.id ? null : s.id)}
                            onSelect={() => setSelection({ type: "scene", id: s.id })}
                            onRename={() => {
                              setRenamingId(s.id);
                              setRenameDraft(s.name);
                            }}
                            onMove={() => setMoveSceneId(s.id)}
                            onUnfile={() => void updateSceneMeta(s.id, { chapter_id: null })}
                            onDelete={() => void removeScene(s)}
                            inChapter
                          />
                        ))}
                        <button className="camped-addscene" onClick={() => void addScene(ch.id)}>
                          ＋ Add scene
                        </button>
                      </>
                    )}
                  </div>
                );
              })}

              {unfiled.length > 0 && (
                <div className="camped-chapter">
                  <div className="camped-chrow is-unfiled">
                    <span className="camped-chtitle">Unfiled · {unfiled.length}</span>
                  </div>
                  {unfiled.map((s) => (
                    <SceneRow
                      key={s.id}
                      scene={s}
                      selected={selection.type === "scene" && selection.id === s.id}
                      renaming={renamingId === s.id}
                      renameDraft={renameDraft}
                      setRenameDraft={setRenameDraft}
                      commitRename={commitRename}
                      menuOpen={menuFor === s.id}
                      onToggleMenu={() => setMenuFor(menuFor === s.id ? null : s.id)}
                      onSelect={() => setSelection({ type: "scene", id: s.id })}
                      onRename={() => {
                        setRenamingId(s.id);
                        setRenameDraft(s.name);
                      }}
                      onMove={() => setMoveSceneId(s.id)}
                      onDelete={() => void removeScene(s)}
                      inChapter={false}
                    />
                  ))}
                </div>
              )}

              {chapters.length === 0 && unfiled.length === 0 && (
                <div className="dim" style={{ fontSize: 13, padding: "12px 10px" }}>
                  Your story starts here — add a chapter, then scenes inside it.
                </div>
              )}

              <button className="camped-addchapter" onClick={() => void addChapter()}>
                ＋ Add chapter
              </button>
            </>
          )}
        </div>

        {/* ------------------------------------------------ main pane */}
        <div className="camped-main">
          {tab === "cast" && (
            <CastPage
              members={cast.members}
              loading={cast.loading}
              dmUserId={campaign.dm_user_id}
              onRemove={async (m) => {
                if (
                  await confirm({
                    title: "Remove from campaign",
                    message: `Remove ${m.name} from "${campaign.name}"? Their seat is freed; their character stays theirs and is untouched.`,
                    confirmLabel: "Remove",
                    danger: true,
                  })
                ) {
                  const { error } = await cast.removeMember(m.user_id);
                  if (error) toast.error(error);
                  else toast.success(`${m.name} removed from the campaign.`);
                }
              }}
            />
          )}
          {tab !== "cast" && selection.type === "overview" && (
            <OverviewPage campaign={campaign} docs={docs} createDoc={createDoc} updateDoc={updateDoc} deleteDoc={deleteDoc} />
          )}
          {tab !== "cast" && selectedScene && (
            <ScenePage
              key={selectedScene.id}
              scene={selectedScene}
              chapters={chapters}
              docs={docs.filter((d) => d.scene_id === selectedScene.id)}
              updateSceneMeta={updateSceneMeta}
              setSceneImageUrl={setSceneImageUrl}
              setSceneCinematicUrl={setSceneCinematicUrl}
              createDoc={createDoc}
              updateDoc={updateDoc}
              deleteDoc={deleteDoc}
            />
          )}
          {tab !== "cast" && selection.type === "scene" && !selectedScene && (
            <div className="dim" style={{ padding: 32 }}>
              That scene is gone — pick another from the story tree.
            </div>
          )}
          {tab !== "cast" && selection.type === "chapter" && (
            <ChapterPage
              chapter={chapters.find((c) => c.id === selection.id) ?? null}
              index={chapters.findIndex((c) => c.id === selection.id)}
              scenes={selection.type === "chapter" ? scenesOf(selection.id) : []}
              docs={docs}
              onOpenScene={(id) => setSelection({ type: "scene", id })}
              onPublish={(ch) => void publishFlow(ch)}
              onAddScene={(chapterId) => void addScene(chapterId)}
              createDoc={createDoc}
              updateDoc={updateDoc}
              deleteDoc={deleteDoc}
            />
          )}
          {tab !== "cast" && selection.type === "session" && (
            <SessionPage
              session={sessions.find((s) => s.id === selection.id) ?? null}
              docs={docs.filter((d) => d.kind === "recap" && d.session_id === selection.id)}
              createDoc={createDoc}
              updateDoc={updateDoc}
              deleteDoc={deleteDoc}
            />
          )}
        </div>
      </div>

      {/* ------------------------------------------------ dialogs */}
      {settingsOpen && (
        <CampaignSettings
          campaign={campaign}
          onPatched={(patch) => setCampaign((prev) => ({ ...prev, ...patch }))}
          onDelete={async () => {
            if (
              await confirm({
                title: "Delete campaign",
                message: `Delete "${campaign.name}"? This permanently removes the campaign and all its chapters, scenes, documents, tokens, and player seats. This cannot be undone.`,
                confirmLabel: "Delete campaign",
                danger: true,
              })
            ) {
              await supabase.from("games").delete().eq("id", campaign.id);
              onBack();
            }
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {regionMapOpen && rootRegionMap && (
        <Dialog
          onClose={() => setRegionMapOpen(false)}
          size="lg"
          title={rootRegionMap.name}
          subtitle="The world your players navigate. Pins and travel are edited at the table — open the Region map there."
        >
          <img src={rootRegionMap.image_url} alt={rootRegionMap.name} style={{ width: "100%", borderRadius: 8 }} />
        </Dialog>
      )}

      {moveSceneId && (
        <Dialog onClose={() => setMoveSceneId(null)} size="sm" title="Move scene to…">
          <div style={{ display: "grid", gap: 6 }}>
            {chapters.map((ch, i) => (
              <button
                key={ch.id}
                className="ghost"
                style={{ justifyContent: "flex-start" }}
                onClick={() => {
                  void updateSceneMeta(moveSceneId, { chapter_id: ch.id });
                  setMoveSceneId(null);
                }}
              >
                {i + 1} · {ch.title}
                {ch.status === "draft" ? " (draft)" : ""}
              </button>
            ))}
            <button
              className="ghost"
              style={{ justifyContent: "flex-start" }}
              onClick={() => {
                void updateSceneMeta(moveSceneId, { chapter_id: null });
                setMoveSceneId(null);
              }}
            >
              Unfiled
            </button>
          </div>
        </Dialog>
      )}

      {/* Click-away for row menus */}
      {menuFor && <div className="camped-menuveil" onClick={() => setMenuFor(null)} />}
    </div>
    </SharesContext.Provider>
  );
};

// ============================================================================
const SceneRow = ({
  scene,
  selected,
  renaming,
  renameDraft,
  setRenameDraft,
  commitRename,
  menuOpen,
  onToggleMenu,
  onSelect,
  onRename,
  onMove,
  onUnfile,
  onDelete,
  inChapter,
}: {
  scene: Scene;
  selected: boolean;
  renaming: boolean;
  renameDraft: string;
  setRenameDraft: (v: string) => void;
  commitRename: () => void;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onSelect: () => void;
  onRename: () => void;
  onMove: () => void;
  onUnfile?: () => void;
  onDelete: () => void;
  inChapter: boolean;
}) => {
  const hasMap = Boolean(scene.image_url || scene.cinematic_url);
  return (
    <div className={`camped-scnrow ${selected ? "is-sel" : ""}`}>
      <button className="camped-scnmain" onClick={onSelect}>
        <span className={`camped-scnglyph ${hasMap ? "" : "is-empty"}`}>◆</span>
        {renaming ? (
          <input
            className="camped-rename"
            value={renameDraft}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setRenameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => e.key === "Enter" && commitRename()}
          />
        ) : (
          <span className="camped-scnname">{scene.name}</span>
        )}
        {!hasMap && !renaming && <span className="camped-nomap">no map</span>}
      </button>
      <button className="camped-dots" onClick={onToggleMenu}>
        <Icon name="more" size={14} />
      </button>
      {menuOpen && (
        <div className="camped-menu" onClick={onToggleMenu}>
          <button onClick={onRename}>Rename</button>
          <button onClick={onMove}>Move to chapter…</button>
          {inChapter && onUnfile && <button onClick={onUnfile}>Remove from chapter</button>}
          <div className="camped-menusep" />
          <button className="is-danger" onClick={onDelete}>
            Delete scene
          </button>
        </div>
      )}
    </div>
  );
};

// ============================================================================
/** Debounced autosave for a text field: local draft, quiet flush. */
const useAutosave = (initial: string, save: (value: string) => void, delay = 900) => {
  const [value, setValue] = useState(initial);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(initial);

  const set = (v: string) => {
    setValue(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (v !== latest.current) {
        latest.current = v;
        save(v);
        setSavedAt(Date.now());
      }
    }, delay);
  };
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    if (value !== latest.current) {
      latest.current = value;
      save(value);
      setSavedAt(Date.now());
    }
  };
  return { value, set, flush, savedAt };
};

// ============================================================================
// Ambience <option>s: each track (its key → a random take, for variety) plus,
// for multi-take tracks, one indented option per take. A take stores the exact
// file path, which resolveAmbience plays as-is — so the DM can pin a specific
// take instead of leaving it to chance.
const renderAmbienceOptions = () =>
  AMBIENCE_TRACKS.flatMap((t) => {
    const base = (
      <option key={t.key} value={t.key}>
        {t.name} — {t.hint}
        {t.variants.length > 1 ? ` (random of ${t.variants.length} takes)` : ""}
      </option>
    );
    if (t.variants.length <= 1) return [base];
    return [
      base,
      ...t.variants.map((v, i) => (
        <option key={v} value={v}>
          {`  ↳ ${t.name} · take ${i + 1}`}
        </option>
      )),
    ];
  });

// The Documents section, grouped into tabs by kind. Shared by scenes and
// chapters — the container decides where a new doc is filed via onCreate.
const DocumentsTabs = ({
  docs,
  updateDoc,
  deleteDoc,
  onCreate,
}: {
  docs: CampaignDoc[];
  updateDoc: (id: string, patch: Partial<Pick<CampaignDoc, "title" | "content" | "visibility" | "meta">>) => Promise<{ error: string | null }>;
  deleteDoc: (id: string) => Promise<{ error: string | null }>;
  onCreate: (kind: DocKind) => void;
}) => {
  const [docTab, setDocTab] = useState<DocKind>("note");
  const tabDocs = docs.filter((d) => d.kind === docTab);
  return (
    <>
      <div className="camped-doctabs" role="tablist">
        {DOC_TABS.map((k) => {
          const n = docs.filter((d) => d.kind === k).length;
          return (
            <button
              key={k}
              role="tab"
              aria-selected={docTab === k}
              className={`camped-doctab ${docTab === k ? "is-active" : ""}`}
              onClick={() => setDocTab(k)}
            >
              {KIND_LABEL[k]}
              {n > 0 && <span className="camped-doctab-count">{n}</span>}
            </button>
          );
        })}
      </div>
      {tabDocs.length === 0 && (
        <div className="dim" style={{ fontSize: 13.5, margin: "2px 0 10px" }}>
          No {KIND_LABEL[docTab].toLowerCase()} documents here yet.
        </div>
      )}
      {tabDocs.map((d) => (
        <DocCard key={d.id} doc={d} updateDoc={updateDoc} deleteDoc={deleteDoc} />
      ))}
      <div className="camped-adddocs">
        <button onClick={() => onCreate(docTab)}>＋ {KIND_LABEL[docTab]}</button>
      </div>
    </>
  );
};

const ScenePage = ({
  scene,
  chapters,
  docs,
  updateSceneMeta,
  setSceneImageUrl,
  setSceneCinematicUrl,
  createDoc,
  updateDoc,
  deleteDoc,
}: {
  scene: Scene;
  chapters: Chapter[];
  docs: CampaignDoc[];
  updateSceneMeta: (id: string, patch: Partial<Pick<Scene, "description" | "chapter_id" | "name" | "map_id" | "ambience_url">>) => Promise<{ error: string | null }>;
  setSceneImageUrl: (id: string, url: string | null) => Promise<{ error: string | null }>;
  setSceneCinematicUrl: (id: string, url: string | null) => Promise<{ error: string | null }>;
  createDoc: (init: Partial<Pick<CampaignDoc, "kind" | "title" | "content" | "visibility" | "scene_id">>) => Promise<{ doc: CampaignDoc | null; error: string | null }>;
  updateDoc: (id: string, patch: Partial<Pick<CampaignDoc, "title" | "content" | "visibility">>) => Promise<{ error: string | null }>;
  deleteDoc: (id: string) => Promise<{ error: string | null }>;
}) => {
  const chapter = chapters.find((c) => c.id === scene.chapter_id) ?? null;
  const desc = useAutosave(scene.description ?? "", (v) => void updateSceneMeta(scene.id, { description: v }));
  const [picker, setPicker] = useState<"battlemap" | "backdrop" | null>(null);
  const [generator, setGenerator] = useState<"battlemap" | "backdrop" | null>(null);
  // The Scribe (#0041 slice 1d): draft the ~25-word arrival read-aloud from
  // the description above — the description is the canonical source.
  const toast = useToast();
  const [genre, setGenre] = useState<ScribeGenre>("auto");
  const [drafting, setDrafting] = useState(false);
  const draftRA = async () => {
    if (drafting) return;
    desc.flush();
    if (!desc.value.trim()) {
      toast.info("Write the scene description first — the Scribe drafts from it.");
      return;
    }
    setDrafting(true);
    const { text, error } = await draftReadAloud(scene.game_id, scene.id, genre);
    setDrafting(false);
    if (error || !text) {
      toast.error(error ?? "The Scribe returned nothing");
      return;
    }
    const { error: createErr } = await createDoc({
      kind: "read_aloud",
      scene_id: scene.id,
      title: "Arrival",
      content: text,
    });
    if (createErr) toast.error(createErr);
    else toast.success("Read-aloud drafted — edit it like any note.");
  };

  const applyFace = async (slot: "battlemap" | "backdrop", map: MapAsset) => {
    if (slot === "battlemap") {
      await setSceneImageUrl(scene.id, map.image_url);
      void updateSceneMeta(scene.id, { map_id: map.id });
    } else {
      await setSceneCinematicUrl(scene.id, map.image_url);
    }
    return { error: null };
  };

  return (
    <>
      <div className="camped-scenehead">
        <span className="camped-scenetitle">{scene.name}</span>
        {chapter && (
          <span className="camped-chapchip">
            {chapter.title}
            {chapter.status === "draft" ? " · draft" : ""}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span className="camped-saved">{desc.savedAt ? "Saved · just now" : ""}</span>
      </div>

      <div className="camped-sechead">
        <h5>Scene description</h5>
        <span style={{ flex: 1 }} />
        <select
          className="camped-genresel"
          value={genre}
          onChange={(e) => setGenre(e.target.value as ScribeGenre)}
          title="The Scribe's tone for this draft"
        >
          {SCRIBE_GENRES.map((g) => (
            <option key={g.key} value={g.key}>
              {g.label}
            </option>
          ))}
        </select>
        <button className="camped-scribebtn" onClick={() => void draftRA()} disabled={drafting}>
          {drafting ? "Drafting…" : "✎ Draft read-aloud"}
        </button>
      </div>
      <textarea
        className="camped-desc"
        placeholder="What is this place? Who's here, what's going on, what happens if the party pokes it? This description seeds the read-aloud and both map generators."
        value={desc.value}
        onChange={(e) => desc.set(e.target.value)}
        onBlur={desc.flush}
        rows={4}
      />

      <div className="camped-sechead">
        <h5>Faces</h5>
      </div>
      <div className="camped-faces">
        {(["backdrop", "battlemap"] as const).map((slot) => {
          const url = slot === "backdrop" ? scene.cinematic_url : scene.image_url;
          return (
            <div key={slot} className="camped-face">
              {url ? (
                <img src={url} alt={slot} />
              ) : (
                <div className="camped-face-empty">
                  <Icon name={slot === "backdrop" ? "image" : "map"} size={22} />
                  <span>No {slot} yet</span>
                </div>
              )}
              <div className="camped-facebar">
                <b>{slot === "backdrop" ? "Backdrop" : "Battlemap"}</b>
                <span style={{ flex: 1 }} />
                <button onClick={() => setPicker(slot)}>Swap</button>
                <button onClick={() => setGenerator(slot)}>Generate</button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="camped-sechead">
        <h5>Ambience</h5>
        <span style={{ flex: 1 }} />
        {scene.ambience_url && <span className="camped-scribehint">plays while staged</span>}
      </div>
      <div className="camped-ambience">
        <Icon name="music" size={15} />
        <label className="camped-ambience-label">Base</label>
        <select
          value={scene.ambience_url ?? ""}
          onChange={(e) => void updateSceneMeta(scene.id, { ambience_url: e.target.value || null })}
        >
          <option value="">No ambience</option>
          {renderAmbienceOptions()}
        </select>
        {resolveAmbience(scene.ambience_url, 0) && (
          <audio src={resolveAmbience(scene.ambience_url, 0)!} controls preload="none" className="camped-ambience-player" />
        )}
      </div>
      <div className="camped-ambience">
        <Icon name="swords" size={15} />
        <label className="camped-ambience-label">Combat</label>
        <select
          value={scene.combat_ambience_url ?? ""}
          onChange={(e) => void updateSceneMeta(scene.id, { combat_ambience_url: e.target.value || null })}
        >
          <option value="">Default battle cue (Blades Drawn)</option>
          {renderAmbienceOptions()}
        </select>
        {resolveAmbience(scene.combat_ambience_url, 0) && (
          <audio src={resolveAmbience(scene.combat_ambience_url, 0)!} controls preload="none" className="camped-ambience-player" />
        )}
      </div>

      <div className="camped-sechead">
        <h5>Documents</h5>
      </div>
      <DocumentsTabs
        docs={docs}
        updateDoc={updateDoc}
        deleteDoc={deleteDoc}
        onCreate={(kind) =>
          void createDoc({
            kind,
            scene_id: scene.id,
            title: "",
            ...(kind === "handout" ? { meta: { template: "letter", fields: EMPTY_FIELDS } } : {}),
          })
        }
      />

      {picker && (
        <MapPickerDialog
          currentMapId={picker === "battlemap" ? scene.map_id : null}
          filterType={picker === "battlemap" ? ["battlemap"] : ["cinematic", "regional"]}
          slot={picker}
          onClear={() => {
            if (picker === "battlemap") {
              void setSceneImageUrl(scene.id, null);
              void updateSceneMeta(scene.id, { map_id: null });
            } else void setSceneCinematicUrl(scene.id, null);
            setPicker(null);
          }}
          onPick={(m) => {
            void applyFace(picker, m);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}

      {generator && (
        <GenerateMapDialog
          initialKind={generator === "battlemap" ? "battlemap" : "backdrop"}
          applyToScene={{ onApply: (m) => applyFace(generator, m) }}
          onClose={() => setGenerator(null)}
        />
      )}
    </>
  );
};

// ============================================================================
/** The chapter hub — the Borderlands "Getting Started" index, derived live:
 *  every sub-place with its one-line hook, map status, and prep depth. */
const ChapterPage = ({
  chapter,
  index,
  scenes,
  docs,
  onOpenScene,
  onPublish,
  onAddScene,
  createDoc,
  updateDoc,
  deleteDoc,
}: {
  chapter: Chapter | null;
  index: number;
  scenes: Scene[];
  docs: CampaignDoc[];
  onOpenScene: (id: string) => void;
  onPublish: (ch: Chapter) => void;
  onAddScene: (chapterId: string) => void;
  createDoc: (init: Partial<Pick<CampaignDoc, "kind" | "title" | "content" | "visibility" | "chapter_id" | "meta">>) => Promise<{ doc: CampaignDoc | null; error: string | null }>;
  updateDoc: (id: string, patch: Partial<Pick<CampaignDoc, "title" | "content" | "visibility">>) => Promise<{ error: string | null }>;
  deleteDoc: (id: string) => Promise<{ error: string | null }>;
}) => {
  if (!chapter) return <div className="dim" style={{ padding: 32 }}>That chapter is gone.</div>;
  const chapterDocs = docs.filter((d) => d.chapter_id === chapter.id);
  const hook = (s: Scene) => {
    const line = (s.description ?? "").split(/[.\n]/)[0].trim();
    return line || "—";
  };
  return (
    <>
      <div className="camped-scenehead">
        <span className="camped-scenetitle">
          {index + 1} · {chapter.title}
        </span>
        {chapter.status === "draft" ? (
          <span className="camped-draft">Draft</span>
        ) : (
          <span className="camped-chapchip">Published</span>
        )}
        <span style={{ flex: 1 }} />
        <Button variant={chapter.status === "draft" ? "primary" : "ghost"} size="sm" onClick={() => onPublish(chapter)}>
          {chapter.status === "draft" ? "Publish chapter…" : "Unpublish"}
        </Button>
      </div>
      <p className="dim" style={{ fontSize: 14, maxWidth: "62ch", margin: "6px 0 16px" }}>
        {chapter.status === "draft"
          ? "Backstage — players can't reach these scenes until you publish."
          : "Live — players can travel to these scenes."}
      </p>

      <div className="camped-sechead">
        <h5>Scenes</h5>
      </div>
      {scenes.length === 0 ? (
        <div className="dim" style={{ fontSize: 13.5, marginBottom: 10 }}>No scenes yet.</div>
      ) : (
        <div className="camped-hub">
          <div className="camped-hubrow is-head">
            <span>Scene</span>
            <span>Hook</span>
            <span>Maps</span>
            <span>Prep</span>
          </div>
          {scenes.map((s) => {
            const sceneDocs = docs.filter((d) => d.scene_id === s.id);
            const ra = sceneDocs.filter((d) => d.kind === "read_aloud" && d.content.trim()).length;
            return (
              <button key={s.id} className="camped-hubrow" onClick={() => onOpenScene(s.id)}>
                <span className="camped-hubname">{s.name}</span>
                <span className="camped-hubhook">{hook(s)}</span>
                <span className="camped-hubmaps">
                  <span className={s.cinematic_url ? "is-ok" : ""} title="Backdrop">◐</span>
                  <span className={s.image_url ? "is-ok" : ""} title="Battlemap">▦</span>
                </span>
                <span className="camped-hubprep">
                  {sceneDocs.length} doc{sceneDocs.length === 1 ? "" : "s"}
                  {ra > 0 ? " · ❝" : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div className="camped-adddocs" style={{ marginTop: 8 }}>
        <button onClick={() => onAddScene(chapter.id)}>＋ Scene</button>
      </div>

      <div className="camped-sechead">
        <h5>Chapter notes</h5>
      </div>
      <DocumentsTabs
        docs={chapterDocs}
        updateDoc={updateDoc}
        deleteDoc={deleteDoc}
        onCreate={(kind) =>
          void createDoc({
            kind,
            chapter_id: chapter.id,
            title: "",
            ...(kind === "handout" ? { meta: { template: "letter", fields: EMPTY_FIELDS } } : {}),
          })
        }
      />
    </>
  );
};

// ============================================================================
const SessionPage = ({
  session,
  docs,
  createDoc,
  updateDoc,
  deleteDoc,
}: {
  session: GameSession | null;
  docs: CampaignDoc[];
  createDoc: (init: Partial<Pick<CampaignDoc, "kind" | "title" | "content" | "visibility" | "session_id">>) => Promise<{ doc: CampaignDoc | null; error: string | null }>;
  updateDoc: (id: string, patch: Partial<Pick<CampaignDoc, "title" | "content" | "visibility">>) => Promise<{ error: string | null }>;
  deleteDoc: (id: string) => Promise<{ error: string | null }>;
}) => {
  const toast = useToast();
  const [drafting, setDrafting] = useState(false);
  if (!session) return <div className="dim" style={{ padding: 32 }}>That session is gone.</div>;
  const started = new Date(session.started_at).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const draft = async () => {
    if (drafting) return;
    setDrafting(true);
    const { text, error } = await draftRecap(session.game_id, session.id);
    setDrafting(false);
    if (error || !text) {
      toast.error(error ?? "The Scribe returned nothing");
      return;
    }
    const { error: createErr } = await createDoc({
      kind: "recap",
      session_id: session.id,
      title: `Session ${session.number} recap`,
      content: text,
      visibility: "players",
    });
    if (createErr) toast.error(createErr);
    else toast.success("Recap drafted from the session log — edit it, then present it next session.");
  };
  return (
    <>
      <div className="camped-scenehead">
        <span className="camped-scenetitle">Session {session.number}</span>
        <span className="camped-chapchip">
          {started} · {session.ended_at ? sessionDuration(session) : "live now"}
        </span>
      </div>
      <p className="dim" style={{ fontSize: 14, maxWidth: "62ch", margin: "6px 0 18px" }}>
        {session.ended_at
          ? "The record of this session. A player-facing recap makes a great “previously on…” to open the next one."
          : "This session is recording right now — rolls, chat, and scene changes are going on the record."}
      </p>
      {docs.map((d) => (
        <DocCard key={d.id} doc={d} updateDoc={updateDoc} deleteDoc={deleteDoc} />
      ))}
      {session.ended_at && docs.length === 0 && (
        <div className="camped-adddocs">
          <button className="camped-scribebtn" onClick={() => void draft()} disabled={drafting}>
            {drafting ? "The Scribe is reading the log…" : "✎ Draft recap"}
          </button>
          <button
            onClick={() =>
              void createDoc({
                kind: "recap",
                session_id: session.id,
                title: `Session ${session.number} recap`,
                visibility: "players",
              })
            }
          >
            ＋ Blank recap
          </button>
        </div>
      )}
    </>
  );
};

// ============================================================================
/** The Cast — the campaign's people, as a ledger (the table's Party panel is
 *  "the room"; this is the roster). Instance state, never exported in packs. */
const CastPage = ({
  members,
  loading,
  dmUserId,
  onRemove,
}: {
  members: CastMember[];
  loading: boolean;
  dmUserId: string;
  onRemove: (m: CastMember) => void;
}) => (
  <>
    <div className="camped-scenehead">
      <span className="camped-scenetitle">Cast</span>
      <span className="camped-chapchip">
        {members.filter((m) => m.role === "player").length} player
        {members.filter((m) => m.role === "player").length === 1 ? "" : "s"}
      </span>
    </div>
    <p className="dim" style={{ fontSize: 14, maxWidth: "62ch", margin: "6px 0 18px" }}>
      Everyone at this table and the character they brought. Removing someone
      frees their seat — their character remains theirs, untouched.
    </p>
    {loading && <div className="dim">Loading…</div>}
    {!loading && members.length === 0 && (
      <div className="dim" style={{ fontSize: 13.5 }}>
        No one has joined yet — share the invite from the table's Party panel.
      </div>
    )}
    <div className="cast-grid">
      {members.map((m) => (
        <div key={m.user_id} className="cast-card">
          <div className="cast-portrait">
            {m.character?.portrait ? <img src={m.character.portrait} alt="" /> : <span>{m.name.charAt(0).toUpperCase()}</span>}
          </div>
          <div className="cast-info">
            <div className="cast-player">
              {m.name}
              <span className={`cast-role ${m.role === "dm" ? "is-dm" : ""}`}>{m.role === "dm" ? "DM" : "Player"}</span>
            </div>
            {m.character ? (
              <>
                <div className="cast-charname">{m.character.name}</div>
                <div className="cast-charline">{m.character.line || "—"}</div>
              </>
            ) : (
              <div className="cast-charline">No character brought yet</div>
            )}
          </div>
          {m.user_id !== dmUserId && (
            <button className="cast-remove" title="Remove from campaign" onClick={() => onRemove(m)}>
              <Icon name="delete" size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  </>
);

// ============================================================================
const OverviewPage = ({
  campaign,
  docs,
  createDoc,
  updateDoc,
  deleteDoc,
}: {
  campaign: Game;
  docs: CampaignDoc[];
  createDoc: (init: Partial<Pick<CampaignDoc, "kind" | "title" | "content" | "visibility">>) => Promise<{ doc: CampaignDoc | null; error: string | null }>;
  updateDoc: (id: string, patch: Partial<Pick<CampaignDoc, "title" | "content" | "visibility">>) => Promise<{ error: string | null }>;
  deleteDoc: (id: string) => Promise<{ error: string | null }>;
}) => {
  const campaignDocs = docs.filter((d) => !d.scene_id && !d.chapter_id && !d.session_id && d.kind !== "recap");
  const { memory, forget } = useCampaignMemory(campaign.id);
  return (
    <>
      <div className="camped-scenehead">
        <span className="camped-scenetitle">Campaign overview</span>
      </div>
      <p className="dim" style={{ fontSize: 14, maxWidth: "62ch", marginBottom: 18 }}>
        The campaign's evergreen material — premise, factions, NPCs, secrets.
        These documents feed the Scribe's context for everything it drafts.
      </p>
      {campaignDocs.length === 0 && (
        <div className="dim" style={{ fontSize: 13.5, marginBottom: 10 }}>
          Start with the premise: what's really going on in {campaign.name}?
        </div>
      )}
      {campaignDocs.map((d) => (
        <DocCard key={d.id} doc={d} updateDoc={updateDoc} deleteDoc={deleteDoc} />
      ))}
      <div className="camped-adddocs">
        {(["note", "quest", "handout"] as DocKind[]).map((k) => (
          <button
            key={k}
            onClick={() =>
              void createDoc({
                kind: k,
                title: "",
                ...(k === "handout" ? { meta: { template: "notice", fields: EMPTY_FIELDS } } : {}),
              })
            }
          >
            ＋ {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      {memory.length > 0 && (
        <>
          <div className="camped-sechead">
            <h5>What the Co-DM remembers</h5>
          </div>
          <div className="camped-memory">
            {memory.map((m) => (
              <div key={m.id} className="camped-memory-row">
                <Icon name="sparkles" size={13} />
                <span className="camped-memory-text">{m.content}</span>
                <button className="camped-memory-forget" title="Forget this" onClick={() => void forget(m.id)}>
                  <Icon name="close" size={12} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
};

// ============================================================================
const DocCard = ({
  doc,
  updateDoc,
  deleteDoc,
}: {
  doc: CampaignDoc;
  updateDoc: (id: string, patch: Partial<Pick<CampaignDoc, "title" | "content" | "visibility" | "meta">>) => Promise<{ error: string | null }>;
  deleteDoc: (id: string) => Promise<{ error: string | null }>;
}) => {
  const { confirm } = useConfirm();
  const toast = useToast();
  const shares = useContext(SharesContext);
  const title = useAutosave(doc.title, (v) => void updateDoc(doc.id, { title: v }));
  const content = useAutosave(doc.content, (v) => void updateDoc(doc.id, { content: v }));
  const isRA = doc.kind === "read_aloud";
  const shared = shares.isShared(doc.id);
  const partyShared = shares.isPartyShared(doc.id);
  const sharedPlayers = shares.playersFor(doc.id);
  const [shareMenu, setShareMenu] = useState(false);
  // A compact label for the current share state.
  const shareLabel = !shared
    ? "＋ Share"
    : partyShared
      ? "◉ Party"
      : sharedPlayers.length === 1
        ? `◉ ${shares.players.find((p) => p.user_id === sharedPlayers[0])?.name ?? "1 player"}`
        : `◉ ${sharedPlayers.length} players`;
  // Notes are the DM's private working material — no point sharing them.
  const shareable = doc.kind !== "note";
  // Narration (the Narrator channel): read-alouds and recaps can carry a
  // pre-generated voice, cached on meta.audio_url and played when Presented.
  const narratable = doc.kind === "read_aloud" || doc.kind === "recap";
  const audioUrl = (doc.meta as { audio_url?: string } | undefined)?.audio_url ?? null;
  const [voicing, setVoicing] = useState(false);
  const genVoice = async () => {
    content.flush();
    const text = content.value.trim();
    if (!text) {
      toast.info("Write the read-aloud first — then I'll give it a voice.");
      return;
    }
    setVoicing(true);
    const { url, error } = await generateNarration(doc.game_id, text);
    setVoicing(false);
    if (error || !url) {
      toast.error(error ?? "Couldn't generate the voice.");
      return;
    }
    await updateDoc(doc.id, { meta: { ...(doc.meta ?? {}), audio_url: url } });
    toast.success("Voice ready — it'll play when you Present this.");
  };

  return (
    <div className={`camped-doc ${isRA ? "is-readaloud" : ""}`}>
      <div className="camped-dochead">
        <span className={`camped-kind ${shared ? "is-players" : ""}`}>{KIND_LABEL[doc.kind]}</span>
        <input
          className="camped-doctitle"
          placeholder={isRA ? "When to read this…" : "Title…"}
          value={title.value}
          onChange={(e) => title.set(e.target.value)}
          onBlur={title.flush}
        />
        {shareable ? (
          <div className="camped-sharewrap">
            <button
              className={`camped-sharebtn ${shared ? "is-shared" : ""}`}
              title="Choose who sees this"
              onClick={() => setShareMenu((v) => !v)}
            >
              {shareLabel} ▾
            </button>
            {shareMenu && (
              <>
                <div className="camped-menuveil" onClick={() => setShareMenu(false)} />
                <div className="camped-sharemenu">
                  <button
                    className={partyShared ? "is-on" : ""}
                    onClick={() => {
                      shares.shareParty(doc.id);
                      setShareMenu(false);
                    }}
                  >
                    <span>◉ Whole party</span>
                  </button>
                  {shares.players.length > 0 && <div className="camped-sharemenu-label">Just one player</div>}
                  {shares.players.map((p) => {
                    const on = sharedPlayers.includes(p.user_id);
                    return (
                      <button
                        key={p.user_id}
                        className={on ? "is-on" : ""}
                        onClick={() => (on ? shares.unshareOne(doc.id, p.user_id) : shares.sharePlayer(doc.id, p.user_id))}
                      >
                        <span>{on ? "✓ " : ""}{p.name}</span>
                      </button>
                    );
                  })}
                  {shared && (
                    <>
                      <div className="camped-menusep" />
                      <button className="is-danger" onClick={() => { shares.unshare(doc.id); setShareMenu(false); }}>
                        Stop sharing
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <span className="camped-private" title="Your private note — never shared">🔒 Private</span>
        )}
        <button
          className="camped-docdelete"
          title="Delete document"
          onClick={async () => {
            if (
              (doc.kind !== "handout" && doc.content.trim() === "") ||
              (await confirm({ title: "Delete document", message: `Delete "${doc.title || KIND_LABEL[doc.kind]}"?`, confirmLabel: "Delete", danger: true }))
            ) {
              void deleteDoc(doc.id);
            }
          }}
        >
          <Icon name="delete" size={14} />
        </button>
      </div>
      {doc.kind === "handout" ? (
        <HandoutDocBody doc={doc} updateDoc={updateDoc as (id: string, patch: { meta: Record<string, unknown> }) => Promise<{ error: string | null }>} />
      ) : (
        <textarea
          className={isRA ? "camped-ra" : "camped-body"}
          placeholder={
            isRA
              ? "The words you'll read aloud — mist on the water, a bell that rings with no hand on the rope…"
              : doc.kind === "quest"
                ? "Hook → steps → reward."
                : "DM notes — what's really going on here."
          }
          value={content.value}
          onChange={(e) => content.set(e.target.value)}
          onBlur={content.flush}
          rows={isRA ? 3 : 4}
        />
      )}
      {narratable && (
        <div className="camped-voice">
          {audioUrl ? (
            <>
              <audio src={audioUrl} controls className="camped-voice-player" preload="none" />
              <button className="camped-voice-btn" onClick={() => void genVoice()} disabled={voicing}>
                {voicing ? "Revoicing…" : "↻ Regenerate"}
              </button>
            </>
          ) : (
            <button className="camped-voice-btn" onClick={() => void genVoice()} disabled={voicing}>
              {voicing ? "Giving it a voice…" : "🔊 Generate voice"}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
const CampaignSettings = ({
  campaign,
  onPatched,
  onDelete,
  onClose,
}: {
  campaign: Game;
  onPatched: (patch: Partial<Game>) => void;
  onDelete: () => void;
  onClose: () => void;
}) => {
  const toast = useToast();
  const [name, setName] = useState(campaign.name);
  const [tagline, setTagline] = useState(campaign.description ?? "");
  const [levelMin, setLevelMin] = useState<number | "">(campaign.level_min ?? "");
  const [levelMax, setLevelMax] = useState<number | "">(campaign.level_max ?? "");
  const [saving, setSaving] = useState(false);

  const levels = useMemo(() => Array.from({ length: 20 }, (_, i) => i + 1), []);

  const save = async () => {
    if (!name.trim()) return;
    if (levelMin !== "" && levelMax !== "" && levelMin > levelMax) {
      toast.error("The level band is upside down — min must be ≤ max.");
      return;
    }
    setSaving(true);
    const patch = {
      name: name.trim(),
      description: tagline.trim(),
      level_min: levelMin === "" ? null : levelMin,
      level_max: levelMax === "" ? null : levelMax,
    };
    const { error } = await supabase.from("games").update(patch).eq("id", campaign.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      onPatched(patch as Partial<Game>);
      onClose();
    }
  };

  return (
    <Dialog onClose={onClose} size="sm" title="Campaign settings" subtitle="What the app needs to know — the story lives in the overview.">
      <div style={{ display: "grid", gap: 14 }}>
        <label className="camped-field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="camped-field">
          <span>Tagline — shown on the campaign card</span>
          <input value={tagline} placeholder="A borderland keep, a river, and something ringing the bell…" onChange={(e) => setTagline(e.target.value)} />
        </label>
        <div className="camped-field">
          <span>Level band</span>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <select value={levelMin} onChange={(e) => setLevelMin(e.target.value === "" ? "" : Number(e.target.value))}>
              <option value="">—</option>
              {levels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <span className="dim">to</span>
            <select value={levelMax} onChange={(e) => setLevelMax(e.target.value === "" ? "" : Number(e.target.value))}>
              <option value="">—</option>
              {levels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={() => void save()} disabled={saving || !name.trim()}>
            Save
          </Button>
        </div>

        <div className="camped-danger">
          <div>
            <b>Danger zone</b>
            <div className="dim" style={{ fontSize: 12.5 }}>
              Deletes the campaign, its chapters, scenes, documents, and seats.
            </div>
          </div>
          <Button variant="danger-ghost" size="sm" onClick={onDelete}>
            Delete campaign
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
