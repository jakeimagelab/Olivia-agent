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
    expect(shell).toContain('onClose={() => navigate({ view: "home" }, "replace")}');
    expect(conversation).toContain('variant !== "mobile" && exchanges.length >= 4');
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

  it("keeps the dock out of the chat and protects calendar gestures while enabling primary-tab swipes", () => {
    const shell = read("components/olivia-mobile/OliviaMobileShell.tsx");
    const calendar = read("components/olivia-mobile/MobileCalendar.tsx");

    expect(shell).toContain("SWIPEABLE_PRIMARY_VIEWS");
    expect(shell).toContain("IOS_BACK_GESTURE_EDGE_PX");
    expect(shell).toContain("onPointerDown={onSwipePointerDown}");
    expect(shell).toContain("onPointerMove={onSwipePointerMove}");
    expect(shell).toContain("setPointerCapture");
    expect(shell).toContain("SWIPE_FLING_VELOCITY_PX_PER_MS");
    expect(shell).toContain("SWIPE_COMPLETION_RATIO");
    expect(shell).toContain("swipeTrack");
    expect(shell).toContain("finishSwipe");
    expect(shell).toContain("swipe.axis === \"vertical\"");
    expect(shell).toContain("navigation.view === \"chat\"");
    expect(calendar).toContain("data-mobile-swipe-lock");
    expect(calendar).toContain("selectedSchedulePanel");
  });

  it("keeps mobile client management read-only and links to the device phone and message apps", () => {
    const clients = read("components/olivia-mobile/MobileClients.tsx");
    const home = read("components/olivia-mobile/MobileHome.tsx");
    const navigation = read("lib/olivia/mobile/navigation.ts");

    expect(clients).toContain('fetch("/api/clients?scope=list"');
    expect(clients).toContain('fetch(`/api/clients/${encodeURIComponent(clientId)}`');
    expect(clients).toContain('href={`tel:${phoneHref(phone)}`}');
    expect(clients).toContain('href={`sms:${phoneHref(phone)}`}');
    expect(clients).not.toContain('method: "POST"');
    expect(clients).not.toContain('method: "PATCH"');
    expect(clients).not.toContain('method: "DELETE"');
    expect(home).toContain('{ id: "clients", label: "고객관리"');
    expect(navigation).toContain('"clients"');
  });

  it("uses the existing canonical conti read routes and keeps field completion local", () => {
    const conti = read("components/olivia-mobile/MobileContiFieldView.tsx");
    expect(conti).toContain('"/api/conti/runs?list=1&limit=60"');
    expect(conti).toContain('`/api/conti/runs/${encodeURIComponent(id)}`');
    expect(conti).toContain("localStorage");
    expect(conti).not.toContain('method: "PATCH"');
    expect(conti).toContain("wakeLock");
    expect(conti).toContain("current === 1 ? 4 : current === 4 ? 8 : 1");
  });
});
