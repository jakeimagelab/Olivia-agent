import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("tablet voice interview layout", () => {
  it("keeps the TabletAppFrame as the only page-level vertical scroll owner", () => {
    const tabletVoice = read("components/olivia-tablet/TabletVoice.tsx");
    const appContent = read("components/olivia-tablet/TabletAppContent.tsx");
    const recorder = read("components/voice/OliviaRecorder.tsx");
    const recorderCss = read("components/voice/OliviaRecorder.module.css");

    expect(tabletVoice).toContain("<VoiceInterviewHub embedded tabletShell />");
    expect(tabletVoice).toContain("styles.tabletVoicePage");
    expect(appContent).toContain('case "voice": content = <TabletAppFrame scroll="page">');
    expect(recorder).toContain("tabletShell = false");
    expect(recorder).toContain("styles.tabletEmbedded");
    expect(recorderCss).toContain("TabletAppFramePage is the only vertical scroll owner");
    expect(recorderCss).toMatch(/\.tabletEmbedded\s*\{[^}]*overflow:\s*visible/);
  });

  it("returns the active app scroll owner to the top for interview transitions", () => {
    const hub = read("components/voice/VoiceInterviewHub.tsx");

    expect(hub).toContain("data-tablet-app-frame][data-tablet-scroll-owner='page']");
    expect(hub).toContain('frame?.scrollTo({ top: 0, behavior: "auto" })');
    expect(hub).toContain("editing?.status");
    expect(hub).toContain("tabletShell={tabletShell}");
  });

  it("uses a 34/66 tablet preparation layout with stable question and action areas", () => {
    const css = read("components/voice/VoiceInterviewHub.module.css");

    expect(css).toContain("grid-template-columns: minmax(280px, .34fr) minmax(0, .66fr)");
    expect(css).toMatch(/\.tabletInterviewFrame \.infoCard\s*\{[^}]*position:\s*sticky/);
    expect(css).toMatch(/\.tabletInterviewFrame \.questionPicker > header\s*\{[^}]*position:\s*sticky/);
    expect(css).toContain("min-height: 52px");
    expect(css).toContain("grid-template-columns: 40px 40px");
    expect(css).toMatch(/\.tabletInterviewFrame \.editorActions\s*\{[^}]*position:\s*sticky/);
    expect(css).toMatch(/\.tabletInterviewFrame \.readyCard\s*\{[^}]*position:\s*sticky/);
    expect(css).toContain("@media (max-width: 899px)");
  });

  it("makes the active interview recording question primary through the shared runtime", () => {
    const recorder = read("components/voice/OliviaInterviewRecorder.tsx");
    const css = read("components/voice/OliviaInterviewRecorder.module.css");

    expect(recorder).toContain("tabletShell = false");
    expect(recorder).toContain("styles.tabletRecorder");
    expect(recorder).toContain("실제 녹음 질문");
    expect(recorder).toContain("인터뷰 녹음 중");
    expect(recorder).toContain("이 질문으로 진행");
    expect(recorder).toContain("useVoiceSession");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr) minmax(150px, 1.15fr) minmax(0, 1fr)");
    expect(css).toContain("var(--olivia-visual-viewport-height, 100dvh)");
  });
});
