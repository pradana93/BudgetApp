import * as React from "react";
import { cn } from "@/lib/utils";

export type SwipeAction = {
  label: string;
  kind?: "default" | "destructive";
  onClick: () => void;
};

/** Touch swipe-to-reveal row actions (mouse users get the same buttons on tap-hold? no — tap works normally). */
export function SwipeRow({ children, actions, className }: { children: React.ReactNode; actions: SwipeAction[]; className?: string }) {
  const [dx, setDx] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const startX = React.useRef<number | null>(null);
  const max = actions.length * 76;

  return (
    <div className={cn("relative overflow-hidden rounded-lg", className)}>
      <div className="absolute inset-y-0 right-0 flex">
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={a.onClick}
            className={`w-[76px] text-xs font-semibold text-white active:opacity-80 ${a.kind === "destructive" ? "bg-destructive" : "bg-primary"}`}
          >
            {a.label}
          </button>
        ))}
      </div>
      <div
        className="relative bg-card"
        style={{ transform: `translateX(${-dx}px)`, transition: dragging ? "none" : "transform 0.2s ease" }}
        onTouchStart={(e) => {
          startX.current = e.touches[0].clientX;
          setDragging(true);
        }}
        onTouchMove={(e) => {
          if (startX.current === null) return;
          const delta = startX.current - e.touches[0].clientX;
          setDx(Math.max(0, Math.min(max + 30, delta)));
        }}
        onTouchEnd={() => {
          setDragging(false);
          startX.current = null;
          setDx((v) => (v > 40 ? max : 0));
        }}
      >
        {children}
      </div>
    </div>
  );
}
