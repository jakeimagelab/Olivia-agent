import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { parseClassificationOptions, runPhotoClassifyWork } from "@/lib/photo-classifier/node/photoClassifyWork";
import type { MedicalDepartment } from "@/lib/photo-classifier/types";

const tempRoots: string[] = [];

async function writeJpg(filePath: string, color = "#155855"): Promise<void> {
  await sharp({ create: { width: 32, height: 24, channels: 3, background: color } }).jpeg().toFile(filePath);
}

async function setup(projectFolderName: string) {
  const base = await mkdtemp(path.join(os.tmpdir(), "olivia-photo-classify-"));
  tempRoots.push(base);
  const roots = { sourceRoot: path.join(base, "ssd1"), workRoot: path.join(base, "ssd2") };
  // 실제 PHASE 3 레이아웃: <workRoot>/<프로젝트폴더>/JPG전체/*.JPG (+ .olivia/copy-manifest.json)
  const project = path.join(roots.workRoot, projectFolderName);
  const jpgIntegrated = path.join(project, "JPG전체");
  await mkdir(jpgIntegrated, { recursive: true });
  await writeJpg(path.join(jpgIntegrated, "A001.JPG"));
  await writeJpg(path.join(jpgIntegrated, "A002.JPG"), "#E85D2C");
  const manifestDirectory = path.join(project, ".olivia");
  await mkdir(manifestDirectory, { recursive: true });
  await writeFile(path.join(manifestDirectory, "copy-manifest.json"), JSON.stringify({ status: "COPY_COMPLETED" }));
  return { roots, project, jpgIntegrated };
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const baseOptions = {
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

// 자동 분류는 키 없이 "기타" 성공으로 끝나면 안 된다. 성공 경로 테스트는 외부 호출 대신
// 대표 프레임 분석기를 명시적으로 주입한다.
const testAi = {
  scene: async (input: { department: MedicalDepartment; sceneId: string }) => ({
    department: input.department,
    sceneId: input.sceneId,
    sceneType: "treatment" as const,
    displayName: "연출",
    suggestedFolderName: "연출",
    confidence: 0.95,
    detectedCues: ["인물"],
    negativeCues: [],
    reason: "테스트 판정",
    needsReview: false,
    patientPosture: "standing" as const,
    hasHandpiece: false,
    hasTreatmentDevice: false,
    hasTreatmentBed: false,
    hasConsultationDesk: false,
  }),
};

describe("SSD2 PHOTO_CLASSIFY_WORK adapter", () => {
  it("keeps classification options instead of hardcoding AI naming", () => {
    expect(parseClassificationOptions({ ai_naming_enabled: false }).aiNamingEnabled).toBe(false);
    expect(parseClassificationOptions({ ai_naming_enabled: true }).aiNamingEnabled).toBe(true);
    expect(parseClassificationOptions({ gap_minutes: 3.5 }).gapMinutes).toBe(3.5);
  });

  it("reads JPG전체 (not the project folder root) and leaves it byte-for-byte untouched", async () => {
    const { roots, project, jpgIntegrated } = await setup("0914_test");
    const before = await Promise.all(["A001.JPG", "A002.JPG"].map((name) => stat(path.join(jpgIntegrated, name))));

    const result = await runPhotoClassifyWork({ roots, workRelativePath: "0914_test", ...baseOptions }, { ai: testAi });

    expect(result).toMatchObject({ ok: true, status: "CLASSIFY_COMPLETED", jpgCount: 2, sceneCount: 1 });

    // JPG전체는 읽기 전용 — 파일 수·이름·크기가 분류 전과 100% 동일해야 한다.
    const after = await Promise.all(["A001.JPG", "A002.JPG"].map((name) => stat(path.join(jpgIntegrated, name))));
    expect(after.map((s) => s.size)).toEqual(before.map((s) => s.size));
    expect(await readdir(jpgIntegrated)).toEqual(["A001.JPG", "A002.JPG"]);

    // 씬별분류/<Scene>/ 아래에 같은 파일명이 그대로 존재해야 한다(복사, 이동 아님).
    const sceneRoot = path.join(project, "씬별분류");
    const sceneFolders = (await readdir(sceneRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name !== "_REPORT");
    expect(sceneFolders).toHaveLength(1);
    const classified = await readdir(path.join(sceneRoot, sceneFolders[0].name));
    expect(classified.sort()).toEqual(["A001.JPG", "A002.JPG"]);
    expect((await readFile(path.join(sceneRoot, sceneFolders[0].name, "A001.JPG"))).length).toBeGreaterThan(0);
  });

  it("does NOT falsely report CLASSIFY_COMPLETED on the first run even when expected_jpg_count/bytes match (0-1 regression)", async () => {
    // PHASE 3의 실제 산출물은 <project>/JPG전체/*.JPG다 — 이 nested 경로를 보고
    // "이미 완료됨"으로 착각해 Scene Engine을 건너뛰던 버그의 회귀 테스트.
    const { roots, jpgIntegrated } = await setup("0915_회귀테스트");
    const files = await readdir(jpgIntegrated);
    const totalBytes = (await Promise.all(files.map((name) => stat(path.join(jpgIntegrated, name))))).reduce((sum, s) => sum + s.size, 0);

    const result = await runPhotoClassifyWork({
      roots,
      workRelativePath: "0915_회귀테스트",
      expectedJpgCount: files.length,
      expectedJpgBytes: totalBytes,
      ...baseOptions,
    }, { ai: testAi });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sceneCount).toBeGreaterThan(0); // Scene Engine이 실제로 돌았다는 증거 — 0이면 거짓 완료
  });

  it("supports project folder names with spaces, Korean, and long text", async () => {
    const projectName = "0915 강남 프리미엄 클리닉 촬영본 매우 긴 프로젝트 이름 테스트";
    const { roots } = await setup(projectName);
    const result = await runPhotoClassifyWork({ roots, workRelativePath: projectName, ...baseOptions }, { ai: testAi });
    expect(result).toMatchObject({ ok: true, status: "CLASSIFY_COMPLETED", jpgCount: 2 });
  });

  it("classifies each nested JPG전체 folder as an independent bundle", async () => {
    const { roots, jpgIntegrated } = await setup("0914_nested");
    await mkdir(path.join(jpgIntegrated, "sub"), { recursive: true });
    await writeJpg(path.join(jpgIntegrated, "sub", "A003.JPG"), "#FFFFFF");
    const result = await runPhotoClassifyWork({ roots, workRelativePath: "0914_nested", ...baseOptions }, { ai: testAi });
    expect(result).toMatchObject({ ok: true, status: "CLASSIFY_COMPLETED", jpgCount: 3 });
    await expect(stat(path.join(roots.workRoot, "0914_nested", "씬별분류", "sub"))).resolves.toBeTruthy();
  });

  it("판정은 사진별로 하고 하위 폴더 결과를 서로 섞지 않는다", async () => {
    const { roots, project, jpgIntegrated } = await setup("0923_연세라이프구강내과");
    await mkdir(path.join(jpgIntegrated, "1차촬영"), { recursive: true });
    await mkdir(path.join(jpgIntegrated, "2차(프로필)"), { recursive: true });
    await writeJpg(path.join(jpgIntegrated, "1차촬영", "DIRECTED.JPG"));
    await writeJpg(path.join(jpgIntegrated, "1차촬영", "INTERIOR.JPG"), "#FFFFFF");
    await writeJpg(path.join(jpgIntegrated, "2차(프로필)", "PROFILE.JPG"), "#E85D2C");
    const ai = {
      scene: async (input: { department: MedicalDepartment; sceneId: string; images: Array<{ fileName: string }> }) => {
        const name = input.images[0]?.fileName ?? "";
        const kind = name.includes("PROFILE") ? "profile" : name.includes("INTERIOR") ? "interior" : "treatment";
        return {
          department: input.department, sceneId: input.sceneId, sceneType: kind as "profile" | "interior" | "treatment",
          displayName: kind, suggestedFolderName: kind, confidence: 0.95, detectedCues: [], negativeCues: [], reason: "테스트", needsReview: false,
          patientPosture: "unclear" as const, hasHandpiece: false, hasTreatmentDevice: false, hasTreatmentBed: false, hasConsultationDesk: false,
        };
      },
    };

    const result = await runPhotoClassifyWork({ roots, workRelativePath: "0923_연세라이프구강내과", ...baseOptions }, { ai });
    expect(result).toMatchObject({ ok: true, jpgCount: 5 });
    const output = path.join(project, "씬별분류");
    await expect(stat(path.join(output, "1차촬영", "연출", "DIRECTED.JPG"))).resolves.toBeTruthy();
    await expect(stat(path.join(output, "1차촬영", "인테리어", "INTERIOR.JPG"))).resolves.toBeTruthy();
    await expect(stat(path.join(output, "2차(프로필)", "프로필", "PROFILE.JPG"))).resolves.toBeTruthy();
    await expect(stat(path.join(output, "1차촬영", "프로필", "PROFILE.JPG"))).rejects.toThrow();
  });

  it("AI가 모든 사진을 판정하지 못하면 기타 성공으로 끝내지 않는다", async () => {
    const { roots } = await setup("all-unknown");
    const result = await runPhotoClassifyWork({ roots, workRelativePath: "all-unknown", ...baseOptions }, {
      ai: { scene: async () => { throw new Error("AI unavailable"); } },
    });
    expect(result).toMatchObject({ ok: false, status: "CLASSIFY_FAILED" });
    expect(result.ok ? "" : result.error).toContain("자동으로 판정하지 못했습니다");
  });

  it("fails clearly when JPG전체 does not exist yet (merge not completed)", async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), "olivia-photo-classify-"));
    tempRoots.push(base);
    const roots = { sourceRoot: path.join(base, "ssd1"), workRoot: path.join(base, "ssd2") };
    await mkdir(path.join(roots.workRoot, "0914_no_merge"), { recursive: true });
    const result = await runPhotoClassifyWork({ roots, workRelativePath: "0914_no_merge", ...baseOptions }, { ai: testAi });
    expect(result).toMatchObject({ ok: false, status: "CLASSIFY_FAILED" });
  });

  it("recovers as CLASSIFY_COMPLETED on crash-recovery when 씬별분류 already matches JPG전체 exactly", async () => {
    const { roots, project, jpgIntegrated } = await setup("0914_recover");
    const sceneRoot = path.join(project, "씬별분류");
    await mkdir(path.join(sceneRoot, "01_기타"), { recursive: true });
    await writeFile(path.join(sceneRoot, "01_기타", "A001.JPG"), await readFile(path.join(jpgIntegrated, "A001.JPG")));
    await writeFile(path.join(sceneRoot, "01_기타", "A002.JPG"), await readFile(path.join(jpgIntegrated, "A002.JPG")));
    void jpgIntegrated;

    const result = await runPhotoClassifyWork({ roots, workRelativePath: "0914_recover", ...baseOptions });
    expect(result).toMatchObject({ ok: true, status: "CLASSIFY_COMPLETED", sceneCount: 1 });
  });

  it("reports REVIEW_REQUIRED (not a silent success) when a crash leaves partial/duplicated output, and does not delete it", async () => {
    const { roots, project } = await setup("0914_partial");
    const sceneRoot = path.join(project, "씬별분류");
    await mkdir(path.join(sceneRoot, "01_기타"), { recursive: true });
    await writeFile(path.join(sceneRoot, "01_기타", "A001.JPG"), await readFile(path.join(project, "JPG전체", "A001.JPG")));
    // A002.JPG는 아직 복사되지 않은 상태 — 부분 결과.

    const result = await runPhotoClassifyWork({ roots, workRelativePath: "0914_partial", ...baseOptions });
    expect(result).toMatchObject({ ok: false, status: "REVIEW_REQUIRED" });
    // 부분 결과는 삭제하지 않는다.
    expect((await readFile(path.join(sceneRoot, "01_기타", "A001.JPG"))).length).toBeGreaterThan(0);
  });
});
