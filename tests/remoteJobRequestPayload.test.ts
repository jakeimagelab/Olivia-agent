import { describe, expect, it } from "vitest";
import { normalizeRemoteJobRequestPayload } from "@/lib/remote-jobs/requestPayload";

const eventId = "018e2f30-92af-78b1-8f21-67f4404f5027";

describe("remote job request payload dispatcher", () => {
  it("dispatches photo and person-select actions to their normalizers", () => {
    expect(normalizeRemoteJobRequestPayload("PHOTO_THUMBS", {
      remote_path: "촬영/프로젝트",
    })).toEqual({ remote_path: "촬영/프로젝트", max_count: 400, offset: 0 });
    expect(normalizeRemoteJobRequestPayload("PERSON_SELECT_RAW_MATCH", {
      event_id: eventId,
    })).toEqual({ event_id: eventId, mode: "copy", source: "submitted" });
  });

  it("sanitizes video context and excludes it from audio extraction", () => {
    expect(normalizeRemoteJobRequestPayload("VIDEO_INTERVIEW_ANALYZE", {
      source_relative_path: "촬영/인터뷰",
      context: "--질문\n확인",
    })).toEqual({ source_relative_path: "촬영/인터뷰", context: "질문 확인" });
    expect(normalizeRemoteJobRequestPayload("VIDEO_AUDIO_EXTRACT", {
      source_relative_path: "촬영/인터뷰",
      context: "ignored",
    })).toEqual({ source_relative_path: "촬영/인터뷰" });
  });

  it("passes through payloads for simple built-in worker actions", () => {
    const payload = { probe: "health" };
    expect(normalizeRemoteJobRequestPayload("PING", payload)).toBe(payload);
    expect(normalizeRemoteJobRequestPayload("COPY_TEST", payload)).toBe(payload);
  });

  it("keeps delivery purge payload empty", () => {
    expect(normalizeRemoteJobRequestPayload("PERSON_SELECT_DELIVERY_PURGE", {
      ignored: true,
    })).toEqual({});
  });
});
