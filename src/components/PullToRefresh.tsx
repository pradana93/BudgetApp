import * as React from "react";
import { RefreshCw } from "lucide-react";

export function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<void> | void; children: React.ReactNode }) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const indicatorRef = React.useRef<HTMLDivElement>(null);
  const iconWrapRef = React.useRef<HTMLDivElement>(null);
  const iconRef = React.useRef<HTMLDivElement>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const pullRef = React.useRef(0);
  const startY = React.useRef<number | null>(null);
  const threshold = 52;

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

  const setPullDOM = React.useCallback((p: number) => {
    pullRef.current = p;
    const ind = indicatorRef.current;
    const ic = iconRef.current;
    const wrap = iconWrapRef.current;
    if (!ind) return;
    const y = refreshing ? 0 : p > 0 ? Math.min(p - 56, 0) : -56;
    ind.style.transform = `translateY(${y}px)`;
    ind.style.opacity = p > 4 || refreshing ? "1" : "0";
    if (ic && !refreshing) {
      const progress = Math.min(1, p / threshold);
      ic.style.transform = `rotate(${progress * 360}deg)`;
      const ready = progress >= 1;
      if (wrap) {
        if (ready) {
          wrap.classList.add("bg-gradient-to-br", "from-violet-600", "to-blue-600", "text-white", "border-violet-500/40", "shadow-lg");
          wrap.classList.remove("bg-white", "border-border", "shadow-md");
          (ic.firstChild as HTMLElement)?.classList.add("text-white");
          (ic.firstChild as HTMLElement)?.classList.remove("text-muted-foreground");
        } else {
          wrap.classList.remove("bg-gradient-to-br", "from-violet-600", "to-blue-600", "text-white", "border-violet-500/40", "shadow-lg");
          wrap.classList.add("bg-white", "border-border", "shadow-md");
          (ic.firstChild as HTMLElement)?.classList.remove("text-white");
          (ic.firstChild as HTMLElement)?.classList.add("text-muted-foreground");
        }
      }
    }
  }, [refreshing]);

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const isAtTop = () => window.scrollY <= 2 && document.documentElement.scrollTop <= 2 && document.body.scrollTop <= 2 && el.scrollTop <= 0;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshing) return;
      if (!isAtTop()) return;
      startY.current = e.touches[0].clientY;
      const ind = indicatorRef.current;
      if (ind) ind.style.transition = "none";
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startY.current === null || refreshing) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0) { requestAnimationFrame(() => setPullDOM(0)); return; }
      if (!isAtTop() && delta > 0) { requestAnimationFrame(() => setPullDOM(0)); return; }
      const p = Math.min(delta * 0.72, 92);
      requestAnimationFrame(() => setPullDOM(p));
      if (p > 8) e.preventDefault();
    };

    const onTouchEnd = async () => {
      if (startY.current === null) return;
      const p = pullRef.current;
      startY.current = null;
      const ind = indicatorRef.current;
      if (ind) ind.style.transition = "transform 420ms cubic-bezier(0.22,1,0.36,1), opacity 260ms ease";
      if (p >= threshold && !refreshing) {
        setRefreshing(true);
        try { if (navigator.vibrate) navigator.vibrate(20); } catch { /* */ }
        requestAnimationFrame(() => setPullDOM(56));
        try { await onRefresh(); } finally {
          setTimeout(() => {
            setRefreshing(false);
            requestAnimationFrame(() => setPullDOM(0));
          }, 550);
        }
      } else {
        requestAnimationFrame(() => setPullDOM(0));
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [refreshing, onRefresh, setPullDOM]);

  React.useEffect(() => {
    const ind = indicatorRef.current;
    if (!ind) return;
    ind.style.transition = "transform 420ms cubic-bezier(0.22,1,0.36,1), opacity 260ms ease";
    if (refreshing) setPullDOM(56);
    else if (pullRef.current === 0) setPullDOM(0);
  }, [refreshing, setPullDOM]);

  return (
    <div ref={wrapRef} className="relative" style={{ overscrollBehaviorY: "contain", touchAction: "pan-y" }}>
      <div
        ref={indicatorRef}
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center will-change-transform"
        style={{ height: 56, transform: "translateY(-56px)", opacity: 0 }}
        aria-hidden
      >
        <div
          ref={iconWrapRef}
          className="mt-2 flex h-9 w-9 items-center justify-center rounded-full bg-white border shadow-md will-change-transform"
        >
          <div ref={iconRef} className={`flex items-center justify-center will-change-transform ${refreshing ? "animate-spin" : ""}`}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "text-primary" : "text-muted-foreground"}`} />
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
