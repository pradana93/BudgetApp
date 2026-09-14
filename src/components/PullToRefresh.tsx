import * as React from "react";
import { RefreshCw } from "lucide-react";

export function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<void> | void; children: React.ReactNode }) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const indicatorRef = React.useRef<HTMLDivElement>(null);
  const iconRef = React.useRef<HTMLDivElement>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const pullRef = React.useRef(0);
  const startY = React.useRef<number | null>(null);
  const threshold = 52;

  // block native Chrome pull-to-refresh globally while mounted
  React.useEffect(() => {
    const html = document.documentElement;
    const prevHtml = html.style.overscrollBehaviorY;
    const prevBody = document.body.style.overscrollBehaviorY;
    html.style.overscrollBehaviorY = "none";
    document.body.style.overscrollBehaviorY = "none";
    return () => {
      html.style.overscrollBehaviorY = prevHtml;
      document.body.style.overscrollBehaviorY = prevBody;
    };
  }, []);

  const setPullDOM = (p: number) => {
    pullRef.current = p;
    const ind = indicatorRef.current;
    const ic = iconRef.current;
    if (!ind) return;
    const h = refreshing ? 56 : p > 0 ? Math.min(56, p) : 0;
    ind.style.height = `${h}px`;
    if (ic && !refreshing) {
      const progress = Math.min(1, p / threshold);
      ic.style.transform = `rotate(${progress * 360}deg)`;
      const ready = progress >= 1;
      const parent = ic.parentElement as HTMLElement | null;
      if (parent) {
        if (ready) {
          parent.classList.add("bg-gradient-to-br", "from-violet-600", "to-blue-600", "text-white", "border-violet-500/40");
          parent.classList.remove("bg-white", "border-border");
          (ic.firstChild as HTMLElement)?.classList.add("text-white");
          (ic.firstChild as HTMLElement)?.classList.remove("text-muted-foreground");
        } else {
          parent.classList.remove("bg-gradient-to-br", "from-violet-600", "to-blue-600", "text-white", "border-violet-500/40");
          parent.classList.add("bg-white", "border-border");
          (ic.firstChild as HTMLElement)?.classList.remove("text-white");
          (ic.firstChild as HTMLElement)?.classList.add("text-muted-foreground");
        }
      }
    }
  };

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const isAtTop = () => {
      // window + element + documentElement all at top
      const winTop = window.scrollY <= 2 && document.documentElement.scrollTop <= 2 && document.body.scrollTop <= 2;
      return winTop && el.scrollTop <= 0;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (refreshing) return;
      if (!isAtTop()) return;
      startY.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startY.current === null || refreshing) return;
      const y = e.touches[0].clientY;
      const delta = y - startY.current;
      if (delta <= 0) { setPullDOM(0); return; }
      if (!isAtTop() && delta > 0) { setPullDOM(0); return; }
      // easy pull: 0.72 rubber, cap 92
      const p = Math.min(delta * 0.72, 92);
      setPullDOM(p);
      // prevent native Chrome refresh when pulling
      if (p > 8) {
        e.preventDefault();
      }
    };

    const onTouchEnd = async () => {
      if (startY.current === null) return;
      const p = pullRef.current;
      startY.current = null;
      if (p >= threshold && !refreshing) {
        setRefreshing(true);
        try { if (navigator.vibrate) navigator.vibrate(20); } catch { /* */ }
        // lock indicator at 56
        requestAnimationFrame(() => setPullDOM(56));
        try { await onRefresh(); } finally {
          setTimeout(() => {
            setRefreshing(false);
            setPullDOM(0);
          }, 400);
        }
      } else {
        setPullDOM(0);
      }
    };

    // must be non-passive to call preventDefault
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    // also listen on window for edge case where start was on body
    window.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [refreshing, onRefresh]);

  // keep DOM in sync when refreshing toggles
  React.useEffect(() => {
    if (refreshing) setPullDOM(56);
    else if (pullRef.current === 0) setPullDOM(0);
  }, [refreshing]);

  return (
    <div
      ref={wrapRef}
      className="relative"
      style={{ overscrollBehaviorY: "contain", touchAction: "pan-y" }}
    >
      <div
        ref={indicatorRef}
        className="pointer-events-none flex justify-center overflow-hidden will-change-[height]"
        style={{ height: 0, transition: refreshing ? "height 180ms ease" : pullRef.current > 0 ? "none" : "height 220ms ease" }}
        aria-hidden
      >
        <div
          className={`mt-2 flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md border will-change-transform ${refreshing ? "border-primary/30" : "border-border"}`}
        >
          <div ref={iconRef} className={`flex items-center justify-center ${refreshing ? "animate-spin" : ""}`}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "text-primary" : "text-muted-foreground"}`} />
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
