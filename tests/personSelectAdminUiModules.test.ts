import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getDeliveryImportUnassigned } from "@/components/person-select/upload/DeliveryImportResult";
import { formatRelativeTime } from "@/lib/person-select/format";

describe("person select admin UI modules", () => {
  it("formats shared relative timestamps consistently", () => {
    const now = new Date("2026-11-12T12:00:00.000Z").getTime();
    expect(formatRelativeTime("2026-11-12T11:45:00.000Z", now)).toBe("15분 전");
    expect(formatRelativeTime("2026-11-12T10:00:00.000Z", now)).toBe("2시간 전");
    expect(formatRelativeTime(null, now)).toBe("—");
  });

  it("normalizes only assignable delivery import rows", () => {
    expect(getDeliveryImportUnassigned({
      unassigned: [null, { deliveryId: "delivery-1", fileName: "retouched.jpg", parentFolderName: "홍길동" }, { fileName: "missing-id.jpg" }],
    })).toEqual([{ deliveryId: "delivery-1", fileName: "retouched.jpg", parentFolderName: "홍길동" }]);
  });

  it("keeps the page as the shell for the extracted dialogs", () => {
    const page = readFileSync("app/(client-hub)/person-select/[id]/page.tsx", "utf8");
    const importController = readFileSync("components/person-select/admin/hooks/usePersonSelectImportController.ts", "utf8");
    const originalImportController = readFileSync("components/person-select/admin/hooks/usePersonSelectOriginalImportController.ts", "utf8");
    const projectActions = readFileSync("components/person-select/admin/hooks/usePersonSelectProjectActions.ts", "utf8");
    const uploadPanel = readFileSync("components/person-select/admin/PersonSelectUploadPanel.tsx", "utf8");
    const settingsPanel = readFileSync("components/person-select/admin/PersonSelectSettingsPanel.tsx", "utf8");
    const individualProgress = readFileSync("components/person-select/admin/PersonSelectIndividualProgressPanel.tsx", "utf8");
    const sharedProgress = readFileSync("components/person-select/admin/PersonSelectSharedProgressPanel.tsx", "utf8");
    const matchingPanels = readFileSync("components/person-select/admin/PersonSelectMatchingPanels.tsx", "utf8");
    expect(page).toContain('from "@/components/person-select/admin/SelectionSyncDialog"');
    expect(page).toContain('from "@/components/person-select/admin/PersonSelectUploadPanel"');
    expect(page).toContain('from "@/components/person-select/admin/PersonSelectSettingsPanel"');
    expect(page).toContain('from "@/components/person-select/admin/PersonSelectIndividualProgressPanel"');
    expect(page).toContain('from "@/components/person-select/admin/PersonSelectSharedProgressPanel"');
    expect(page).toContain('from "@/components/person-select/admin/PersonSelectMatchingPanels"');
    expect(page).toContain('from "@/components/person-select/admin/hooks/usePersonSelectImportController"');
    expect(page).toContain('from "@/components/person-select/admin/hooks/usePersonSelectProjectActions"');
    expect(page).not.toContain("function SelectionSyncDialog(");
    expect(page).not.toContain("function DeliveryImportResult(");
    expect(uploadPanel).toContain('from "@/components/person-select/upload/DeliveryImportResult"');
    expect(settingsPanel).toContain("ACCESS_MODE_LABELS");
    expect(settingsPanel).toContain("최종 확정 권한");
    expect(individualProgress).toContain("서버 기준 · 마지막 저장");
    expect(sharedProgress).toContain("서버 저장됨 · 제출 전");
    expect(matchingPanels).toContain("CustomerBridgeSelect");
    expect(page).not.toContain("async function startRemoteImport(");
    expect(page).not.toContain("async function deleteProject(");
    expect(importController).toContain("usePersonSelectOriginalImportController");
    expect(originalImportController).toContain('action: "PERSON_SELECT_IMPORT"');
    expect(importController).toContain("startDeliveryImport");
    expect(projectActions).toContain("ACCESS_MODE_CONFIRMATION_REQUIRED");
    expect(projectActions).toContain('method: "DELETE"');
  });
});
