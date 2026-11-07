import { describe, expect, it } from "vitest";

import { normalizeNasDownloadUrl } from "@/lib/person-select/reviewers";
import { parsePersonSelectProjectMessage, publicPersonSelectProjectMessage } from "@/lib/person-select/sharedMessages";
import { sharedReviewerTokenHash } from "@/lib/person-select/sharedPublic";

describe("project shared reviewer security", () => {
  it("stores only a deterministic hash of the reviewer token", () => {
    const token = "reviewer-secret-token";
    const hash = sharedReviewerTokenHash(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(sharedReviewerTokenHash(token));
    expect(hash).not.toContain(token);
  });

  it("allows only credential-free HTTPS NAS share links", () => {
    expect(normalizeNasDownloadUrl("http://nas.example.test/share")).toEqual({ error: "NAS 공유 링크는 https 주소만 사용할 수 있습니다." });
    expect(normalizeNasDownloadUrl("https://user:pass@nas.example.test/share")).toEqual({ value: "https://nas.example.test/share" });
    expect(normalizeNasDownloadUrl("")).toEqual({ value: null });
  });
});

describe("project shared conversation", () => {
  it("validates idempotent messages and marks only the current reviewer as own", () => {
    expect(parsePersonSelectProjectMessage({ body: "  이 사진을 우선으로 봐주세요.  ", requestId: "message_12345678" })).toEqual({
      body: "이 사진을 우선으로 봐주세요.",
      requestId: "message_12345678",
      imageId: null,
    });
    expect(parsePersonSelectProjectMessage({ body: "이 컷 표정을 확인해 주세요.", requestId: "message_photo_1", imageId: "018e2f30-92af-78b1-8f21-67f4404f5027" })).toEqual({
      body: "이 컷 표정을 확인해 주세요.",
      requestId: "message_photo_1",
      imageId: "018e2f30-92af-78b1-8f21-67f4404f5027",
    });
    const row = {
      id: "message-id",
      reviewer_id: "reviewer-a",
      admin_actor: null,
      body: "확인했습니다.",
      created_at: "2026-11-07T00:00:00.000Z",
      person_select_shared_reviewers: { display_name: "정연호", role_label: "사진가" },
    };
    expect(publicPersonSelectProjectMessage(row, "reviewer-a")).toMatchObject({ authorName: "정연호", authorRole: "사진가", own: true, imageId: null });
    expect(publicPersonSelectProjectMessage(row, "reviewer-b")).toMatchObject({ own: false });
  });
});
