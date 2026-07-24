import { describe, expect, it } from "vitest";
import { validatePcrmAttachmentInput } from "./attachments";

describe("PCRM 첨부파일 검증", () => {
  it("50MB를 초과한 파일을 거부한다", () => {
    expect(validatePcrmAttachmentInput({
      fileName: "large.pdf",
      mimeType: "application/pdf",
      fileSize: 50 * 1024 * 1024 + 1,
    }).ok).toBe(false);
  });

  it("일반 이미지와 문서를 허용한다", () => {
    expect(validatePcrmAttachmentInput({
      fileName: "reference.jpg",
      mimeType: "image/jpeg",
      fileSize: 1024,
    }).ok).toBe(true);
  });

  it("실행 파일을 거부한다", () => {
    expect(validatePcrmAttachmentInput({
      fileName: "danger.exe",
      mimeType: "application/x-msdownload",
      fileSize: 1024,
    }).ok).toBe(false);
  });
});
