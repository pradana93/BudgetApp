import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import AskBudgetApp from "@/components/AskBudgetApp";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AskDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: budgets } = useQuery({
    queryKey: ["drawer-budgets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("budgets").select("*").order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });
  const { data: requests } = useQuery({
    queryKey: ["drawer-requests"],
    queryFn: async () => {
      const { data, error } = await supabase.from("reimbursement_requests").select("*").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const ctx = React.useMemo(() => ({
    budgets: (budgets ?? []).map((b: Record<string, unknown>) => ({
      name: String(b.name ?? ""),
      total_amount: b.total_amount as number | string,
      allocated_amount: b.allocated_amount as number | string,
      available_amount: b.available_amount as number | string,
      currency: String((b.currency as string) ?? "IDR"),
      period_end: b.period_end as string | null | undefined,
    })),
    requests: (requests ?? []).map((r: Record<string, unknown>) => ({
      amount: r.amount as number | string,
      category: String(r.category ?? ""),
      status: String(r.status ?? ""),
      merchant: (r.merchant as string | null) ?? null,
      created_at: String(r.created_at ?? ""),
    })),
  }), [budgets, requests]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[560px] h-full bg-background shadow-2xl flex flex-col animate-slide-in">
        <div className="flex items-center justify-between p-3 border-b">
          <span className="font-semibold">Ask BudgetApp — Focus Mode</span>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <AskBudgetApp ctx={ctx} />
        </div>
      </div>
    </div>
  );
}
