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
    const selectGalleriesAdapter = source("components/olivia-os/adapters/SelectGalleriesWindowContent.tsx");
    const seoAdapter = source("components/olivia-os/adapters/SeoDeliveryWindowContent.tsx");
    const mailingAdapter = source("components/olivia-os/adapters/MailingWindowContent.tsx");
    const workJournalAdapter = source("components/olivia-os/adapters/WorkJournalWindowContent.tsx");
    const reportAdapter = source("components/olivia-os/adapters/ReportWindowContent.tsx");
    const selectGalleriesPage = source("app/(client-hub)/select-galleries/page.tsx");
    const selectGalleryDetailPage = source("app/(client-hub)/select-galleries/[id]/page.tsx");
    const seoPage = source("app/seo-delivery/page.tsx");
    const mailingPage = source("app/mailing/page.tsx");
    const workJournalPage = source("app/work-journal/page.tsx");
    const reportPage = source("app/report/page.tsx");

    expect(photoAdapter).toContain("<PhotoWorkspace hideHeader");
    expect(analysisShell).toContain('surface === "window" ? null');
    expect(contract).toContain("const isDesktopWindow = isModal && useDesktopWindowMode()");
    expect(contract).toContain("return isDesktopWindow ? null : isModal ?");
    expect(conti).toContain("const isDesktopWindow = useDesktopWindowMode()");
    expect(conti).toContain("{isDesktopWindow ? null : (");
    expect(review).toContain("{!isDesktopWindow ? (");
    expect(selectGalleriesAdapter).toContain("<DesktopWindowProvider value={true}>");
    expect(selectGalleriesAdapter).toContain("<DesktopWindowRouteProvider value={routeValue}>");
    expect(selectGalleriesAdapter).toContain("clientId: context?.clientId");
    expect(selectGalleriesAdapter).toContain("workflowRunId: context?.workflowRunId");
    expect(selectGalleriesPage).toContain("useDesktopWindowRoute()");
    expect(selectGalleryDetailPage).toContain("useDesktopWindowRoute()");
    expect(seoAdapter).toContain("<SeoDeliveryPage />");
    expect(seoPage).toContain("useDesktopWindowMode()");
    expect(mailingAdapter).toContain("<MailingPage />");
    expect(mailingPage).toContain("useDesktopWindowMode()");
    expect(workJournalAdapter).toContain("<WorkJournalPage />");
    expect(workJournalPage).toContain("useDesktopWindowMode()");
    expect(reportAdapter).toContain("<ReportPage />");
    expect(reportPage).toContain("useDesktopWindowMode()");
  });

  it("keeps standalone and legacy iframe header behavior explicit", () => {
    const metadata = source("components/metadata-select/MetadataSelectWorkspace.tsx");
    const rootShell = source("components/layout/RootExperienceShell.tsx");
    const globalCss = source("app/globals.css");

    expect(metadata).toContain("!desktopWindowMode ? <GlobalHeader");
    expect(rootShell).toContain('classList.toggle("olivia-embedded", isEmbedded)');
    expect(globalCss).toContain(".olivia-embedded .oa-header");
  });

  it("marks only compatibility iframe windows with an accessible limitation tooltip", () => {
    const appWindow = source("components/olivia-os/window/AppWindow.tsx");
    const windowHeader = source("components/olivia-os/window/WindowHeader.tsx");

    expect(appWindow).toContain('compatibilityMode={win.appId === "legacy-route"}');
    expect(windowHeader).toContain("호환 화면");
    expect(windowHeader).toContain("단축키와 대화 컨텍스트 연동이 제한됩니다");
    expect(windowHeader).toContain('role="tooltip"');
    expect(windowHeader).toContain('aria-describedby="olivia-compatibility-tooltip"');
  });
});
