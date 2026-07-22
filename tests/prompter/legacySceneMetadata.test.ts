import { describe, expect, it } from "vitest";
import { decodeLegacySceneMetadata, encodeLegacySceneMetadata, normalizeSceneMetadata } from "@/lib/prompter/legacySceneMetadata";

describe("legacy prompter scene metadata", () => {
  it("round-trips shot and gesture data without changing speaker assignments", () => {
    const encoded = encodeLegacySceneMetadata(["speaker-a", "speaker-b"], true, ["손가락을 든다", ""]);
    expect(decodeLegacySceneMetadata(encoded)).toEqual({
      speakerMap: ["speaker-a", "speaker-b"],
      isShot: true,
      gestureMap: ["손가락을 든다", ""],
    });
  });

  it("prefers real columns after migration while retaining a legacy shot marker", () => {
    const encoded = encodeLegacySceneMetadata(["speaker-a"], true, ["구형 제스처"]);
    expect(normalizeSceneMetadata({ speaker_map: encoded, is_shot: false, gesture_map: ["새 제스처"] })).toEqual({
      speaker_map: ["speaker-a"],
      is_shot: true,
      gesture_map: ["새 제스처"],
    });
  });
});
