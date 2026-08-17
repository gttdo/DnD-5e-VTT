import { Button } from "./ui/Button";
import { Icon, type IconName } from "./ui/Icon";
import { OrnamentalFrame } from "./ui/OrnamentalFrame";
import { TornEdge } from "./ui/TornEdge";
import { BrandMark } from "./ui/BrandMark";

/**
 * Marketing landing — the unauthenticated homepage. Explains what the app is,
 * shows off the AI-native features, and drives sign-up. The auth screen opens
 * from every CTA (onEnter).
 */

interface Props {
  /** Unauth: opens the auth screen at the given tab. Authed: enters the app. */
  onEnter: (mode: "signin" | "signup") => void;
  /** When true, the viewer is already signed in (reached via the home brand). */
  signedIn?: boolean;
  /** When true, the landing renders inside the app shell — hide its own nav
   *  bar (the shell provides the real nav) and the hero's "enter" CTA. */
  embedded?: boolean;
  /** Signed-in only: jump straight to a section (build a character, run a game). */
  onNavigate?: (section: "characters" | "maps" | "tokens" | "campaigns") => void;
}

interface Feature {
  icon: IconName;
  title: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    icon: "palette",
    title: "The Cartographer",
    body: "Describe a scene in a sentence and watch a D&D-quality battle map appear — forests, dungeons, taverns, ruins — ready to drop on the table.",
  },
  {
    icon: "drama",
    title: "The Token Forge",
    body: "Conjure any creature from a prompt. Every token remembers its 5e size, so a goblin sits in one cell and a gargantuan dragon fills sixteen.",
  },
  {
    icon: "users",
    title: "A Shared Table",
    body: "One canvas, every player in sync. Drag a token, roll the dice, light a torch — the whole party sees it the instant it happens.",
  },
  {
    icon: "sparkles",
    title: "An AI-Native DM",
    body: "The AI narrates, generates maps and monsters on the fly, and plays alongside you — a co-pilot for the person behind the screen.",
  },
];

interface Step {
  n: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    n: "I",
    title: "Bring a hero",
    body: "Build a character in the guided creator, or bring one you already play.",
  },
  {
    n: "II",
    title: "Prep your library",
    body: "Generate the maps and tokens your session needs and keep them a click away.",
  },
  {
    n: "III",
    title: "Gather the party",
    body: "Share an invite code, open the table, and play — together, in real time.",
  },
];

export const Landing = ({ onEnter, signedIn = false, embedded = false, onNavigate }: Props) => {
  // Signed-in visitors already have an account — point them at something to DO
  // (build a hero, run a game) rather than a generic "enter the app".
  const primaryLabel = signedIn ? "Build a character" : "Start playing free";
  const onPrimary = () => (signedIn ? onNavigate?.("characters") : onEnter("signup"));
  return (
    <div className="landing">
      {/* Top nav — hidden when embedded (the app shell provides the real nav) */}
      {!embedded && (
        <header className="landing-nav">
          <button className="app-brand" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <BrandMark size={30} />
            <span className="app-brand-text">The Table</span>
          </button>
          <div style={{ display: "flex", gap: 10 }}>
            {signedIn ? (
              <Button variant="primary" iconAfter="forward" onClick={() => onEnter("signup")}>
                Enter the app
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => onEnter("signin")}>
                  Sign in
                </Button>
                <Button variant="primary" onClick={() => onEnter("signup")}>
                  Get started
                </Button>
              </>
            )}
          </div>
        </header>
      )}

      {/* Hero */}
      <section className="landing-hero">
        <div className="landing-hero-bg" aria-hidden="true" />
        <div className="landing-hero-scrim" aria-hidden="true" />
        <div className="landing-hero-copy">
          <div className="hero-eyebrow">An AI-Native Tabletop for D&amp;D 5e</div>
          <h1 className="hero-heading xl" style={{ marginTop: 14 }}>
            Run your table.<br />Faster.
          </h1>
          <p className="hero-lede" style={{ marginTop: 20, fontSize: 20 }}>
            Generate maps and monsters from a sentence. Invite your party to a
            shared canvas that stays in sync — every drag, every roll, every
            torch lit.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 32, flexWrap: "wrap" }}>
            <Button variant="primary" size="lg" onClick={onPrimary}>
              {primaryLabel}
            </Button>
            {signedIn ? (
              <Button
                variant="secondary"
                size="lg"
                iconAfter="forward"
                onClick={() => onNavigate?.("campaigns")}
              >
                Create or join a game
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="lg"
                iconAfter="down"
                onClick={() => {
                  document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                See how it works
              </Button>
            )}
          </div>
        </div>
        <TornEdge position="bottom" />
      </section>

      {/* What is this */}
      <section className="landing-section landing-intro">
        <div className="hero-eyebrow" style={{ justifyContent: "center", display: "inline-flex" }}>
          What is this
        </div>
        <h2 className="landing-section-title">A dungeon master&rsquo;s workshop, with the busywork removed.</h2>
        <p className="landing-intro-lede">
          Whether you&rsquo;ve run a hundred sessions or you&rsquo;re opening the
          Player&rsquo;s Handbook for the first time, the prep is the part that
          slows you down. This is a virtual tabletop where the maps, the tokens,
          and a helping hand from the AI are all a sentence away — so you spend
          your time at the table, not building it.
        </p>
      </section>

      {/* Gallery — proof of the generator */}
      <section className="landing-section landing-steps-section">
        <h2 className="landing-section-title" style={{ textAlign: "center" }}>
          Conjure legends
        </h2>
        <p className="landing-intro-lede" style={{ textAlign: "center" }}>
          Every one of these was painted from a single sentence. Yours will be too.
        </p>
        <div className="landing-gallery">
          <figure className="landing-gallery-item">
            <img src="/art/ice_dragon.png" alt="An ancient ice dragon over a frozen fortress" loading="lazy" />
            <figcaption>Ancient White Dragon</figcaption>
          </figure>
          <figure className="landing-gallery-item">
            <img src="/art/fire_giant.png" alt="A fire giant enthroned above a molten citadel" loading="lazy" />
            <figcaption>Fire Giant King</figcaption>
          </figure>
          <figure className="landing-gallery-item">
            <img src="/art/lich_king.png" alt="A lich king raising dark magic over a necropolis" loading="lazy" />
            <figcaption>The Lich King</figcaption>
          </figure>
        </div>
      </section>

      {/* Features */}
      <section className="landing-section" id="features">
        <div className="landing-features">
          {FEATURES.map((f) => (
            <div className="landing-feature" key={f.title}>
              <span className="landing-feature-icon">
                <Icon name={f.icon} size={26} strokeWidth={1.5} />
              </span>
              <h3 className="landing-feature-title">{f.title}</h3>
              <p className="landing-feature-body">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Cinematic band — torn into the page top and bottom */}
      <section
        className="landing-band center"
        style={{ backgroundImage: "url(/art/forest_mountain.png)", backgroundPosition: "center 40%" }}
      >
        <TornEdge position="top" />
        <div
          className="landing-band-scrim"
          style={{
            background:
              "linear-gradient(to bottom, rgba(10,7,4,0.7), rgba(10,7,4,0.82)), radial-gradient(ellipse at center, rgba(10,7,4,0.35) 20%, rgba(10,7,4,0.72) 100%)",
          }}
        />
        <div className="landing-band-content">
          <div className="hero-eyebrow" style={{ justifyContent: "center", display: "inline-flex" }}>
            Face the legends
          </div>
          <h2 className="landing-section-title" style={{ marginTop: 12, color: "var(--cream)" }}>
            From goblin ambush to the lich&rsquo;s throne.
          </h2>
          <p className="landing-intro-lede" style={{ color: "var(--text-dim)" }}>
            Whatever your story needs, the map and the monster are a sentence
            away — so the tale keeps moving and the table stays in the moment.
          </p>
        </div>
        <TornEdge position="bottom" />
      </section>

      {/* How it works */}
      <section className="landing-section landing-steps-section">
        <h2 className="landing-section-title" style={{ textAlign: "center" }}>
          Three steps to the table
        </h2>
        <div className="landing-steps">
          {STEPS.map((s) => (
            <div className="landing-step" key={s.n}>
              <div className="landing-step-n">{s.n}</div>
              <h3 className="landing-feature-title">{s.title}</h3>
              <p className="landing-feature-body">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="landing-section">
        <OrnamentalFrame className="landing-cta">
          <h2 className="landing-section-title" style={{ marginBottom: 8 }}>
            Your table awaits.
          </h2>
          <p className="landing-intro-lede" style={{ marginBottom: 24 }}>
            {signedIn ? "Bring a hero to the table, or gather the party." : "Create a free account and roll for initiative."}
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Button variant="primary" size="lg" onClick={onPrimary}>
              {primaryLabel}
            </Button>
            {signedIn && (
              <Button variant="secondary" size="lg" iconAfter="forward" onClick={() => onNavigate?.("campaigns")}>
                Create or join a game
              </Button>
            )}
          </div>
        </OrnamentalFrame>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="app-brand" style={{ cursor: "default" }}>
          <BrandMark size={26} />
          <span className="app-brand-text">The Table</span>
        </div>
        <div className="landing-footer-links">
          <a href="https://github.com/gttdo/DnD-5e-VTT" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          <span className="dim">·</span>
          <span className="dim">An AI-native tabletop for D&amp;D 5e</span>
        </div>
      </footer>
    </div>
  );
};
