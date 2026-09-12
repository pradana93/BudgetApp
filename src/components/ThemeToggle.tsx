import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

function getInitial(): boolean {
  if (typeof window === "undefined") return false;
  const saved = window.localStorage.getItem("budgetapp-theme");
  if (saved) return saved === "dark";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function ThemeToggle() {
  const [dark, setDark] = React.useState(getInitial);

  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    window.localStorage.setItem("budgetapp-theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <Button variant="ghost" size="sm" onClick={() => setDark((d) => !d)} aria-label="Toggle dark mode">
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
