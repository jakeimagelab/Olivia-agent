import { describe, expect, it } from "vitest";

import { decidePhotoQuality } from "@/lib/photo-quality/decision";
import { latestPhotoQualityResults, photoQualityCounts, publicPhotoQualityResult } from "@/lib/photo-quality/public";
import type { PhotoQualityModelAssessment } from "@/lib/photo-quality/types";
import { parseDownloadRequest } from "@/lib/person-select/downloads";
import { sharedPersonSelectEventResponse } from "@/lib/person-select/sharedPublic";
import { createRunnerInvocation } from "@/scripts/mac-studio-remote-bridge";

function assessment(overrides: Partial<PhotoQualityModelAssessment> = {}): PhotoQualityModelAssessment {
  const normal = { detected: false, confidence: 0.95, assessable: true, reason: "정상" };
  return {
    eyes_closed: normal,
    face_too_dark: normal,
    motion_blur: normal,
    peopleVisible: true,
    intentionalSilhouette: false,
    intentionalMotion: false,
    ...overrides,
  };
}

describe("photo quality decision", () => {
  it("keeps normal portraits normal and records multiple confident issues", () => {
    expect(decidePhotoQuality(assessment(), { blurScore: 30, brightness: 90 })).toMatchObject({ status: "normal", flags: [] });
    expect(decidePhotoQuality(assessment({
      eyes_closed: { detected: true, confidence: 0.93, assessable: true, reason: "한 사람의 눈이 감김" },
      motion_blur: { detected: true, confidence: 0.82, assessable: true, reason: "얼굴 흔들림" },
    }), { blurScore: 8, brightness: 80 })).toMatchObject({ status: "suspected", flags: ["eyes_closed", "motion_blur"] });
  });

  it("routes uncertainty to review and never flags intentional silhouette or motion", () => {
    expect(decidePhotoQuality(assessment({
      eyes_closed: { detected: false, confidence: 0.3, assessable: false, reason: "옆모습이라 판단 불가" },
    }), { blurScore: 30, brightness: 90 }).status).toBe("needs_review");
    expect(decidePhotoQuality(assessment({
      face_too_dark: { detected: true, confidence: 0.96, assessable: true, reason: "실루엣" },
      motion_blur: { detected: true, confidence: 0.9, assessable: true, reason: "의도적 패닝" },
      intentionalSilhouette: true,
      intentionalMotion: true,
    }), { blurScore: 30, brightness: 90 })).toMatchObject({ status: "normal", flags: [] });
  });

  it("never calls a no-person frame eyes-closed or face-dark", () => {
    expect(decidePhotoQuality(assessment({
      peopleVisible: false,
      eyes_closed: { detected: true, confidence: 0.99, assessable: true, reason: "잘못된 얼굴 추정" },
      face_too_dark: { detected: true, confidence: 0.99, assessable: true, reason: "얼굴 없음" },
    }), { blurScore: 30, brightness: 90 })).toMatchObject({ status: "normal", flags: [] });
  });
});

describe("photo quality public projection", () => {
  it("returns only the latest result for each image and counts each photo once", () => {
    const rows = [
      { image_id: "a", analysis_status: "suspected", flags: ["eyes_closed"], analyzed_at: "2026-11-07T02:00:00Z" },
      { image_id: "a", analysis_status: "normal", flags: [], analyzed_at: "2026-11-07T01:00:00Z" },
      { image_id: "b", analysis_status: "needs_review", flags: [], analyzed_at: "2026-11-07T02:00:00Z" },
    ];
    const latest = latestPhotoQualityResults(rows);
    expect(latest.map((row) => row.image_id)).toEqual(["a", "b"]);
    expect(photoQualityCounts(latest)).toMatchObject({ total: 2, eyes_closed: 1, needs_review: 1, normal: 0 });
    expect(publicPhotoQualityResult(latest[0])).toMatchObject({ imageId: "a", status: "suspected", flags: ["eyes_closed"] });
  });
});

describe("secure Bridge downloads", () => {
  it("deduplicates validated image IDs and rejects oversized or invalid requests", () => {
    expect(parseDownloadRequest({ requestKey: "download_123456", format: "jpg", imageIds: ["a", "a", "b"] })).toEqual({ requestKey: "download_123456", format: "jpg", imageIds: ["a", "b"] });
    expect(() => parseDownloadRequest({ requestKey: "bad", imageIds: ["a"] })).toThrow(/요청 키/);
    expect(() => parseDownloadRequest({ requestKey: "download_123456", imageIds: [] })).toThrow(/1~5000장/);
  });

  it("does not expose the configured NAS URL in the public event payload", () => {
    const response = sharedPersonSelectEventResponse({
      id: "event",
      title: "협회",
      deadline_at: "2026-12-31T09:00:00Z",
      status: "open",
      access_mode: "project_shared",
      source_relative_path: "root-1/project",
      nas_download_url: "https://nas.example.test/private",
    } as never);
    expect(response).toMatchObject({ download_available: true });
    expect(response).not.toHaveProperty("nas_download_url");
  });
});

describe("Mac Studio job routing", () => {
  const repoRoot = "/repo";
  const job = (action: string, payload: Record<string, unknown>) => ({ id: "job", action, payload, status: "RUNNING" });

  it("routes quality and download jobs to their dedicated runners", () => {
    expect(createRunnerInvocation(job("PERSON_SELECT_QUALITY", { quality_job_id: "quality-job" }) as never, repoRoot)?.args).toEqual([
      "--import", "tsx", "/repo/scripts/person-select-quality.ts", "--job-id", "quality-job",
    ]);
    expect(createRunnerInvocation(job("PERSON_SELECT_DOWNLOAD", { download_job_id: "download-job" }) as never, repoRoot)?.args).toEqual([
      "--import", "tsx", "/repo/scripts/person-select-download.ts", "--job-id", "download-job",
    ]);
  });
});
