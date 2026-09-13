export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; email: string; display_name: string | null; role: "owner" | "member"; created_at: string; updated_at: string };
        Insert: { id: string; email: string; display_name?: string | null; role: "owner" | "member"; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      budgets: {
        Row: { id: string; owner_id: string; name: string; total_amount: number; allocated_amount: number; available_amount: number; currency: string; period_start: string | null; period_end: string | null; status: "active" | "closed"; created_at: string; updated_at: string };
        Insert: { id?: string; owner_id: string; name: string; total_amount: number; allocated_amount?: number; currency?: string; period_start?: string | null; period_end?: string | null; status?: "active" | "closed" };
        Update: Partial<Database["public"]["Tables"]["budgets"]["Insert"]>;
      };
      reimbursement_requests: {
        Row: { id: string; budget_id: string; requester_id: string; amount: number; category: string; merchant: string | null; description: string | null; receipt_url: string | null; due_date: string | null; status: "pending" | "approved" | "rejected" | "reconciled"; reviewed_by: string | null; reviewed_at: string | null; rejection_reason: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; budget_id: string; requester_id: string; amount: number; category: string; merchant?: string | null; description?: string | null; receipt_url?: string | null; due_date?: string | null; status?: Database["public"]["Tables"]["reimbursement_requests"]["Row"]["status"] };
        Update: Partial<Database["public"]["Tables"]["reimbursement_requests"]["Insert"]> & { reviewed_by?: string | null; reviewed_at?: string | null; rejection_reason?: string | null };
      };
      reconciliations: {
        Row: { id: string; request_id: string; reconciled_by: string; reconciled_at: string; note: string | null; ledger_entry_id: string };
        Insert: { id?: string; request_id: string; reconciled_by: string; note?: string | null; ledger_entry_id: string };
        Update: Partial<Database["public"]["Tables"]["reconciliations"]["Insert"]>;
      };
      ledger_entries: {
        Row: { id: string; budget_id: string; debit: number; credit: number; reference_id: string | null; reference_type: "budget_allocation" | "reimbursement" | "adjustment"; description: string | null; created_at: string };
        Insert: { id?: string; budget_id: string; debit?: number; credit?: number; reference_id?: string | null; reference_type: Database["public"]["Tables"]["ledger_entries"]["Row"]["reference_type"]; description?: string | null };
        Update: never;
      };
      notifications: {
        Row: { id: string; user_id: string; type: "new_request" | "request_approved" | "request_rejected" | "request_reconciled" | "category_decision"; title: string; body: string | null; link: string | null; is_read: boolean; created_at: string };
        Insert: { id?: string; user_id: string; type: Database["public"]["Tables"]["notifications"]["Row"]["type"]; title: string; body?: string | null; link?: string | null; is_read?: boolean };
        Update: { is_read?: boolean };
      };
      category_proposals: {
        Row: { id: string; requester_id: string; name: string; merchant: string | null; status: "pending" | "approved" | "rejected"; reviewed_by: string | null; reviewed_at: string | null; created_at: string };
        Insert: { id?: string; requester_id: string; name: string; merchant?: string | null; status?: Database["public"]["Tables"]["category_proposals"]["Row"]["status"] };
        Update: { status?: Database["public"]["Tables"]["category_proposals"]["Row"]["status"]; reviewed_by?: string | null; reviewed_at?: string | null };
      };
      categories: {
        Row: { name: string; created_at: string };
        Insert: { name: string };
        Update: never;
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      approve_request: { Args: { p_request_id: string }; Returns: Database["public"]["Tables"]["reimbursement_requests"]["Row"] };
      reject_request: { Args: { p_request_id: string; p_reason: string }; Returns: Database["public"]["Tables"]["reimbursement_requests"]["Row"] };
      reconcile_request: { Args: { p_request_id: string; p_note: string }; Returns: Database["public"]["Tables"]["reconciliations"]["Row"] };
      unapprove_request: { Args: { p_request_id: string }; Returns: Database["public"]["Tables"]["reimbursement_requests"]["Row"] };
      unreconcile_request: { Args: { p_request_id: string; p_note?: string }; Returns: Database["public"]["Tables"]["reimbursement_requests"]["Row"] };
      topup_budget: { Args: { p_budget_id: string; p_amount: number; p_description: string }; Returns: Database["public"]["Tables"]["ledger_entries"]["Row"] };
      get_reconciliation_statement: { Args: { p_budget_id: string }; Returns: Database["public"]["Tables"]["ledger_entries"]["Row"][] };
      is_owner: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: never;
    CompositeTypes: never;
  };
};
