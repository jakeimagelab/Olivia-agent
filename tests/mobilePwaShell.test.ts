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
    expect(styles).toContain('.chatScreen[data-keyboard-open="true"] .chatDock');
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

    expect(shell).toContain('navigation.view === "preview" ? null');
    expect(shell).toContain("keyboardOpen={navigation.view === \"chat\" && chatKeyboardOpen}");
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
    expect(styles).toContain("height: calc(62px + env(safe-area-inset-bottom, 0px))");
  });
});
