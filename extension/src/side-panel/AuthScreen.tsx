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
    <div style={{ padding: 16, minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div className="panel">
        <h1 style={{ fontFamily: "var(--serif)", color: "var(--gold)", textAlign: "center", marginBottom: 4, fontSize: 20 }}>
          D&D 5e VTT
        </h1>
        <div className="dim" style={{ fontSize: 11, textAlign: "center", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 16 }}>
          DM Agent · Sign In
        </div>

        {!configured && (
          <div className="panel-warn" style={{ marginBottom: 12 }}>
            Supabase env vars missing. Check <code>.env.local</code>.
          </div>
        )}

        <div className="row" style={{ justifyContent: "center", gap: 2, marginBottom: 14 }}>
          {(["signin", "signup", "magic"] as const).map((m) => (
            <button
              key={m}
              className={`tab ${mode === m ? "active" : ""}`}
              type="button"
              onClick={() => { setMode(m); setError(null); setInfo(null); }}
              style={{ fontSize: 10, padding: "5px 8px" }}
            >
              {m === "signin" ? "Sign In" : m === "signup" ? "Sign Up" : "Magic"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {mode === "signup" && (
            <label className="col">
              <span className="label">Display Name</span>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </label>
          )}
          <label className="col">
            <span className="label">Email</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          {mode !== "magic" && (
            <label className="col">
              <span className="label">Password</span>
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

          {error && <div className="panel-warn">{error}</div>}
          {info && <div className="panel-info">{info}</div>}

          <button className="primary" disabled={pending || !configured} type="submit">
            {pending ? "…" : mode === "signin" ? "Sign In" : mode === "signup" ? "Create Account" : "Send Magic Link"}
          </button>
        </form>
      </div>
    </div>
  );
};
