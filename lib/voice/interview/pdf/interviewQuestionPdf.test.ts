import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildInterviewQuestionSnapshot } from "@/lib/voice/interview/preparation";
import { buildInterviewQuestionPdfHtml, interviewPdfFileName } from "@/lib/voice/interview/pdf/buildInterviewQuestionPdfHtml";

describe("interview question PDF", () => {
  it("uses one HTML source with exactly four pages for seven questions", () => {
    const html = buildInterviewQuestionPdfHtml({
      hospitalName: "여의도기통찬의원",
      intervieweeName: "김지훈 원장",
      interviewDate: "2026-10-21",
      selectedQuestions: buildInterviewQuestionSnapshot(["q01", "q06", "q13", "q16", "q21", "q27", "q31"]),
    });
    expect((html.match(/data-interview-print-page=/g) ?? [])).toHaveLength(3);
    expect((html.match(/data-interview-question-page=/g) ?? [])).toHaveLength(1);
    expect(html).toContain("좋은 이야기가 좋은 병원을 만듭니다");
    expect(html).toContain("병원이야기를 전하는 포토클리닉");
    expect(html).not.toContain("q01");
    expect(html).toContain("처음 의사가 되기로 마음먹었을 때");
  });

  it("keeps output filename Korean and safe", () => {
    expect(interviewPdfFileName({ hospitalName: "여의도/기통찬의원", intervieweeName: "김지훈:원장", interviewDate: "2026-10-21" }))
      .toBe("포토클리닉_인터뷰질문지_여의도 기통찬의원_김지훈 원장_2026-10-21.pdf");
  });

  it("uses native Chromium, never screenshot/html2canvas/jsPDF", () => {
    const renderer = readFileSync("lib/voice/interview/pdf/renderInterviewQuestionPdf.ts", "utf8");
    expect(renderer).toContain('import("playwright-core")');
    expect(renderer).toContain('import("@sparticuz/chromium")');
    expect(renderer).toContain("page.pdf(");
    expect(renderer).toContain("document.fonts.ready");
    expect(renderer).not.toContain("html2canvas");
    expect(renderer).not.toContain("jsPDF");
    expect(renderer).not.toContain("screenshot(");
  });
});
