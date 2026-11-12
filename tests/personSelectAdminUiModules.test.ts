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
    expect(page).toContain('from "@/components/person-select/admin/SelectionSyncDialog"');
    expect(page).toContain('from "@/components/person-select/upload/DeliveryImportResult"');
    expect(page).not.toContain("function SelectionSyncDialog(");
    expect(page).not.toContain("function DeliveryImportResult(");
  });
});
