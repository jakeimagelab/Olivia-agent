import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Olivia Bridge RAW 매칭 연결", () => {
  it("RAW 상위 폴더 선택이 현재 작업 폴더와 셀렉 저장소를 다시 설정하지 않는다", () => {
    const source = readFileSync("components/olivia-bridge/useOliviaBridgeFolderActions.ts", "utf8");
    const rawRootHandler = source.slice(
      source.indexOf("const pickRawSearchRoot"),
      source.indexOf("const openRawRootPrompt"),
    );
    expect(rawRootHandler).not.toContain("setCurrentLocalFolder");
    expect(rawRootHandler).toContain("setRawMatchFolderCandidates");
    expect(rawRootHandler).toContain("setRawMatchFolderPath");
  });
});
