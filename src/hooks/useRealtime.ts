import * as React from "react";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";

export function useRealtime() {
  const qc = useQueryClient();
  React.useEffect(() => {
    const ch1 = supabase.channel("budgets-ch").on("postgres_changes", { event: "*", schema: "public", table: "budgets" }, () => {
      qc.invalidateQueries({ queryKey: ["budgets"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    }).subscribe();
    const ch2 = supabase.channel("requests-ch").on("postgres_changes", { event: "*", schema: "public", table: "reimbursement_requests" }, () => {
      qc.invalidateQueries({ queryKey: ["requests"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    }).subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, [qc]);
}
