import { describe, expect, it } from "vitest";
import {
  classifyOliviaAttachment,
  isValidOliviaAttachmentPath,
  sanitizeOliviaAttachments,
  validateOliviaAttachmentBatch,
  validateOliviaAttachmentInput,
} from "./chatAttachments";

describe("Olivia chat attachments", () => {
  it("classifies supported analysis formats", () => {
    expect(classifyOliviaAttachment("photo.jpg", "image/jpeg")).toBe("image");
    expect(classifyOliviaAttachment("brief.pdf", "application/pdf")).toBe("pdf");
    expect(classifyOliviaAttachment("list.csv", "text/csv")).toBe("text");
    expect(classifyOliviaAttachment("report.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("spreadsheet");
  });

  it("keeps office documents as stored-only files and blocks scripts", () => {
    expect(classifyOliviaAttachment("brief.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("file");
    expect(classifyOliviaAttachment("run.html", "text/html")).toBeNull();
  });

  it("enforces file and batch limits", () => {
    expect(validateOliviaAttachmentInput({ fileName: "large.pdf", mimeType: "application/pdf", fileSize: 11 * 1024 * 1024 }).ok).toBe(false);
    expect(validateOliviaAttachmentBatch(Array.from({ length: 6 }, (_, index) => ({
      name: `${index}.txt`,
      type: "text/plain",
      size: 10,
    })))).toContain("최대 5개");
  });

  it("accepts only generated storage paths", () => {
    expect(isValidOliviaAttachmentPath("uploads/2026-07-24/123e4567-e89b-12d3-a456-426614174000/file.pdf")).toBe(true);
    expect(isValidOliviaAttachmentPath("../private/file.pdf")).toBe(false);
  });

  it("sanitizes attachment metadata and removes download URLs when absent", () => {
    const [attachment] = sanitizeOliviaAttachments([{
      id: "a1",
      storagePath: "uploads/2026-07-24/123e4567-e89b-12d3-a456-426614174000/file.pdf",
      fileName: "file.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1200,
      downloadUrl: "https://signed.example/file",
    }]);
    expect(attachment).toMatchObject({ id: "a1", kind: "pdf", analysisStatus: "supported" });
    expect(attachment.downloadUrl).toContain("signed.example");
  });
});
