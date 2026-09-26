import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const workspace = fs.readFileSync(path.join(root, "components/clients/ClientsWorkspace.tsx"), "utf8");
const adapter = fs.readFileSync(path.join(root, "components/olivia-os/adapters/ClientsWindowContent.tsx"), "utf8");
const overview = fs.readFileSync(path.join(root, "app/(client-hub)/clients/_components/detail/ClientOverviewTab.tsx"), "utf8");

describe("customer workspace window behavior", () => {
  it("keeps the window chrome clipped while giving the workspace one vertical scroll region", () => {
    expect(adapter).toContain('overflow: "hidden"');
    expect(workspace).toContain('className="pcrm-window-scroll-region"');
    expect(workspace).toContain('overflowY: "auto", overflowX: "hidden"');
    expect(workspace).toContain('minHeight: 0');
  });

  it("renders the shared search and create actions inside the window only", () => {
    expect(workspace).toContain("usePcrmHeaderActions(headerActions, [headerActions])");
    expect(workspace).toContain("if (!embedded) return body");
    expect(workspace).toContain("{headerActions}");
  });

  it("exposes customer editing from the detail header and preserves the existing InfoPanel", () => {
    expect(workspace).toContain("고객 정보 수정");
    expect(workspace).toContain('setActiveTab("info")');
    expect(workspace).toContain("<InfoPanel client={client}");
    expect(workspace).toContain('{ key: "revisions", label: "보정 요청" }');
  });

  it("keeps every detail view reachable without the old nine-tab strip", () => {
    expect(workspace).toContain('className="pcrm-detail-subview-nav"');
    expect(workspace).toContain('setActiveTab("overview")');
    expect(workspace).toContain('gridTemplateColumns: "minmax(0, 1fr)"');
    expect(overview).toContain('className="pcrm-overview-links"');
    for (const tab of ["documents", "schedule", "gallery", "revisions", "activity", "portal"]) {
      expect(overview).toContain(`onNavigateTab?.("${tab}")`);
    }
  });
});
