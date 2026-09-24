import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { preparePrimaryPhotoProject } from "@/lib/photo-classifier/node/sourceProjectPrep";
import { stageProjectJpgToWorkStorage } from "@/lib/photo-classifier/node/photoJpgStager";
import { runPhotoClassifyWork } from "@/lib/photo-classifier/node/photoClassifyWork";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

// fastAnalyzeMode + 모든 AI 플래그 off = Scene Engine이 AI/이미지 디코딩을 전혀 호출하지 않는다
// (기존 테스트 스위트 전반의 관례와 동일) — 이 테스트의 목적은 Scene 판정 품질이 아니라
// 1차 승인(JPG 통합) → 2차 승인(COPY) → 분류 세 함수가 실제로 손을 맞물려 넘기는지다.
const classifyOptions = {
  shootingMode: "field" as const,
  department: "dermatology" as const,
  gapMinutes: 3.5,
  classificationUiMode: "ai-auto" as const,
  fastAnalyzeMode: true,
  departmentLogicEnabled: false,
  aiNamingEnabled: false,
  qualityAnalysisEnabled: false,
  profileClassificationEnabled: false,
  // 테스트 결과가 개발 머신의 실제 남은 디스크 용량에 좌우되지 않게 한다.
  minFreeBytes: 0,
};

describe("올리비아 사진 파이프라인 end-to-end (JPG 통합 -> 복사 -> 분류)", () => {
  it("실제 SSD1/SSD2 레이아웃을 재현해 전체 파이프라인을 연속 호출한다", async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), "olivia-photo-e2e-"));
    tempRoots.push(base);
    const roots = { sourceRoot: path.join(base, "ssd1"), workRoot: path.join(base, "ssd2") };
    await mkdir(roots.sourceRoot, { recursive: true });
    await mkdir(roots.workRoot, { recursive: true });

    const projectName = "0915_포토클리닉";
    const ssd1Project = path.join(roots.sourceRoot, projectName);
    await mkdir(ssd1Project, { recursive: true });
    // 카메라 백업 직후 상태: RAW/JPG가 나란히 섞여 있다.
    await writeFile(path.join(ssd1Project, "A001.ARW"), "raw-1");
    await writeFile(path.join(ssd1Project, "A002.ARW"), "raw-2");
    await writeFile(path.join(ssd1Project, "A001.JPG"), "jpg-1");
    await writeFile(path.join(ssd1Project, "A002.JPG"), "jpg-2");

    // 1차 승인: SSD1 안에서 JPG만 JPG전체로 통합. RAW는 절대 움직이지 않는다.
    const mergeResult = await preparePrimaryPhotoProject(projectName, { roots });
    expect(mergeResult).toMatchObject({ jpgMoved: 2, status: "JPG_MERGE_COMPLETED" });
    await expect(readFile(path.join(ssd1Project, "A001.ARW"), "utf8")).resolves.toBe("raw-1");
    await expect(readFile(path.join(ssd1Project, "A002.ARW"), "utf8")).resolves.toBe("raw-2");
    const ssd1JpgIntegrated = path.join(ssd1Project, "JPG전체");
    await expect(readFile(path.join(ssd1JpgIntegrated, "A001.JPG"), "utf8")).resolves.toBe("jpg-1");

    // 2차 승인 1단계: SSD1/JPG전체 -> SSD2/JPG전체 COPY. SSD1은 그대로 남는다.
    const copyResult = await stageProjectJpgToWorkStorage({ sourceRelativePath: projectName, roots, minFreeBytes: 0 });
    expect(copyResult).toMatchObject({ ok: true, status: "COPY_COMPLETED", copiedCount: 2 });
    await expect(readFile(path.join(ssd1JpgIntegrated, "A001.JPG"), "utf8")).resolves.toBe("jpg-1");
    const ssd2JpgIntegrated = path.join(roots.workRoot, projectName, "JPG전체");
    await expect(readFile(path.join(ssd2JpgIntegrated, "A002.JPG"), "utf8")).resolves.toBe("jpg-2");

    // 2차 승인 2단계(승인 없이 자동 연결): SSD2/JPG전체를 읽기 전용으로 분류해 씬별분류/에 복사한다.
    const classifyResult = await runPhotoClassifyWork({ roots, workRelativePath: projectName, ...classifyOptions });
    expect(classifyResult).toMatchObject({ ok: true, status: "CLASSIFY_COMPLETED", jpgCount: 2 });
    if (!classifyResult.ok) throw new Error("unreachable");
    expect(classifyResult.sceneCount).toBeGreaterThan(0);

    // 분류 후에도 SSD2 JPG전체는 100% 그대로다(이동·삭제 없음).
    expect(await readdir(ssd2JpgIntegrated)).toEqual(["A001.JPG", "A002.JPG"]);
    await expect(readFile(path.join(ssd2JpgIntegrated, "A001.JPG"), "utf8")).resolves.toBe("jpg-1");

    // 씬별분류 하위 JPG 총 수가 JPG전체와 일치해야 한다(복사로 전량 복제).
    const sceneRoot = path.join(roots.workRoot, projectName, "씬별분류");
    const sceneFolders = (await readdir(sceneRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name !== "_REPORT");
    const classifiedFiles = (await Promise.all(sceneFolders.map((folder) => readdir(path.join(sceneRoot, folder.name))))).flat();
    expect(classifiedFiles.sort()).toEqual(["A001.JPG", "A002.JPG"]);

    // RAW는 SSD1에만 있고 SSD2 어디에도 만들어지지 않는다.
    await expect(stat(path.join(roots.workRoot, projectName, "A001.ARW"))).rejects.toThrow();
  });
});
