import { describe, expect, it } from "vitest";
import {
  filterVisiblePhotoTaskJobs,
  type PhotoTaskJob,
} from "@/components/olivia-os/usePhotoTaskJobs";

function job(id: string, action: string, status: string, completedAt?: string): PhotoTaskJob {
  return { id, action, status, completed_at: completedAt ?? null };
}

describe("Olivia OS photo task jobs", () => {
  it("shows only supported active, failed, canceled, and just-completed photo work", () => {
    const now = new Date("2026-11-15T12:00:00.000Z").getTime();
    const jobs = [
      job("running", "PERSON_SELECT_RAW_MATCH", "RUNNING"),
      job("failed", "PHOTO_SORT", "FAILED"),
      job("canceled", "PHOTO_STAGE_JPG", "CANCELED"),
      job("recent", "PHOTO_CLASSIFY_WORK", "COMPLETED", "2026-11-15T11:59:55.000Z"),
      job("old", "PHOTO_CLASSIFY_WORK", "COMPLETED", "2026-11-15T11:59:50.000Z"),
      job("unrelated", "LIST_FOLDER", "RUNNING"),
    ];

    expect(filterVisiblePhotoTaskJobs(jobs, now).map((item) => item.id)).toEqual([
      "running",
      "failed",
      "canceled",
      "recent",
    ]);
  });

  it("keeps every supported person-select background action visible while active", () => {
    const jobs = [
      job("import", "PERSON_SELECT_IMPORT", "QUEUED"),
      job("delivery", "PERSON_SELECT_DELIVERY_IMPORT", "RUNNING"),
      job("delivery-download", "PERSON_SELECT_DELIVERY_DOWNLOAD", "RUNNING"),
      job("purge", "PERSON_SELECT_DELIVERY_PURGE", "RUNNING"),
      job("raw", "PERSON_SELECT_RAW_MATCH", "RUNNING"),
    ];

    expect(filterVisiblePhotoTaskJobs(jobs).map((item) => item.id)).toEqual(["import", "delivery", "delivery-download", "purge", "raw"]);
  });
});
