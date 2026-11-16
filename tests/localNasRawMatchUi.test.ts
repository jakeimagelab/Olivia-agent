import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("로컬 Bridge 셀렉의 NAS RAW 매칭", () => {
  it("자동 탐색 실패를 기다리지 않고 로컬과 NAS 원본 선택을 모두 제공한다", () => {
    const status = readFileSync("components/photo-workspace/SelectMatchStatusViews.tsx", "utf8");
    const workspace = readFileSync("components/photo-workspace/PhotoRawMatchWorkspace.tsx", "utf8");
    const launcher = readFileSync("components/olivia-bridge/useOliviaBridgeToolLaunch.ts", "utf8");
    expect(status).toContain("이 기기에서 찾기");
    expect(status).toContain("NAS에서 찾기");
    expect(status).toContain("nasDisabledReason");
    expect(workspace).toContain("RAW를 어디에서 찾을까요?");
    expect(workspace).toContain("readNasRawMatchPreference");
    expect(launcher).not.toContain("breadcrumbsLength < 3");
  });

  it("NAS 선택이 현재 로컬 Bridge 선택을 바꾸지 않고 RAW-only 워커로 이어진다", () => {
    const workspace = readFileSync("components/photo-workspace/PhotoRawMatchWorkspace.tsx", "utf8");
    const bridge = readFileSync("components/olivia-bridge/OliviaBridgeWorkspace.tsx", "utf8");
    expect(workspace).toContain("resolveBridgeSelectedIdsByName");
    expect(workspace).toContain("rawOnly");
    expect(workspace).toContain('sourceScope="person-select"');
    expect(workspace).toContain('rootLabel="NAS 촬영 폴더"');
    expect(bridge).toContain("initialRemoteJpgs: selectedPhotos");
  });
});
