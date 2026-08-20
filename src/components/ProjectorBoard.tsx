import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useScenes } from "../state/useScenes";
import { useTokens } from "../state/useTokens";
import { useDrawings } from "../state/useDrawings";
import { usePings } from "../state/usePings";
import { useFog } from "../state/useFog";
import { useInitiative } from "../state/useInitiative";
import { findSize } from "../lib/tokenSmith";
import { penPathD, arrowHead, shapeBox } from "../lib/drawing";
import { conditionName } from "../lib/conditions";

/**
 * The player projector — a read-only, chrome-free view of a game's board for a
 * second screen (cast to a TV / shared monitor). Opened at `#/display/<gameId>`
 * in its own tab, so its realtime channels don't collide with the DM's table.
 *
 * It enforces PLAYER visibility: hidden (DM-only) tokens are omitted, and fog of
 * war paints solid black over unexplored cells — never the DM's translucent
 * preview. It follows the DM's active scene automatically (games.active_scene_id
 * is authoritative). The map auto-fits the viewport via the SVG viewBox +
 * preserveAspectRatio, independent of the DM's pan/zoom.
 *
 * All hooks run read-only — their mutators are simply ignored.
 */

const CELL = 40;
const DEFAULT_COLS = 30;
const DEFAULT_ROWS = 20;

const initialsOf = (label: string): string =>
  label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

export const ProjectorBoard = ({ gameId }: { gameId: string }) => {
  // The active scene id seeds useScenes, which then live-tracks scene switches.
  const [seedSceneId, setSeedSceneId] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "denied">("loading");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("games")
        .select("id, active_scene_id")
        .eq("id", gameId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setStatus("denied");
        return;
      }
      setSeedSceneId((data as { active_scene_id: string | null }).active_scene_id);
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  // The cast screen follows the DM's stage, never the viewer's own per-member
  // override (#Phase 3) — even though it may run under a signed-in account.
  const { activeScene } = useScenes(gameId, seedSceneId, { stageOnly: true });
  const cols = activeScene?.grid_cols ?? DEFAULT_COLS;
  const rows = activeScene?.grid_rows ?? DEFAULT_ROWS;
  const width = cols * CELL;
  const height = rows * CELL;

  const { tokens } = useTokens(gameId, activeScene?.id ?? null);
  const { drawings } = useDrawings(gameId, activeScene?.id ?? null);
  const { pings } = usePings(activeScene?.id ?? null);
  const fog = useFog(activeScene, cols);
  const init = useInitiative(activeScene, tokens);

  // Players never see hidden (DM-only) tokens.
  const visible = useMemo(() => tokens.filter((t) => !t.hidden), [tokens]);

  // Solid-black fog over every un-revealed cell (one <path>, many subpaths).
  const fogPath = useMemo(() => {
    if (!fog.enabled) return null;
    let d = "";
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!fog.revealed.has(y * cols + x)) {
          d += `M${x * CELL},${y * CELL}h${CELL}v${CELL}h${-CELL}z`;
        }
      }
    }
    return d || null;
  }, [fog.enabled, fog.revealed, cols, rows]);

  if (status === "loading") {
    return <div className="projector projector-msg">Connecting to the table…</div>;
  }
  if (status === "denied") {
    return (
      <div className="projector projector-msg">
        <div>
          <strong>Can't open this table.</strong>
          <p>Sign in on this browser as a member of the game, then reopen the player view.</p>
        </div>
      </div>
    );
  }

  // Which face the DM is showing. Pre-0035 scenes have no mode → tactical.
  const mode = activeScene?.mode ?? "tactical";
  const cinematic = activeScene?.cinematic_url ?? null;

  return (
    <div className={`projector projector-mode-${mode}`}>
      {/* Cinematic backdrop. Sharp + full-bleed in cinematic mode; in tactical
          mode it stays as a blurred, dimmed filler behind the board so the old
          black letterbox margins read as atmospheric depth instead of void. */}
      {cinematic && (
        <div
          className="projector-cinematic"
          style={{ backgroundImage: `url("${cinematic}")` }}
          aria-hidden="true"
        />
      )}
      {mode === "cinematic" && cinematic && <div className="projector-vignette" aria-hidden="true" />}

      {!activeScene && <div className="projector-msg">Waiting for the DM to open a scene…</div>}
      {activeScene && mode === "cinematic" && !cinematic && (
        <div className="projector-msg">The DM is setting the scene…</div>
      )}
      {activeScene && mode !== "cinematic" && (
        <svg
          className="projector-svg"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <pattern id="proj-grid" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
              <path d={`M ${CELL} 0 L 0 0 0 ${CELL}`} fill="none" stroke="var(--line)" strokeWidth="1" />
            </pattern>
          </defs>

          <rect width={width} height={height} fill="var(--bg-0)" />
          {activeScene.image_url && (
            <image
              href={activeScene.image_url}
              x={activeScene.map_offset_x ?? 0}
              y={activeScene.map_offset_y ?? 0}
              width={width * (activeScene.map_scale ?? 1)}
              height={height * (activeScene.map_scale ?? 1)}
              preserveAspectRatio="xMinYMin slice"
            />
          )}
          <rect
            width={width}
            height={height}
            fill="url(#proj-grid)"
            style={{ opacity: activeScene.image_url ? 0.55 : 1 }}
          />

          {/* Tokens (hidden ones already filtered out) */}
          {visible.map((t) => {
            const spec = findSize(t.size);
            const span = spec.cells;
            const cx = t.x * CELL + (span * CELL) / 2;
            const cy = t.y * CELL + (span * CELL) / 2;
            const r = spec.radius * CELL;
            const clipId = `proj-clip-${t.id}`;
            return (
              <g key={t.id}>
                {t.image_url ? (
                  <>
                    <defs>
                      <clipPath id={clipId}>
                        <circle cx={cx} cy={cy} r={r} />
                      </clipPath>
                    </defs>
                    <image
                      href={t.image_url}
                      x={cx - r}
                      y={cy - r}
                      width={r * 2}
                      height={r * 2}
                      preserveAspectRatio="xMidYMid slice"
                      clipPath={`url(#${clipId})`}
                    />
                    <circle cx={cx} cy={cy} r={r} fill="none" stroke={t.color} strokeWidth={Math.max(2, r * 0.06)} />
                  </>
                ) : (
                  <>
                    <circle cx={cx} cy={cy} r={r} fill={t.color} stroke="#14100c" strokeWidth={2} />
                    <text x={cx} y={cy + r * 0.15} textAnchor="middle" fontSize={r * 0.9} fontWeight={700} fill="#14100c">
                      {initialsOf(t.label)}
                    </text>
                  </>
                )}
                {init.activeToken?.id === t.id && (
                  <circle cx={cx} cy={cy} r={r + 7} fill="none" stroke="var(--ember)" strokeWidth={3}>
                    <animate attributeName="opacity" values="1;0.35;1" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                <text
                  x={cx}
                  y={cy + r + 12}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--text)"
                  stroke="var(--bg-0)"
                  strokeWidth={3}
                  paintOrder="stroke"
                >
                  {t.label}
                </text>
                {(t.conditions ?? []).length > 0 && (() => {
                  const conds = t.conditions ?? [];
                  const chipW = 22;
                  const gap = 3;
                  const total = conds.length * chipW + (conds.length - 1) * gap;
                  const by = cy - r - 20;
                  return (
                    <g>
                      {conds.map((cond, ci) => {
                        const bx = cx - total / 2 + ci * (chipW + gap);
                        return (
                          <g key={cond}>
                            <title>{conditionName(cond)}</title>
                            <rect x={bx} y={by} width={chipW} height={14} rx={4} fill="rgba(122, 26, 26, 0.94)" stroke="#e0864f" strokeWidth={1} />
                            <text x={bx + chipW / 2} y={by + 10.5} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="#ffeede">
                              {conditionName(cond).slice(0, 3).toUpperCase()}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  );
                })()}
              </g>
            );
          })}

          {/* Drawings (committed ink only — no in-progress stroke) */}
          {drawings.map((d) => {
            const common = {
              stroke: d.color,
              strokeWidth: 3,
              fill: "none" as const,
              strokeLinecap: "round" as const,
              strokeLinejoin: "round" as const,
            };
            if (d.kind === "pen") return <path key={d.id} d={penPathD(d.points)} {...common} />;
            if (d.kind === "arrow") {
              return (
                <g key={d.id}>
                  <line x1={d.points[0]} y1={d.points[1]} x2={d.points[2]} y2={d.points[3]} {...common} />
                  <polygon points={arrowHead(d.points)} fill={d.color} stroke="none" />
                </g>
              );
            }
            const b = shapeBox(d.points);
            if (d.kind === "rect") return <rect key={d.id} x={b.x} y={b.y} width={b.w} height={b.h} {...common} />;
            return <ellipse key={d.id} cx={b.x + b.w / 2} cy={b.y + b.h / 2} rx={b.w / 2} ry={b.h / 2} {...common} />;
          })}

          {/* Solid player fog — above tokens, so what's in the dark stays unseen */}
          {fogPath && <path d={fogPath} fill="rgb(12, 9, 6)" />}

          {/* Pings render on top so the DM can point through the dark */}
          {pings.map((p) => (
            <g key={p.id} className="ping" transform={`translate(${p.x} ${p.y})`}>
              <circle className="ping-glow" r={46} fill="var(--ember)" />
              <circle className="ping-ring" r={46} fill="none" stroke="#f6ecd2" strokeWidth={3} />
              <circle className="ping-ring ping-ring-delayed" r={46} fill="none" stroke="#f6ecd2" strokeWidth={2.5} />
              <circle className="ping-dot" r={7} fill="var(--ember)" stroke="#f6ecd2" strokeWidth={2} />
            </g>
          ))}
        </svg>
      )}
    </div>
  );
};
