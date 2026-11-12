import { describe, expect, it } from "vitest";
import { remoteNasSelectionFromPrefill } from "@/lib/photo-classifier/remotePhotoSource";

describe("remoteNasSelectionFromPrefill", () => {
  it("keeps the worker path and normalizes only the display path", () => {
    const selection = remoteNasSelectionFromPrefill("촬영/프로젝트");
    expect(selection).toMatchObject({
      path: "촬영/프로젝트",
      displayPath: "촬영/프로젝트",
    });
  });

  it("rejects paths outside the configured NAS root", () => {
    expect(remoteNasSelectionFromPrefill("../프로젝트")).toBeNull();
    expect(remoteNasSelectionFromPrefill("/Volumes/프로젝트")).toBeNull();
  });
});
