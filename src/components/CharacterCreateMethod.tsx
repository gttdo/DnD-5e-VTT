import { Card, CardMedia, CardBody, CardTitle } from "./ui/Card";
import { Button } from "./ui/Button";
import { LibraryBanner } from "./ui/LibraryBanner";
import { useToast } from "../state/Toast";

/**
 * Character-creation method chooser (#110) — the fork the roster's "Create a
 * Character" now opens, mirroring D&D Beyond's four-up: build it yourself, a
 * fast guided path, claim a premade, or import a PDF sheet. All four are live.
 */

interface Props {
  onStandard: () => void;
  onPremade: () => void;
  onQuick: () => void;
  onImport: () => void;
  onCancel: () => void;
}

interface Method {
  key: string;
  image: string;
  title: string;
  blurb: string;
  cta: string;
  soon?: boolean;
  isNew?: boolean;
}

const METHODS: Method[] = [
  {
    key: "standard",
    image: "/art/paladin.png",
    title: "Standard",
    blurb: "Build step by step — full control over class, species, background, ability scores, and gear.",
    cta: "Start building",
  },
  {
    key: "quick",
    image: "/art/goliath_barbarian.png",
    title: "Quickbuilder",
    blurb: "A fast, guided path to a ready-to-play level-1 hero. Great for new players and quick NPCs.",
    cta: "Quick build",
    isNew: true,
  },
  {
    key: "premade",
    image: "/art/tavern.png",
    title: "Premade",
    blurb: "Browse ready-to-play characters shared to the library and copy one into your roster.",
    cta: "Browse premades",
  },
  {
    key: "import",
    image: "/art/book_wizard.png",
    title: "Import from PDF",
    blurb: "Upload a character sheet PDF and we'll read it into a playable character for you to review.",
    cta: "Import a sheet",
    isNew: true,
  },
];

export const CharacterCreateMethod = ({ onStandard, onPremade, onQuick, onImport, onCancel }: Props) => {
  const toast = useToast();

  const run = (key: string) => {
    if (key === "standard") onStandard();
    else if (key === "premade") onPremade();
    else if (key === "quick") onQuick();
    else if (key === "import") onImport();
    else toast.info("That method is coming soon — building it now.");
  };

  return (
    <div className="screen-enter" style={{ padding: 24 }}>
      <LibraryBanner
        image="/art/forest_mountain.png"
        eyebrow="New Character"
        title="Creation Method"
        subtitle="Choose how you'd like to create your character."
      >
        <Button variant="ghost" size="sm" icon="back" onClick={onCancel}>
          Back to roster
        </Button>
      </LibraryBanner>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        {METHODS.map((m) => (
          <Card key={m.key} onClick={() => run(m.key)} title={m.title}>
            <div style={{ position: "relative" }}>
              <CardMedia src={m.image} alt={m.title} aspect="16/9" />
              {m.isNew && <span className="card-badge">{m.soon ? "Soon" : "New"}</span>}
            </div>
            <CardBody>
              <CardTitle>{m.title}</CardTitle>
              <p className="dim" style={{ fontSize: 13, margin: "4px 0 12px", lineHeight: 1.45 }}>
                {m.blurb}
              </p>
              <Button variant={m.soon ? "ghost" : "primary"} size="sm" block style={{ marginTop: "auto" }}>
                {m.cta}
              </Button>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
};
