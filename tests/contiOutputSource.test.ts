import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("conti print and edit surfaces", () => {
  it("renders the three fixed print pages from the shared output model", () => {
    const print = source("components/conti/v2/ContiPrintDocument.tsx");
    expect(print.match(/<PrintPage/g)).toHaveLength(3);
    expect(print).toContain("상세 촬영 콘티");
    expect(print).toContain("촬영 준비 체크리스트");
    expect(print).toContain("당일 타임테이블");
  });

  it("keeps editable scene and timeline time controls wired to saved state", () => {
    const table = source("components/conti/v2/ContiResultTable.tsx");
    const editor = source("components/conti/v2/ContiEditorWorkspace.tsx");
    expect(table).toContain("setSceneShootingTime");
    expect(table).toContain("updateSceneMedia");
    expect(editor).toContain("updateTimelineOverride");
    expect(editor).toContain('type="date"');
    expect(editor.match(/type="time"/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
