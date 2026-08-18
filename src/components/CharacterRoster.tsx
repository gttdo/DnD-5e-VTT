import type { Character } from "../types/character";
import { Card, CardBody } from "./ui/Card";
import { CardMenu } from "./ui/CardMenu";
import { Button } from "./ui/Button";
import { EmptyState } from "./ui/EmptyState";
import { LibraryBanner } from "./ui/LibraryBanner";
import { useConfirm } from "../state/Confirm";

interface Props {
  characters: Character[];
  onOpen: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

export const CharacterRoster = ({ characters, onOpen, onCreate, onDelete }: Props) => {
  const { confirm } = useConfirm();
  return (
  <div className="screen-enter" style={{ padding: 24 }}>
    <LibraryBanner
      image="/art/paladin.png"
      eyebrow="Your Roster"
      title="My Characters"
      subtitle={`${characters.length} character${characters.length === 1 ? "" : "s"}`}
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
          return (
            <Card
              key={c.id}
              className="has-menu"
              onClick={() => onOpen(c.id)}
              title={`Open ${c.name}`}
            >
              <CardMenu
                label={`Actions for ${c.name}`}
                items={[
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
                  HP {c.hp.current}/{c.hp.max} · AC {c.ac.override ?? c.ac.value}
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
