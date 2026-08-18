import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Dialog } from "../components/ui/Dialog";

/**
 * Promise-based confirm / prompt — one in-app dialog that REPLACES the browser's
 * blocking window.confirm() and window.prompt() everywhere, so every yes/no and
 * name-this flow matches the app's theme.
 *
 *   const { confirm, prompt } = useConfirm();
 *   if (await confirm({ message: `Delete "${name}"?`, danger: true, confirmLabel: "Delete" })) …
 *   const name = await prompt({ title: "Rename map", initialValue: current });
 */

interface ConfirmOpts {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}
interface PromptOpts {
  title?: string;
  subtitle?: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  label?: string;
}
interface ConfirmAPI {
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
  prompt: (opts: PromptOpts) => Promise<string | null>;
}

const ConfirmContext = createContext<ConfirmAPI | null>(null);

type Active =
  | { kind: "confirm"; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: "prompt"; opts: PromptOpts; resolve: (v: string | null) => void };

export const ConfirmProvider = ({ children }: { children: ReactNode }) => {
  const [active, setActive] = useState<Active | null>(null);
  const [value, setValue] = useState("");

  const confirm = useCallback(
    (opts: ConfirmOpts) =>
      new Promise<boolean>((resolve) => setActive({ kind: "confirm", opts, resolve })),
    []
  );
  const prompt = useCallback(
    (opts: PromptOpts) =>
      new Promise<string | null>((resolve) => {
        setValue(opts.initialValue ?? "");
        setActive({ kind: "prompt", opts, resolve });
      }),
    []
  );

  const api = useRef<ConfirmAPI>({ confirm, prompt });
  api.current = { confirm, prompt };

  const settle = (result: boolean | string | null) => {
    if (!active) return;
    if (active.kind === "confirm") active.resolve(Boolean(result));
    else active.resolve(result as string | null);
    setActive(null);
  };

  return (
    <ConfirmContext.Provider value={api.current}>
      {children}

      {active?.kind === "confirm" && (
        <Dialog onClose={() => settle(false)} size="sm" title={active.opts.title ?? "Are you sure?"}>
          <div className="confirm">
            <p className="confirm-msg">{active.opts.message}</p>
            <div className="confirm-actions">
              <button className="ghost" onClick={() => settle(false)}>
                {active.opts.cancelLabel ?? "Cancel"}
              </button>
              <button
                className={active.opts.danger ? "confirm-danger" : "primary"}
                onClick={() => settle(true)}
                autoFocus
              >
                {active.opts.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {active?.kind === "prompt" && (
        <Dialog
          onClose={() => settle(null)}
          size="sm"
          title={active.opts.title ?? "Enter a name"}
          subtitle={active.opts.subtitle}
        >
          <form
            className="confirm"
            onSubmit={(e) => {
              e.preventDefault();
              const v = value.trim();
              if (v) settle(v);
            }}
          >
            <input
              className="confirm-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={active.opts.placeholder}
              aria-label={active.opts.label ?? "Value"}
              autoFocus
              onFocus={(e) => e.target.select()}
            />
            <div className="confirm-actions">
              <button type="button" className="ghost" onClick={() => settle(null)}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={!value.trim()}>
                {active.opts.confirmLabel ?? "OK"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </ConfirmContext.Provider>
  );
};

export const useConfirm = (): ConfirmAPI => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    // Fail soft — without a provider, fall back to the native dialogs so no flow
    // crashes on a missing wrap.
    return {
      confirm: (o) => Promise.resolve(window.confirm(o.message)),
      prompt: (o) => Promise.resolve(window.prompt(o.title ?? "", o.initialValue ?? "")),
    };
  }
  return ctx;
};
