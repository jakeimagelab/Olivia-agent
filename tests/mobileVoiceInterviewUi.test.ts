import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("mobile voice interview UI", () => {
  it("uses a compact mobile standby screen instead of the desktop standby hero", () => {
    const hub = read("components/voice/VoiceInterviewHub.tsx");
    const standby = read("components/voice/MobileInterviewStandby.tsx");

    expect(hub).toContain("if (mobileShell) return <section className={`${styles.interviewFrame} ${styles.mobileInterviewFrame}`}><MobileInterviewStandby");
    expect(standby).toContain("새 인터뷰 준비");
    expect(standby).toContain("준비된 인터뷰");
    expect(standby).toContain("최근 인터뷰");
    expect(standby).not.toContain("INTERVIEW STANDBY");
    expect(standby).not.toContain("Snapshot");
    expect(read("components/voice/MobileInterviewPreparation.tsx")).not.toContain("Snapshot");
  });

  it("keeps the mobile preparation as three separate steps with a fixed question action bar", () => {
    const preparation = read("components/voice/MobileInterviewPreparation.tsx");
    const styles = read("components/voice/MobileInterviewPreparation.module.css");

    expect(preparation).toContain('"info" | "questions" | "order"');
    expect(preparation).toContain('onStep("questions")');
    expect(preparation).toContain('onStep("order")');
    expect(preparation).toContain("정보 수정");
    expect(preparation).toContain("선택 질문 확인");
    expect(styles).toContain("position:fixed");
    expect(styles).toContain("bottom:calc(var(--mobile-dock-space,62px) + 8px)");
  });

  it("makes the mobile interview root independently scrollable above the dock", () => {
    const styles = read("components/voice/VoiceInterviewHub.module.css");

    expect(styles).toContain(".mobileInterviewFrame");
    expect(styles).toContain("overflow-y:auto");
    expect(styles).toContain("overscroll-behavior:contain");
  });
});
