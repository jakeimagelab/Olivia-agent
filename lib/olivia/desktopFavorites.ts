export const DEFAULT_DESKTOP_FAVORITE_KEYS = [
  "/calendar",
  "/quote",
  "/conti",
  "/photo-sorting",
  "/memo",
  "/clients",
] as const;

export const DESKTOP_FAVORITES_CACHE_KEY = "olivia-os-favorites-v1";

const FAVORITE_KEY_PATTERN = /^(?:\/[a-z0-9][a-z0-9/_-]*|app:[a-z0-9][a-z0-9_-]*)$/;
const MAX_FAVORITES = 64;

export function normalizeDesktopFavoriteKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_DESKTOP_FAVORITE_KEYS];

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (typeof candidate !== "string") continue;
    const key = candidate.trim().toLowerCase();
    if (!FAVORITE_KEY_PATTERN.test(key) || seen.has(key)) continue;
    seen.add(key);
    normalized.push(key);
    if (normalized.length === MAX_FAVORITES) break;
  }
  return normalized;
}
