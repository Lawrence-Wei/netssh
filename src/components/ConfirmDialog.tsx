// In-app confirmation dialog that matches the rest of the netssh chrome
// (rounded glass card, seal-style accept button) instead of the native
// window.confirm() white box.
//
// Usage:
//   const confirm = useConfirm();
//   const ok = await confirm({ title, message, danger: true });
//   if (ok) { ... }

import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type Resolver = (value: boolean) => void;

interface ConfirmCtx {
  ask: (options: ConfirmOptions) => Promise<boolean>;
}

const Ctx = createContext<ConfirmCtx | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: Resolver }) | null>(null);

  const ask = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...options, resolve });
    });
  }, []);

  const close = (result: boolean) => {
    state?.resolve(result);
    setState(null);
  };

  return (
    <Ctx.Provider value={{ ask }}>
      {children}
      {state && (
        <div className="confirm-overlay" onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
          <div className="confirm-card" role="dialog" aria-modal="true">
            <div className="confirm-card__title">{state.title}</div>
            {state.message && <div className="confirm-card__message">{state.message}</div>}
            <div className="confirm-card__actions">
              <button className="btn ghost" onClick={() => close(false)} autoFocus>
                {state.cancelLabel || "Cancel"}
              </button>
              <button
                className={"btn" + (state.danger ? " danger" : "")}
                onClick={() => close(true)}
              >
                {state.confirmLabel || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Fallback when used outside the provider (tests, dev hot-reload).
    return async (options: ConfirmOptions) => window.confirm(options.title);
  }
  return (options: ConfirmOptions) => ctx.ask(options);
}
