export const DEFAULT_DESKTOP_FAVORITE_KEYS = [
  "/calendar",
  "/quote",
  "/photo-sorting",
  "/video-studio",
  "/memo",
  "/clients",
] as const;

export const DESKTOP_FAVORITES_CACHE_KEY = "olivia-os-favorites-v1";

const FAVORITE_KEY_PATTERN = /^(?:\/[a-z0-9][a-z0-9/_-]*|app:[a-z0-9][a-z0-9_-]*)$/;
const MAX_FAVORITES = 64;

const LEGACY_FAVORITE_KEYS: Readonly<Record<string, string>> = {
  "/conti": "/photo-sorting",
  "/video-conti": "/video-studio",
  "/youtube-editing-conti": "/video-studio",
  "/broll-prompt": "/video-studio",
  "/prompter": "/video-studio",
  "/video-production": "/video-studio",
  "/portrait-consent": "/clients",
  "app:conti": "/photo-sorting",
  "app:video-production": "/video-studio",
  "app:portrait-consent": "/clients",
};

export function normalizeDesktopFavoriteKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_DESKTOP_FAVORITE_KEYS];

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (typeof candidate !== "string") continue;
    const legacyKey = candidate.trim().toLowerCase();
    const key = LEGACY_FAVORITE_KEYS[legacyKey] ?? legacyKey;
    if (!FAVORITE_KEY_PATTERN.test(key) || seen.has(key)) continue;
    seen.add(key);
    normalized.push(key);
    if (normalized.length === MAX_FAVORITES) break;
  }
  return normalized;
}
