import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PHOTO_WORKSPACE_TABS } from "@/components/photo-workspace/PhotoWorkspaceTabs";
import { resolvePhotoWorkspaceToolState } from "@/components/photo-workspace/photoWorkspaceToolState";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("사진 작업실 역할 분리", () => {
  it("keeps the seven top-level tools in the operational order", () => {
    expect(PHOTO_WORKSPACE_TABS.map((tab) => tab.title)).toEqual([
      "사진 셀렉",
      "RAW 매칭",
      "사진 분류",
      "T컷 정리",
      "사진 리사이즈",
      "이름변경",
      "사진 보정",
    ]);
  });

  it("maps legacy AI 컷 links to the dedicated T컷 tab, never the RAW tab", () => {
    expect(resolvePhotoWorkspaceToolState("ai-cull")).toMatchObject({ mode: "t-cut" });
    expect(resolvePhotoWorkspaceToolState("metadata-match")).toMatchObject({ mode: "raw-match", rawMatchMethod: "metadata" });
  });

  it("keeps T컷 transfer scoped to JPG and Trash_JPG only", () => {
    const tcut = source("components/photo-workspace/PhotoTcutWorkspace.tsx");
    expect(tcut).toContain("METADATA_SELECT_JPG_EXTENSIONS");
    expect(tcut).toContain('"Trash_JPG"');
    expect(tcut).not.toContain("Selected_RAW");
    expect(tcut).not.toContain("RAW Original");
  });

  it("stores a selected JPG list separately for RAW matching", () => {
    const execution = source("components/photo-workspace/PhotoStudioExecutionContext.tsx");
    const select = source("components/photo-workspace/PhotoSelectWorkspace.tsx");
    const raw = source("components/photo-workspace/PhotoRawMatchWorkspace.tsx");
    expect(execution).toContain("selectedJpgNames");
    expect(select).toContain("setSelectedJpgNames");
    expect(raw).toContain("selectedJpgNames");
  });

  it("allows RAW matching to start directly when no photo selection is stored", () => {
    const raw = source("components/photo-workspace/PhotoRawMatchWorkspace.tsx");
    expect(raw).toContain("사진 셀렉을 거치지 않아도 됩니다");
    expect(raw).not.toContain("선택된 JPG 목록이 없습니다");
  });

  it("keeps a T컷-picked folder local and separates previewing from Trash selection", () => {
    const tcut = source("components/photo-workspace/PhotoTcutWorkspace.tsx");
    expect(tcut).toContain("const [activeRoot, setActiveRoot]");
    expect(tcut).not.toContain("setCurrentLocalFolder");
    expect(tcut).toContain("className={styles.previewButton}");
    expect(tcut).toContain("aria-label={`${photo.name} 크게 보기`}");
    expect(tcut).toContain("T컷 이동 대상으로 선택");
  });

  it("limits rename to the shared current folder, without another folder picker", () => {
    const rename = source("components/photo-workspace/PhotoRenameWorkspace.tsx");
    expect(rename).toContain('const transferMode: RenameTransferMode = "same-folder"');
    expect(rename).not.toContain("showDirectoryPicker");
    expect(rename).not.toContain("setCurrentLocalFolder");
    expect(rename).not.toContain("if (!rootDir) {\n    return");
    expect(rename).toContain("사진 셀렉 또는 사진 분류에서 작업 폴더를 지정하면");
  });
});
