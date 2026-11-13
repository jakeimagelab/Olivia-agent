import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { hasFinalSelectionConfirmation } from "@/lib/person-select/finalSubmission";
import { selectionStatus } from "@/lib/person-select/core";
import { markPersonSelectionAsDraft } from "@/lib/person-select/selectionSyncServer";

describe("person select final submission", () => {
  it("accepts only an explicit final confirmation", () => {
    expect(hasFinalSelectionConfirmation({ confirmed: true })).toBe(true);
    expect(hasFinalSelectionConfirmation({ confirmed: false })).toBe(false);
    expect(hasFinalSelectionConfirmation({ confirmed: "true" })).toBe(false);
    expect(hasFinalSelectionConfirmation(null)).toBe(false);
  });

  it("keeps saved choices in progress until a final submission exists", () => {
    expect(selectionStatus({ firstSeenAt: "2026-11-12T00:00:00Z", submittedAt: null, choiceCount: 3, latestChoiceAt: "2026-11-12T00:01:00Z" })).toBe("선택 중");
    expect(selectionStatus({ firstSeenAt: "2026-11-12T00:00:00Z", submittedAt: "2026-11-12T00:02:00Z", choiceCount: 3, latestChoiceAt: "2026-11-12T00:01:00Z" })).toBe("제출 완료");
  });

  it("returns a submitted personal selection to draft after an edit", async () => {
    const eqEvent = vi.fn(async () => ({ error: null }));
    const eqPerson = vi.fn(() => ({ eq: eqEvent }));
    const update = vi.fn(() => ({ eq: eqPerson }));
    const db = { from: vi.fn(() => ({ update })) };

    await markPersonSelectionAsDraft(db as never, "event-1", "person-1");

    expect(db.from).toHaveBeenCalledWith("person_select_people");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ submitted_at: null }));
    expect(eqPerson).toHaveBeenCalledWith("id", "person-1");
    expect(eqEvent).toHaveBeenCalledWith("event_id", "event-1");
  });

  it("uses the same two-step confirmation dialog in all customer selection screens", async () => {
    const files = [
      "components/person-select/PersonSelectHome.tsx",
      "components/person-select/SharedProjectClassicSelect.tsx",
      "components/select-gallery/CustomerBridgeSelect.tsx",
    ];
    for (const file of files) {
      const source = await readFile(path.join(process.cwd(), file), "utf8");
      const isCustomerBridge = file.endsWith("CustomerBridgeSelect.tsx");
      const isPersonalHome = file.endsWith("PersonSelectHome.tsx");
      const isSharedClassic = file.endsWith("SharedProjectClassicSelect.tsx");
      const submissionSource = isCustomerBridge
        ? await readFile(path.join(process.cwd(), "components/select-gallery/useCustomerBridgeSubmission.ts"), "utf8")
        : isPersonalHome
          ? await readFile(path.join(process.cwd(), "components/person-select/usePersonSelectFinalSubmission.ts"), "utf8")
          : isSharedClassic
            ? await readFile(path.join(process.cwd(), "components/person-select/useSharedProjectClassicSubmission.ts"), "utf8")
            : source;
      const presentationSource = isCustomerBridge
        ? await readFile(path.join(process.cwd(), "components/select-gallery/CustomerBridgeOverlayLayer.tsx"), "utf8")
        : source;
      expect(presentationSource).toContain("FinalSelectionSubmitDialog");
      expect(submissionSource).toContain("confirmed: true");
      expect(presentationSource).not.toContain("장을 최종 제출할까요?");
    }
    const dialog = await readFile(path.join(process.cwd(), "components/person-select/FinalSelectionSubmitDialog.tsx"), "utf8");
    expect(dialog).toContain("최종 선택 확인");
    expect(dialog).toContain("확인하고 최종 제출");
    expect(dialog).toContain("disabled={!confirmed || busy}");
  });
});
