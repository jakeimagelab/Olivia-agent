import { describe, expect, it } from "vitest";
import { removeUnsupportedContiSceneColumn } from "@/lib/conti/schemaCompatibility";

describe("conti scene schema compatibility", () => {
  it("removes the media field reported missing by PostgREST", () => {
    const row = { name: "추가 장면", media: "photo", repeat_scope: "once" };
    expect(removeUnsupportedContiSceneColumn(row, {
      code: "PGRST204",
      message: "Could not find the 'media' column of 'conti_scenes' in the schema cache",
    })).toEqual({ name: "추가 장면", repeat_scope: "once" });
  });

  it("keeps the insert unchanged for unrelated errors", () => {
    expect(removeUnsupportedContiSceneColumn({ name: "추가 장면", media: "photo" }, {
      code: "42501",
      message: "permission denied",
    })).toBeNull();
  });

  it("never removes required scene columns", () => {
    expect(removeUnsupportedContiSceneColumn({ name: "추가 장면" }, {
      code: "PGRST204",
      message: "Could not find the 'name' column of 'conti_scenes' in the schema cache",
    })).toBeNull();
  });
});
