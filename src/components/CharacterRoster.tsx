import type { Character } from "../types/character";
import { Card, CardBody } from "./ui/Card";
import { CardMenu } from "./ui/CardMenu";
import { Button } from "./ui/Button";
import { EmptyState } from "./ui/EmptyState";
import { LibraryBanner } from "./ui/LibraryBanner";
import { useConfirm } from "../state/Confirm";

interface Props {
  characters: Character[];
  /** Ids the signed-in user owns (can open/edit/delete/publish). */
  ownedIds: Set<string>;
  /** Ids published to the shared library — a non-owned one is a "premade". */
  publicIds: Set<string>;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onPublish: (id: string, isPublic: boolean) => void;
  /** Copy a premade into the user's own roster (then open the new sheet). */
  onClone: (id: string) => void;
}

export const CharacterRoster = ({
  characters,
  ownedIds,
  publicIds,
  onOpen,
  onCreate,
  onDelete,
  onPublish,
  onClone,
}: Props) => {
  const { confirm } = useConfirm();
  const mineCount = characters.filter((c) => ownedIds.has(c.id)).length;
  const premadeCount = characters.filter((c) => !ownedIds.has(c.id) && publicIds.has(c.id)).length;
  return (
  <div className="screen-enter" style={{ padding: 24 }}>
    <LibraryBanner
      image="/art/paladin.png"
      eyebrow="Your Roster"
      title="My Characters"
      subtitle={
        premadeCount > 0
          ? `${mineCount} character${mineCount === 1 ? "" : "s"} · ${premadeCount} premade`
          : `${characters.length} character${characters.length === 1 ? "" : "s"}`
      }
    >
      <Button variant="primary" size="lg" icon="add" onClick={onCreate}>
        Create a Character
      </Button>
    </LibraryBanner>

    {characters.length === 0 ? (
      <EmptyState
        icon="users"
        title="No characters yet"
        cta={{ label: "Create your first character", icon: "add", onClick: onCreate }}
      >
        Build a hero with the character builder — class, species, background,
        and ability scores, all in a few steps.
      </EmptyState>
    ) : (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {characters.map((c) => {
          const initials = c.name
            .split(/\s+/)
            .map((w) => w[0])
            .filter(Boolean)
            .slice(0, 2)
            .join("")
            .toUpperCase();
          const classes = c.classes.map((cl) => `${cl.name} ${cl.level}`).join(" / ");
          const owned = ownedIds.has(c.id);
          const isPublic = publicIds.has(c.id);
          const premade = !owned && isPublic;
          return (
            <Card
              key={c.id}
              className={owned ? "has-menu" : undefined}
              onClick={() => (premade ? onClone(c.id) : onOpen(c.id))}
              title={premade ? `Add ${c.name} to your roster` : `Open ${c.name}`}
            >
              {owned ? (
                <>
                  {isPublic && (
                    <span className="card-badge is-shared" title="Published to the shared library — anyone can clone it">Shared</span>
                  )}
                  <CardMenu
                    label={`Actions for ${c.name}`}
                    items={[
                      {
                        label: isPublic ? "Remove from shared library" : "Publish to shared library",
                        icon: isPublic ? "remove" : "star",
                        onClick: () => onPublish(c.id, !isPublic),
                      },
                      {
                        label: "Delete",
                        icon: "delete",
                        danger: true,
                        onClick: async () => {
                          if (
                            await confirm({
                              title: "Delete character",
                              message: `Delete ${c.name}? This cannot be undone.`,
                              confirmLabel: "Delete",
                              danger: true,
                            })
                          )
                            onDelete(c.id);
                        },
                      },
                    ]}
                  />
                </>
              ) : premade ? (
                <span className="card-badge" title="Premade — click to copy it into your roster">Premade</span>
              ) : null}
              <CardBody>
                <div className="row" style={{ gap: 12 }}>
                  {c.portrait ? (
                    <img className="portrait" src={c.portrait} alt={c.name} />
                  ) : (
                    <div className="portrait">{initials || "?"}</div>
                  )}
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 17,
                        fontWeight: 500,
                        color: "var(--cream)",
                        letterSpacing: "0.02em",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.name}
                    </div>
                    <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
                      Level {c.level} · {c.species} · {classes}
                    </div>
                    <div className="dim" style={{ fontSize: 12 }}>{c.background}</div>
                  </div>
                </div>
                <div
                  className="dim mono"
                  style={{ fontSize: 11, marginTop: 8, letterSpacing: "0.06em" }}
                >
                  {premade ? "Click to add to your roster" : `HP ${c.hp.current}/${c.hp.max} · AC ${c.ac.override ?? c.ac.value}`}
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    )}
  </div>
  );
};
