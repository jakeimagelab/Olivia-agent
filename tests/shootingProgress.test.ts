import { describe, expect, it } from "vitest";
import {
  buildFolderDateCandidates,
  chooseUniqueCandidate,
  photoFolderSubject,
  resolveShootingProgressStage,
} from "@/lib/photo-storage/shootingProgress";

describe("shooting progress folder matching", () => {
  it("extracts the folder subject without merging request text", () => {
    expect(photoFolderSubject("0911_WINF")).toBe("WINF");
    expect(photoFolderSubject("0918_삼칠갈비(병원촬영)")).toBe("삼칠갈비");
  });

  it("builds valid adjacent-year candidates ordered by the detected date", () => {
    expect(buildFolderDateCandidates("0911_WINF", new Date("2026-09-12T00:00:00.000Z"))).toEqual([
      "2026-09-11",
      "2027-09-11",
      "2025-09-11",
    ]);
    expect(buildFolderDateCandidates("0230_invalid", new Date("2026-02-01T00:00:00.000Z"))).toEqual([]);
    expect(buildFolderDateCandidates("WINF", new Date("2026-09-12T00:00:00.000Z"))).toEqual([]);
  });

  it("selects only one clear best candidate and rejects ties", () => {
    const rows = [{ id: "a", score: 100 }, { id: "b", score: 30 }];
    expect(chooseUniqueCandidate(rows, (row) => row.score)).toEqual({ candidate: rows[0], ambiguous: false });
    expect(chooseUniqueCandidate([{ id: "a", score: 70 }, { id: "b", score: 70 }], (row) => row.score)).toEqual({
      candidate: null,
      ambiguous: true,
    });
  });
});

describe("shooting progress display stage", () => {
  it("shows original delivery separately after scene classification", () => {
    expect(resolveShootingProgressStage({ projectStatus: "CLASSIFY_COMPLETED" })).toBe("original_delivery");
    expect(resolveShootingProgressStage({
      projectStatus: "CLASSIFY_COMPLETED",
      workflowCurrentStep: "client_selection",
      originalDeliveryStepStatus: "in_progress",
    })).toBe("original_delivery");
  });

  it("works without a workflow run by deriving gallery and raw job facts", () => {
    expect(resolveShootingProgressStage({ galleryStatus: "waiting_selection", galleryNasLink: "https://example.com" }))
      .toBe("client_selection");
    expect(resolveShootingProgressStage({ galleryStatus: "selection_submitted" })).toBe("raw_matching");
    expect(resolveShootingProgressStage({ rawJobStatus: "RUNNING" })).toBe("raw_matching");
    expect(resolveShootingProgressStage({ rawJobStatus: "COMPLETED" })).toBe("retouching");
  });

  it("keeps pre-classification projects in backup sorting", () => {
    expect(resolveShootingProgressStage({ projectStatus: "CLASSIFYING" })).toBe("backup_sorting");
    expect(resolveShootingProgressStage({ projectStatus: "REVIEW_REQUIRED" })).toBe("backup_sorting");
  });
});
