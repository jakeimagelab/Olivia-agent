import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getDesktopContentKey } from "@/lib/olivia/desktopContentKey";

describe("conti creation UI", () => {
  it("offers optional hair makeup and profile choices before generation", () => {
    const source = readFileSync("components/conti/v2/ContiCreateScreen.tsx", "utf8");
    expect(source).toContain('label="의료진 개인 촬영"');
    expect(source).toContain("헤어메이크업 · 준비");
    expect(source).toContain("의료진 프로필");
    expect(source).toContain("personalOptions");
  });

  it("uses multiline editors and keeps Enter inside text cells", () => {
    const source = readFileSync("components/conti/v2/ContiResultTable.tsx", "utf8");
    for (const field of ["name", "keyword", "description", "space_text", "people_text", "patient_role_text", "preparation_text"]) {
      expect(source).toMatch(new RegExp(`field=\\"${field}\\"[^>]*textarea`));
    }
    expect(source).toContain('event.currentTarget.tagName !== "TEXTAREA"');
  });

  it("opens an accessible AI scene recommendation dialog with a close control", () => {
    const tableSource = readFileSync("components/conti/v2/ContiResultTable.tsx", "utf8");
    const dialogSource = readFileSync("components/conti/v2/ContiSceneAddDialog.tsx", "utf8");
    expect(tableSource).toContain("setAddDialogOpen(true)");
    expect(tableSource).toContain("<ContiSceneAddDialog");
    expect(dialogSource).toContain('role="dialog"');
    expect(dialogSource).toContain('aria-label="닫기"');
    expect(dialogSource).toContain("빈 장면 추가");
    expect(dialogSource).toContain("선택한 장면 추가");
  });

  it("saves the opening-scene order once after the recommendation batch", () => {
    const studioSource = readFileSync("components/conti/v2/useContiStudio.ts", "utf8");
    const dialogSource = readFileSync("components/conti/v2/ContiSceneAddDialog.tsx", "utf8");
    expect(studioSource).toContain("mutationVersionRef.current += 1");
    expect(studioSource).toContain('setSaveStatus("dirty")');
    expect(dialogSource).toContain("needsOrderSave && !await controller.flushSave()");
  });

  it("does not remount the conti window when its client context changes", () => {
    const first = getDesktopContentKey({ windowId: "conti", appId: "conti", context: { clientId: "client-a", projectId: "project-a" } });
    const second = getDesktopContentKey({ windowId: "conti", appId: "conti", context: { clientId: "client-b", projectId: "project-b", documentId: "run-b" } });
    expect(first).toBe("conti");
    expect(second).toBe(first);
  });
});
