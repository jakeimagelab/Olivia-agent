import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const workspace = fs.readFileSync(path.join(root, "components/clients/ClientsWorkspace.tsx"), "utf8");
const overview = fs.readFileSync(path.join(root, "app/(client-hub)/clients/_components/detail/ClientOverviewTab.tsx"), "utf8");
const stepper = fs.readFileSync(path.join(root, "components/client-workspace/ProjectWorkflowStepper.tsx"), "utf8");

describe("client project overview redesign", () => {
  it("uses one compact project header instead of the duplicate mission bar", () => {
    expect(workspace).not.toContain("<MissionStatusBar");
    expect(workspace).toContain("`진행 중 ${workflowSummary?.progressPercent ?? 0}%`");
    expect(workspace).toContain("고객 정보 수정");
    expect(workspace).toContain("포털 링크 복사");
    expect(workspace).toContain("프로젝트 수정");
    expect(workspace).toContain("프로젝트 생성");
  });

  it("renders the seven workflow phases as pills with an all-process action", () => {
    expect(workspace).toContain('variant="pills"');
    expect(stepper).toContain('className="pcrm-project-phase-pills"');
    expect(stepper).toContain("전체 과정");
  });

  it("moves primary work, documents, shoot date, memo and secondary links into overview", () => {
    expect(overview).toContain('presentation="overview"');
    expect(overview).toContain("pcrm-overview-documents");
    expect(overview).toContain("workflowRun?.shoot_date");
    expect(overview).toContain("캘린더에 등록");
    expect(overview).toContain("pcrm-overview-memo");
    expect(overview).toContain("pcrm-overview-links");
  });
});
