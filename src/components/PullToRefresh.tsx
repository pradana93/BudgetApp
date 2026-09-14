import * as React from "react";
import { RefreshCw } from "lucide-react";

export function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<void> | void; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [pull, setPull] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const startY = React.useRef<number | null>(null);
  const canPull = React.useRef(false);

  const threshold = 64;

  const onTouchStart = (e: React.TouchEvent) => {
    if (refreshing) return;
    const el = ref.current;
    if (!el) return;
    // only when at top and touch near top (first 120px)
    if (el.scrollTop > 0) return;
    const y = e.touches[0].clientY;
    // ignore if not at very top of page scroll? check window scroll too?
    const atTop = window.scrollY === 0;
    if (el.scrollTop === 0 && atTop) {
      startY.current = y;
      canPull.current = true;
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null || !canPull.current || refreshing) return;
    const y = e.touches[0].clientY;
    const delta = y - startY.current;
    if (delta <= 0) { setPull(0); return; }
    const el = ref.current;
    if (!el || el.scrollTop > 0) { setPull(0); return; }
    // rubber band
    const p = Math.min(delta * 0.55, 120);
    setPull(p);
    if (p > 10) e.preventDefault();
  };

  const onTouchEnd = async () => {
    if (startY.current === null) return;
    const p = pull;
    startY.current = null;
    canPull.current = false;
    if (p >= threshold && !refreshing) {
      setRefreshing(true);
      try { if (navigator.vibrate) navigator.vibrate(20); } catch { /* */ }
      try { await onRefresh(); } finally {
        setTimeout(() => { setRefreshing(false); setPull(0); }, 450);
      }
    } else {
      setPull(0);
    }
  };

  // reset on scroll if needed
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => { if (el.scrollTop > 0 && pull > 0) setPull(0); };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [pull]);

  const progress = Math.min(1, pull / threshold);
  const show = pull > 2 || refreshing;
  const spinnerRotate = refreshing ? "animate-spin" : "";

  return (
    <div
      ref={ref}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className="relative"
      style={{ overscrollBehaviorY: "contain" }}
    >
      <div
        className="pointer-events-none flex justify-center overflow-hidden transition-[height] duration-200"
        style={{ height: refreshing ? 56 : pull > 0 ? Math.min(56, pull) : 0 }}
        aria-hidden={!show}
      >
        <div className={`mt-2 flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md border ${refreshing ? "border-primary/30" : progress >= 1 ? "border-violet-500/40 bg-gradient-to-br from-violet-600 to-blue-600 text-white" : "border-border"} transition-colors`}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? spinnerRotate : ""} ${progress >= 1 && !refreshing ? "text-white" : refreshing ? "text-primary" : "text-muted-foreground"}`} style={!refreshing ? { transform: `rotate(${progress * 360}deg)` } : undefined} />
        </div>
      </div>
      {children}
    </div>
  );
}
