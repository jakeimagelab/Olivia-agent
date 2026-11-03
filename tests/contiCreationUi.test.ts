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

  it("lets the user change a scene group and queues it for autosave", () => {
    const tableSource = readFileSync("components/conti/v2/ContiResultTable.tsx", "utf8");
    const studioSource = readFileSync("components/conti/v2/useContiStudio.ts", "utf8");
    expect(tableSource).toContain("controller.updateSceneGroup");
    expect(tableSource).toContain("<select");
    expect(studioSource).toContain("queueScenePatch(sceneId, { group_id: groupId })");
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

  it("does not remount the customer host when customer or document context changes", () => {
    const first = getDesktopContentKey({ windowId: "customer", appId: "customer", context: { clientId: "client-a", projectId: "run-a", resourceId: "quote-a" } });
    const second = getDesktopContentKey({ windowId: "customer", appId: "customer", context: { clientId: "client-b", projectId: "run-b", resourceId: "contract-b" } });
    expect(first).toBe("customer");
    expect(second).toBe(first);
  });

  it("does not remount a quote editor when its verified document context updates", () => {
    const first = getDesktopContentKey({ windowId: "quote", appId: "quote", context: { clientId: "client-a", resourceId: "quote-a" } });
    const second = getDesktopContentKey({ windowId: "quote", appId: "quote", context: { clientId: "client-b", projectId: "run-b", resourceId: "quote-b", documentId: "quote-b" } });
    expect(first).toBe("quote");
    expect(second).toBe(first);
  });
});
