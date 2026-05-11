import { useState } from "react";
import { useAuth } from "../state/useAuth";

type Mode = "signin" | "signup" | "magic";

export const AuthScreen = () => {
  const { signInWithPassword, signUp, signInWithMagicLink, configured } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
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

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <div className="panel" style={{ width: "100%", maxWidth: 400 }}>
        <h1 style={{ color: "var(--gold)", textAlign: "center", marginBottom: 4 }}>
          D&D 5e VTT
        </h1>
        <div className="dim center" style={{ fontSize: 12, marginBottom: 24 }}>
          Roll for initiative.
        </div>

        {!configured && (
          <div
            className="panel"
            style={{ borderColor: "var(--accent)", marginBottom: 16, fontSize: 13 }}
          >
            Supabase env vars are missing. Set <code>VITE_SUPABASE_URL</code> and{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env.local</code> and restart Vite.
          </div>
        )}

        <div className="row" style={{ justifyContent: "center", gap: 4, marginBottom: 16 }}>
          {(["signin", "signup", "magic"] as const).map((m) => (
            <button
              key={m}
              className={`tab ${mode === m ? "active" : ""}`}
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

        <form className="col" style={{ gap: 12 }} onSubmit={submit}>
          {mode === "signup" && (
            <label className="col" style={{ gap: 4 }}>
              <span className="dim" style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase" }}>
                Display Name
              </span>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </label>
          )}
          <label className="col" style={{ gap: 4 }}>
            <span className="dim" style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase" }}>
              Email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          {mode !== "magic" && (
            <label className="col" style={{ gap: 4 }}>
              <span className="dim" style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase" }}>
                Password
              </span>
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
            <div className="panel" style={{ borderColor: "var(--accent)", fontSize: 12 }}>
              {error}
            </div>
          )}
          {info && (
            <div className="panel" style={{ borderColor: "var(--gold)", fontSize: 12 }}>
              {info}
            </div>
          )}

          <button className="primary" disabled={pending || !configured} type="submit">
            {pending
              ? "…"
              : mode === "signin"
                ? "Sign In"
                : mode === "signup"
                  ? "Create Account"
                  : "Send Magic Link"}
          </button>
        </form>
      </div>
    </div>
  );
};
