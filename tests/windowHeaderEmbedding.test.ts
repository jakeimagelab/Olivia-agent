import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("Olivia AppWindow header ownership", () => {
  it("removes page-level headers from native window adapters", () => {
    const photoAdapter = source("components/olivia-os/adapters/PhotoWorkspaceWindowContent.tsx");
    const analysisShell = source("components/analysis-workspace/AnalysisWorkspaceShell.tsx");
    const contract = source("components/contract/ContractBuilder.tsx");
    const conti = source("components/conti/v2/ContiEditorWorkspace.tsx");
    const review = source("components/reviews/ReviewStoryWorkspace.tsx");

    expect(photoAdapter).toContain("<PhotoWorkspace hideHeader");
    expect(analysisShell).toContain('surface === "window" ? null');
    expect(contract).toContain("const isDesktopWindow = isModal && useDesktopWindowMode()");
    expect(contract).toContain("return isDesktopWindow ? null : isModal ?");
    expect(conti).toContain("const isDesktopWindow = useDesktopWindowMode()");
    expect(conti).toContain("{isDesktopWindow ? null : (");
    expect(review).toContain("{!isDesktopWindow ? (");
  });

  it("keeps standalone and legacy iframe header behavior explicit", () => {
    const metadata = source("components/metadata-select/MetadataSelectWorkspace.tsx");
    const rootShell = source("components/layout/RootExperienceShell.tsx");
    const globalCss = source("app/globals.css");

    expect(metadata).toContain("!desktopWindowMode ? <GlobalHeader");
    expect(rootShell).toContain('classList.toggle("olivia-embedded", isEmbedded)');
    expect(globalCss).toContain(".olivia-embedded .oa-header");
  });
});
