import * as React from "react";

export type ToastAction = { label: string; onClick: () => void };
type Toast = { id: string; title: string; description?: string; variant?: "default" | "destructive"; action?: ToastAction; durationMs?: number };
const ToastContext = React.createContext<{ toasts: Toast[]; toast: (t: Omit<Toast,"id">)=>void; dismiss: (id: string)=>void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const dismiss = React.useCallback((id: string) => {
    setToasts((s) => s.filter((x) => x.id !== id));
  }, []);
  const toast = React.useCallback((t: Omit<Toast,"id">) => {
    const id = Math.random().toString(36).slice(2);
    const duration = t.durationMs ?? (t.action ? 7000 : 3500);
    setToasts((s)=>[...s.slice(-2), { ...t, id, durationMs: duration }]);
    setTimeout(()=> setToasts((s)=>s.filter((x)=>x.id!==id)), duration);
  }, []);
  return <ToastContext.Provider value={{ toasts, toast, dismiss }}>
    {children}
    <div className="fixed bottom-24 md:bottom-4 right-4 left-4 md:left-auto z-50 flex flex-col gap-2">
      {toasts.map((t)=> (
        <div key={t.id} className={`animate-pop relative overflow-hidden rounded-xl border px-4 py-3 shadow-xl bg-card text-card-foreground min-w-[300px] ${t.variant==="destructive"?"border-destructive bg-destructive text-destructive-foreground":""}`}>
          <div className="font-medium text-sm">{t.title}</div>
          {t.description && <div className="text-sm opacity-90">{t.description}</div>}
          {t.action && (
            <button
              onClick={() => { t.action!.onClick(); dismiss(t.id); }}
              className="mt-2 text-sm font-semibold text-primary underline underline-offset-2"
            >
              {t.action.label}
            </button>
          )}
          <div className="toast-bar absolute bottom-0 left-0 h-0.5 w-full bg-primary/60" style={{ animationDuration: `${t.durationMs}ms` }} />
        </div>
      ))}
    </div>
  </ToastContext.Provider>;
}
export function useToast(){
  const ctx = React.useContext(ToastContext);
  if(!ctx) throw new Error("useToast must be inside ToastProvider");
  return ctx;
}
