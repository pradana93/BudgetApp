export type ChangeEntry = { version: string; date: string; title: string; items: string[]; tag?: "feat" | "fix" | "flagship" };

export const CHANGELOGS: ChangeEntry[] = [
  {
    version: "0.5.0",
    date: "2026-09-14",
    title: "Flagship Batch — Risk, Pulse, Kanban, Studio, Focus",
    tag: "flagship",
    items: [
      "Approval Risk Card flagship: radial ring + gradient + confetti on approve",
      "Live Pulse Header: burn rate, runway days, sparkline, health dot",
      "Xero Inbox Kanban: Ready vs Review columns with score rings",
      "Receipt Studio 2.0: drag-drop studio + mock OCR auto-fill",
      "Focus Mode: Cmd+J drawer + Command Palette flagship promotion",
      "Ask BudgetApp copilot already flagship — now dockable anywhere",
    ],
  },
  {
    version: "0.4.0",
    date: "2026-09-14",
    title: "Ask BudgetApp Flagship Copilot",
    tag: "feat",
    items: [
      "14-intent on-device engine with suggestions, history, copy",
      "Flagship panel with gradient hero, threaded bubbles, localStorage",
      "Gemini context now includes ledger + savings goals",
    ],
  },
  {
    version: "0.3.0",
    date: "2026-09-14",
    title: "Build Split + Supabase Align",
    tag: "fix",
    items: [
      "Vite manualChunks: 1.2MB monolith → 322k main + split",
      "Supabase project_id aligned to frxzokdrpvdqcmbkjwcw",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-09-13",
    title: "Space + Ledger Flagship",
    items: ["Personal ledger, monthly budgets, note blocks, private notes"],
  },
  {
    version: "0.1.0",
    date: "2026-09-12",
    title: "Initial Scaffold",
    items: ["Budgets, requests, ledger, RLS, realtime, PWA, tour"],
  },
];
