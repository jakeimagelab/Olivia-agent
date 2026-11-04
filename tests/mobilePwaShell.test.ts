import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Olivia mobile PWA shell", () => {
  it("uses the visual viewport to keep the chat composer in view above the iOS keyboard", () => {
    const chat = read("components/olivia-mobile/MobileOliviaChat.tsx");
    const styles = read("components/olivia-mobile/OliviaMobileShell.module.css");

    expect(chat).toContain("window.visualViewport");
    expect(chat).toContain("viewport?.offsetTop");
    expect(chat).toContain('viewport?.addEventListener("resize", scheduleLayout)');
    expect(chat).toContain('viewport?.addEventListener("scroll", scheduleLayout');
    expect(chat).toContain("scrollToLatestMessage");
    expect(styles).toContain("--mobile-chat-height");
    expect(styles).toContain("--mobile-chat-offset-top");
    expect(chat).toContain("chatClose");
    expect(chat).toContain("onClose");
    expect(chat).toContain("startNewConversation");
    expect(chat).toContain("chatNewConversation");
    expect(styles).toContain("padding: calc(env(safe-area-inset-top, 0px) + 58px)");
    expect(styles).toContain("calc(9px + env(safe-area-inset-bottom, 0px))");
  });

  it("keeps mobile navigation usable while removing non-home title bars and the narrow conversation guide", () => {
    const shell = read("components/olivia-mobile/OliviaMobileShell.tsx");
    const conversation = read("components/olivia-v2/OliviaConversation.tsx");
    const nonHomeScreens = [
      "components/olivia-mobile/MobileOliviaChat.tsx",
      "components/olivia-mobile/MobileCalendar.tsx",
      "components/olivia-mobile/MobileDocuments.tsx",
      "components/olivia-mobile/MobileMemo.tsx",
      "components/olivia-mobile/MobileVoice.tsx",
      "components/olivia-mobile/MobilePhotoWorkspace.tsx",
      "components/olivia-mobile/MobileResourcePreview.tsx",
    ];

    expect(shell).toContain('navigation.view === "preview" || navigation.view === "chat" ? null');
    expect(shell).toContain("onClose={closeOlivia}");
    expect(shell).toContain("window.history.back()");
    expect(conversation).toContain('variant !== "mobile" && exchanges.length >= 4');
    expect(conversation).toContain("if (isMobile) return;");
    for (const screen of nonHomeScreens) expect(read(screen)).not.toContain("<MobileHeader");
  });

  it("uses the installed-PWA safe areas as padding and requests a cover viewport", () => {
    const layout = read("app/layout.tsx");
    const styles = read("components/olivia-mobile/OliviaMobileShell.module.css");

    expect(layout).toContain('viewportFit: "cover"');
    expect(layout).toContain('statusBarStyle: "black-translucent"');
    expect(styles).toContain("safe-area-inset-top");
    expect(styles).toContain("safe-area-inset-bottom");
    expect(styles).toContain("safe-area-inset-left");
    expect(styles).toContain("safe-area-inset-right");
    expect(styles).toContain("bottom: 0;");
    expect(styles).toContain("--mobile-dock-space");
    expect(styles).toContain("height: var(--mobile-dock-space)");
    expect(styles).toContain("var(--mobile-dock-content-padding)");
  });

  it("keeps the dock out of chat, preserves calendar gestures, and leaves page scrolling to the browser", () => {
    const shell = read("components/olivia-mobile/OliviaMobileShell.tsx");
    const calendar = read("components/olivia-mobile/MobileCalendar.tsx");
    const styles = read("components/olivia-mobile/OliviaMobileShell.module.css");

    expect(shell).not.toContain("SWIPEABLE_PRIMARY_VIEWS");
    expect(shell).not.toContain('document.body.style.overflow = "hidden"');
    expect(styles).toContain("position: relative");
    expect(styles).toContain("overflow: visible");
    expect(shell).toContain("navigation.view === \"chat\"");
    expect(calendar).toContain("data-mobile-swipe-lock");
    expect(calendar).toContain("selectedSchedulePanel");
    expect(calendar).toContain('useState<CalendarView>("today")');
    expect(calendar).toContain("calendarEventScreen");
    expect(calendar).toContain("calendarTimelineEvent");
    expect(calendar).toContain('role="switch"');
    expect(calendar).toContain("calendarDateTimeInputs");
    expect(calendar).toContain("calendarPickerField");
    expect(calendar).toContain("formatPickerDate");
    expect(styles).toContain(".calendarPickerField input");
    expect(styles).toContain("opacity: 0");
  });

  it("uses non-destructive pinch zoom and dismissible photo-status cards", () => {
    const preview = read("components/olivia-mobile/MobileResourcePreview.tsx");
    const shell = read("components/olivia-mobile/OliviaMobileShell.tsx");
    const photoNotification = read("components/photo-storage/PhotoProjectNotification.tsx");

    expect(preview).toContain("previewClose");
    expect(preview).not.toContain("previewZoomControls");
    expect(preview).not.toContain("ZoomIn");
    expect(preview).not.toContain("ZoomOut");
    expect(preview).toContain("pinchRef");
    expect(preview).toContain("event.touches.length !== 2");
    expect(preview).toContain('{ passive: false }');
    expect(preview).toContain("clampPreviewZoom");
    expect(preview).toContain("applyPreviewZoom");
    expect(preview).toContain("requestAnimationFrame");
    expect(preview).toContain("previewZoomStage");
    expect(preview).not.toContain("--mobile-preview-zoom");
    expect(shell).toContain("onClose={closePreview}");
    expect(photoNotification).toContain("dismissCurrent");
    expect(photoNotification).toContain('aria-label="오류 알림 닫기"');
    expect(photoNotification).not.toContain('aria-label="알림 닫기" onClick={() => void runAction("defer")}');
  });

  it("supports mobile client detail editing and links to connected documents and device apps", () => {
    const clients = read("components/olivia-mobile/MobileClients.tsx");
    const home = read("components/olivia-mobile/MobileHome.tsx");
    const navigation = read("lib/olivia/mobile/navigation.ts");

    expect(clients).toContain('fetch("/api/clients?scope=list"');
    expect(clients).toContain('fetch(`/api/clients/${encodeURIComponent(clientId)}?${workflowRunId');
    expect(clients).toContain('strictWorkflowRunId=1');
    expect(clients).toContain('workflowMode=client-only');
    expect(clients).toContain('href={`tel:${phoneHref(phone)}`}');
    expect(clients).toContain('href={`sms:${phoneHref(phone)}`}');
    expect(clients).toContain("ClientFormModal");
    expect(clients).toContain('mode="edit"');
    expect(clients).toContain('mode="create"');
    expect(clients).toContain("MobileBottomSheet");
    expect(clients).toContain("onOpenPreview");
    expect(clients).toContain("onOpenConti");
    expect(clients).toContain("onOpenPersonSelect");
    expect(home).toContain('{ id: "clients", label: "고객"');
    expect(navigation).toContain('"clients"');
  });

  it("builds the final mobile home from live resources without persistent empty photo sections", () => {
    const home = read("components/olivia-mobile/MobileHome.tsx");
    const styles = read("components/olivia-mobile/OliviaMobileShell.module.css");

    expect(home).toContain('onNavigate("clients")');
    expect(home).toContain('"photo-workspace"');
    expect(home).toContain('onNavigate("person-select")');
    expect(home).toContain("pendingPhotoCount > 0");
    expect(home).toContain("normalizeMobileDocument");
    expect(home).toContain("normalizeQuoteResource");
    expect(home).toContain("normalizeContractResource");
    expect(home).toContain("uniqueResources");
    expect(home).toContain("slice(0, 2)");
    expect(home).toContain("recentDocumentList");
    expect(home).toContain('navigator.permissions.query({ name: "geolocation" })');
    expect(home).toContain('permission.state !== "granted"');
    expect(home).toContain("personSelectEvents");
    expect(home).toContain("activePersonSelect");
    expect(styles).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(styles).toContain(".pendingPhotoCard");
  });

  it("controls pending photo projects inline without opening Photo Workspace", () => {
    const pending = read("components/olivia-mobile/MobilePhotoPending.tsx");
    const shell = read("components/olivia-mobile/OliviaMobileShell.tsx");
    expect(pending).toContain("sceneClassificationRequirement(project)");
    expect(pending).toContain('runAction(project, "approve")');
    expect(pending).toContain('runAction(project, "defer")');
    expect(pending).toContain('runAction(project, "complete")');
    expect(pending).toContain("사진 파일은 삭제되지 않습니다");
    expect(pending).not.toContain("onOpenProject");
    expect(shell).not.toContain('onOpenProject={() => navigate({ view: "photo-workspace" })}');
  });

  it("uses the existing canonical conti read routes and keeps field completion local", () => {
    const conti = read("components/olivia-mobile/MobileContiFieldView.tsx");
    expect(conti).toContain('"/api/conti/runs?list=1&limit=60"');
    expect(conti).toContain('`/api/conti/runs/${encodeURIComponent(id)}`');
    expect(conti).toContain("localStorage");
    expect(conti).not.toContain('method: "PATCH"');
    expect(conti).toContain("wakeLock");
    expect(conti).toContain("setMode(value)");
    expect(conti).toContain("activeSceneIndex");
    expect(conti).toContain("mobileContiScenePager");
    expect(conti).toContain("scene.patient_role_text");
    expect(conti).not.toContain("advanceMode");
  });
});
