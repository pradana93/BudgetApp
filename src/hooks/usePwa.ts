import * as React from "react";
import { supabase } from "@/lib/supabase";

/** Public VAPID key — safe to ship in the client bundle. */
export const VAPID_PUBLIC_KEY = "BALAULeQJ4QqX0OAA9v0EDR_VIS9gSyLammQeN9Hii7e8enZ_lrn0RFYkwrQ3AO2mVB86vHi2uEvxzFEIsrxk6A";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

function b64encode(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const s = window.atob(raw);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function usePwa() {
  const [supported, setSupported] = React.useState(false);
  const [subscribed, setSubscribed] = React.useState(false);
  const [canInstall, setCanInstall] = React.useState(false);
  const [installed, setInstalled] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const installEvt = React.useRef<BeforeInstallPromptEvent | null>(null);

  React.useEffect(() => {
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(ok);
    try {
      setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    } catch {
      setInstalled(false);
    }
    const h = (e: Event) => {
      e.preventDefault();
      installEvt.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  React.useEffect(() => {
    if (!supported) return;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
      } catch {
        setSubscribed(false);
      }
    })();
  }, [supported]);

  const subscribe = async (): Promise<boolean> => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return false;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: user.id,
          endpoint: sub.endpoint,
          p256dh: b64encode(sub.getKey("p256dh")),
          auth: b64encode(sub.getKey("auth")),
        },
        { onConflict: "user_id,endpoint" }
      );
      if (error) throw error;
      setSubscribed(true);
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  };

  const unsubscribe = async (): Promise<boolean> => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      const endpoint = sub?.endpoint ?? null;
      if (sub) await sub.unsubscribe();
      const { data: { user } } = await supabase.auth.getUser();
      if (user && endpoint) {
        await supabase.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint);
      }
      setSubscribed(false);
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  };

  const install = async () => {
    const evt = installEvt.current;
    if (!evt) return;
    await evt.prompt();
    await evt.userChoice;
    installEvt.current = null;
    setCanInstall(false);
  };

  return { supported, subscribed, installed, canInstall, busy, subscribe, unsubscribe, install };
}
