import * as React from "react";

export type AvatarTheme = {
  id: string;
  cls: string;
};

export const AVATAR_THEMES: AvatarTheme[] = [
  { id: "ocean", cls: "from-blue-500 to-violet-600" },
  { id: "forest", cls: "from-emerald-500 to-teal-600" },
  { id: "sunset", cls: "from-amber-500 to-rose-500" },
  { id: "grape", cls: "from-fuchsia-500 to-purple-700" },
  { id: "slate", cls: "from-slate-500 to-slate-800" },
];

const keyFor = (userId: string) => `budgetapp-avatar-${userId}`;

export function getAvatarCls(userId: string | null | undefined): string {
  if (!userId || typeof window === "undefined") return AVATAR_THEMES[0].cls;
  try {
    const saved = window.localStorage.getItem(keyFor(userId));
    if (saved && AVATAR_THEMES.some((t) => t.id === saved)) {
      return AVATAR_THEMES.find((t) => t.id === saved)!.cls;
    }
  } catch {
    /* storage unavailable */
  }
  return AVATAR_THEMES[0].cls;
}

export function setAvatarTheme(userId: string, themeId: string): void {
  try {
    window.localStorage.setItem(keyFor(userId), themeId);
    window.dispatchEvent(new CustomEvent("budgetapp-avatar", { detail: { userId, themeId } }));
  } catch {
    /* storage unavailable */
  }
}

/** Reactive avatar gradient for the signed-in user (updates live across the app). */
export function useAvatarTheme(userId: string | null | undefined): string {
  const [themeId, setThemeId] = React.useState<string>(() => {
    if (!userId || typeof window === "undefined") return AVATAR_THEMES[0].id;
    try {
      return window.localStorage.getItem(keyFor(userId)) ?? AVATAR_THEMES[0].id;
    } catch {
      return AVATAR_THEMES[0].id;
    }
  });

  React.useEffect(() => {
    setThemeId(
      (() => {
        if (!userId) return AVATAR_THEMES[0].id;
        try {
          return window.localStorage.getItem(keyFor(userId)) ?? AVATAR_THEMES[0].id;
        } catch {
          return AVATAR_THEMES[0].id;
        }
      })()
    );
    const h = (e: Event) => {
      const detail = (e as CustomEvent).detail as { userId: string; themeId: string } | undefined;
      if (detail && detail.userId === userId) setThemeId(detail.themeId);
    };
    window.addEventListener("budgetapp-avatar", h);
    return () => window.removeEventListener("budgetapp-avatar", h);
  }, [userId]);

  return AVATAR_THEMES.find((t) => t.id === themeId)?.cls ?? AVATAR_THEMES[0].cls;
}

export function initialsOf(name: string): string {
  return (
    name
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => (w[0] ?? "").toUpperCase())
      .join("") || "?"
  );
}

const AVATAR_EDGE = 256;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** True when the file is an allowed avatar image. */
export function isAcceptedAvatar(file: File): boolean {
  return ACCEPTED_TYPES.includes(file.type);
}

/**
 * Center-crop to square and resize to 256px JPEG via canvas.
 * Falls back to the original file if canvas decoding fails.
 */
export async function prepareAvatar(file: File): Promise<Blob> {
  if (typeof document === "undefined") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const size = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - size) / 2;
    const sy = (bitmap.height - size) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_EDGE;
    canvas.height = AVATAR_EDGE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, AVATAR_EDGE, AVATAR_EDGE);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

export function avatarPublicUrl(userId: string): string {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
  return `${url}/storage/v1/object/public/avatars/${userId}/avatar.jpg`;
}
