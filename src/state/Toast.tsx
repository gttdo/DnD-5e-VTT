import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Icon, type IconName } from "../components/ui/Icon";

/**
 * Toast notifications — a bottom-right stack of auto-dismissing messages.
 * Replaces alert() and scattered inline error panels with one consistent,
 * non-blocking surface.
 *
 *   const toast = useToast();
 *   toast.error("Couldn't join that game");
 *   toast.success("Map saved to library");
 *   toast.info("Generating…");
 */

type ToastKind = "success" | "error" | "info";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  leaving?: boolean;
}

interface ToastAPI {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastAPI | null>(null);

const ICONS: Record<ToastKind, IconName> = {
  success: "check",
  error: "close",
  info: "sparkles",
};

const AUTODISMISS_MS: Record<ToastKind, number> = {
  success: 3000,
  info: 3500,
  error: 6000, // errors linger longer — the user needs time to read them
};

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  // Two-phase removal: mark leaving (plays the exit animation), then drop the
  // node after the animation duration.
  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 260); // ~ --dur
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, kind, message }]);
      window.setTimeout(() => remove(id), AUTODISMISS_MS[kind]);
    },
    [remove]
  );

  const api = useRef<ToastAPI>({
    success: (m) => push("success", m),
    error: (m) => push("error", m),
    info: (m) => push("info", m),
  });
  // Keep the closures fresh (push is stable via useCallback, so this is belt-and-suspenders).
  api.current = {
    success: (m) => push("success", m),
    error: (m) => push("error", m),
    info: (m) => push("info", m),
  };

  return (
    <ToastContext.Provider value={api.current}>
      {children}
      <div className="toast-stack" role="region" aria-label="Notifications" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind} ${t.leaving ? "is-leaving" : ""}`}>
            <span className="toast-icon">
              <Icon name={ICONS[t.kind]} size={14} />
            </span>
            <span className="toast-message">{t.message}</span>
            <button className="toast-close" onClick={() => remove(t.id)} aria-label="Dismiss">
              <Icon name="close" size={12} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastAPI => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fail soft: without a provider, fall back to console so a missing wrap
    // never crashes a flow.
    return {
      success: (m) => console.log("[toast:success]", m),
      error: (m) => console.error("[toast:error]", m),
      info: (m) => console.log("[toast:info]", m),
    };
  }
  return ctx;
};
