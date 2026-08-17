import { useState } from "react";
import { useAuth } from "../state/useAuth";
import { Button } from "./ui/Button";
import { Icon } from "./ui/Icon";

type Mode = "signin" | "signup" | "magic";

interface AuthProps {
  /** Initial tab; from the landing "Sign in" vs "Get started" CTAs. */
  initialMode?: Mode;
  /** Optional "back to home" affordance shown when reached from the landing. */
  onBack?: () => void;
}

/**
 * Split-composition auth screen — cinematic art panel on the left, sign-in
 * form on the right (the D&D Beyond sign-up pattern). The art panel is an
 * atmospheric SVG stand-in; a generated cinematic hero image (via the
 * cartographer pipeline, committed to public/art/) can replace it later —
 * drop it in as a background-image on .auth-art.
 */
export const AuthScreen = ({ initialMode = "signin", onBack }: AuthProps = {}) => {
  const { signInWithPassword, signUp, signInWithMagicLink, configured } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setPending(true);
    try {
      if (mode === "signin") {
        const { error } = await signInWithPassword(email, password);
        if (error) setError(error);
      } else if (mode === "signup") {
        const { error } = await signUp(email, password, displayName || undefined);
        if (error) setError(error);
        else setInfo("Check your inbox to confirm your email, then sign in.");
      } else {
        const { error } = await signInWithMagicLink(email);
        if (error) setError(error);
        else setInfo("Check your inbox for a magic sign-in link.");
      }
    } finally {
      setPending(false);
    }
  };

  const cta =
    mode === "signin" ? "Sign In" : mode === "signup" ? "Create Account" : "Send Magic Link";

  return (
    <div className="auth-screen">
      {/* Full-bleed cinematic background */}
      <div className="auth-bg" aria-hidden="true" />
      <div className="auth-bg-scrim" aria-hidden="true" />

      {/* Atmospheric quote over the dark left negative space */}
      <div className="auth-quote" aria-hidden="true">
        <p className="quote">
          &ldquo;The door groans open. Somewhere below, something ancient
          stirs in the dark.&rdquo;
        </p>
        <div className="attribution">Your table awaits</div>
      </div>

      {/* Floating sign-in card */}
      <main className="auth-card">
        <div>
          {onBack && (
            <button
              className="ghost"
              onClick={onBack}
              style={{
                fontSize: 12,
                padding: "4px 8px",
                marginBottom: 12,
                marginLeft: -8,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Icon name="back" size={14} />
              Home
            </button>
          )}
          <div className="hero-eyebrow">A Tabletop for 5e</div>
          <h1 className="hero-heading" style={{ marginTop: 8 }}>
            D&amp;D 5e VTT
          </h1>
          <p className="hero-lede" style={{ marginTop: 10, fontSize: 16 }}>
            Roll for initiative.
          </p>

          {!configured && (
            <div
              className="panel"
              style={{ borderColor: "var(--ember)", marginTop: 20, fontSize: 13 }}
            >
              Supabase env vars are missing. Set <code>VITE_SUPABASE_URL</code> and{" "}
              <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env.local</code> and restart Vite.
            </div>
          )}

          <div className="auth-tabs">
            {(["signin", "signup", "magic"] as const).map((m) => (
              <button
                key={m}
                className={`auth-tab ${mode === m ? "active" : ""}`}
                onClick={() => {
                  setMode(m);
                  setError(null);
                  setInfo(null);
                }}
              >
                {m === "signin" ? "Sign In" : m === "signup" ? "Sign Up" : "Magic Link"}
              </button>
            ))}
          </div>

          <form onSubmit={submit}>
            {mode === "signup" && (
              <label className="auth-field">
                <span className="auth-field-label">Display Name</span>
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </label>
            )}
            <label className="auth-field">
              <span className="auth-field-label">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>
            {mode !== "magic" && (
              <label className="auth-field">
                <span className="auth-field-label">Password</span>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                />
              </label>
            )}

            {error && (
              <div className="panel" style={{ borderColor: "var(--ember)", fontSize: 12, marginBottom: 14 }}>
                {error}
              </div>
            )}
            {info && (
              <div className="panel" style={{ borderColor: "var(--candle)", fontSize: 12, marginBottom: 14 }}>
                {info}
              </div>
            )}

            <Button variant="primary" size="lg" block type="submit" disabled={pending || !configured}>
              {pending ? "…" : cta}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
};
