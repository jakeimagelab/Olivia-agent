import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

describe("photo Scene naming job migration", () => {
  it("enables Scene naming and keeps profile classification disabled in both automatic claim paths", async () => {
    const source = await readFile(
      path.join(process.cwd(), "supabase/migrations/20260923_photo_scene_naming.sql"),
      "utf8",
    );

    expect(source).toContain("claim_copy_completed_photo_project");
    expect(source).toContain("claim_nas_classify_photo_project");
    expect(source.match(/'ai_naming_enabled', true/g)).toHaveLength(2);
    expect(source.match(/'profile_classification_enabled', false/g)).toHaveLength(2);
    expect(source.match(/for update skip locked/g)).toHaveLength(2);
    expect(source.match(/grant execute on function public\.claim_[a-z_]+\(text\) to service_role/g)).toHaveLength(2);
  });
});
