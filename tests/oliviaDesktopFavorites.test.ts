import { describe, expect, it } from "vitest";
import {
  DEFAULT_DESKTOP_FAVORITE_KEYS,
  normalizeDesktopFavoriteKeys,
} from "@/lib/olivia/desktopFavorites";

describe("Olivia Desktop favorites", () => {
  it("uses the six requested apps when no stored value exists", () => {
    expect(normalizeDesktopFavoriteKeys(undefined)).toEqual(DEFAULT_DESKTOP_FAVORITE_KEYS);
  });

  it("normalizes, de-duplicates, and rejects invalid favorite keys", () => {
    expect(normalizeDesktopFavoriteKeys([
      "/CALENDAR",
      "/calendar",
      "app:today",
      "https://example.com",
      42,
    ])).toEqual(["/calendar", "app:today"]);
  });

  it("allows an intentionally empty favorites list", () => {
    expect(normalizeDesktopFavoriteKeys([])).toEqual([]);
  });
});
