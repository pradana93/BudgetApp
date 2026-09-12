import * as React from "react";
type Toast = { id: string; title: string; description?: string; variant?: "default" | "destructive" };
const ToastContext = React.createContext<{ toasts: Toast[]; toast: (t: Omit<Toast,"id">)=>void } | null>(null);
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const toast = React.useCallback((t: Omit<Toast,"id">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(s=>[...s, { ...t, id }]);
    setTimeout(()=> setToasts(s=>s.filter(x=>x.id!==id)), 3000);
  }, []);
  return <ToastContext.Provider value={{ toasts, toast }}>
    {children}
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map(t=> <div key={t.id} className={`rounded-md border px-4 py-3 shadow-lg bg-card text-card-foreground min-w-[300px] ${t.variant==="destructive"?"border-destructive bg-destructive text-destructive-foreground":""}`}><div className="font-medium text-sm">{t.title}</div>{t.description && <div className="text-sm opacity-90">{t.description}</div>}</div>)}
    </div>
  </ToastContext.Provider>;
}
export function useToast(){
  const ctx = React.useContext(ToastContext);
  if(!ctx) throw new Error("useToast must be inside ToastProvider");
  return ctx;
}
