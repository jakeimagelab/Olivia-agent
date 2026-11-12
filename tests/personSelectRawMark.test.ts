import { describe, expect, it } from "vitest";
import {
  normalizePersonSelectRawMatchMode,
  resolveSharedRawMatchTargets,
  type PersonSelectRawImage,
} from "@/lib/person-select/rawMatch";
import { restoreRawMarkXmp, updateRawMarkXmp } from "@/lib/person-select/node/rawMarkXmp";

function selected(id: string, rating: number | null, color: number | null, savedAt: string): PersonSelectRawImage {
  return {
    id,
    originalFileName: `${id}.JPG`,
    sourceRelPath: `JPG/${id}.JPG`,
    customerRating: rating,
    customerColorLabel: color,
    markSavedAt: savedAt,
  };
}

describe("person select RAW execution mode", () => {
  it("keeps omitted mode backward compatible with copy", () => {
    expect(normalizePersonSelectRawMatchMode(undefined)).toBe("copy");
    expect(normalizePersonSelectRawMatchMode("mark")).toBe("mark");
  });

  it("merges reviewer conflicts with highest rating and latest color", () => {
    const result = resolveSharedRawMatchTargets({
      source: "current",
      reviewers: [
        { id: "a", displayName: "정연호", active: true },
        { id: "b", displayName: "매니저", active: true },
      ],
      submittedByReviewer: new Map(),
      draftByReviewer: new Map([
        ["a", [selected("photo", 3, 6, "2026-11-11T00:00:00Z")]],
        ["b", [selected("photo", 5, 9, "2026-11-11T01:00:00Z")]],
      ]),
    });
    expect(result.targets).toHaveLength(1);
    expect(result.targets[0]).toMatchObject({ customerRating: 5, customerColorLabel: 9, markConflict: true });
  });
});
describe("RAW sidecar XMP", () => {
  const original = `<?xml version="1.0"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/" xmp:Rating="2" xmp:Label="Second" crs:Exposure2012="0.45" /></rdf:RDF></x:xmpmeta>`;

  it("writes rating 5 and color 6 without changing Camera Raw settings", () => {
    const updated = updateRawMarkXmp(original, { rating: 5, label: "Select", jobId: "job-1" });
    expect(updated.xml).toContain('xmp:Rating="5"');
    expect(updated.xml).toContain('xmp:Label="Select"');
    expect(updated.xml).toContain('crs:Exposure2012="0.45"');
    expect(updated.xml).toContain('olivia:PrevRating="2"');
    expect(updated.xml).toContain('olivia:PrevLabel="Second"');
  });

  it("restores existing values and deletes a sidecar created by Olivia", () => {
    const updated = updateRawMarkXmp(original, { rating: 5, label: "Select", jobId: "job-2" });
    const restored = restoreRawMarkXmp(updated.xml, "job-2");
    expect(restored.deleteSidecar).toBe(false);
    expect(restored.xml).toContain('xmp:Rating="2"');
    expect(restored.xml).toContain('xmp:Label="Second"');
    expect(restored.xml).toContain('crs:Exposure2012="0.45"');

    const created = updateRawMarkXmp(null, { rating: 5, label: "Select", jobId: "job-new" });
    expect(restoreRawMarkXmp(created.xml, "job-new").deleteSidecar).toBe(true);
  });

  it("keeps the original backup when a later job corrects an Olivia mark", () => {
    const first = updateRawMarkXmp(original, { rating: 1, label: "Select", jobId: "job-old" });
    const corrected = updateRawMarkXmp(first.xml, { rating: 5, label: "Select", jobId: "job-corrected" });
    const restored = restoreRawMarkXmp(corrected.xml, "job-corrected");
    expect(restored.deleteSidecar).toBe(false);
    expect(restored.xml).toContain('xmp:Rating="2"');
    expect(restored.xml).toContain('xmp:Label="Second"');

    const created = updateRawMarkXmp(null, { rating: 1, label: null, jobId: "job-created-old" });
    const correctedCreated = updateRawMarkXmp(created.xml, { rating: 5, label: null, jobId: "job-created-new" });
    expect(restoreRawMarkXmp(correctedCreated.xml, "job-created-new").deleteSidecar).toBe(true);
  });
});
