import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as rawMatchFileAttributes from "@/lib/selectMatch/node/rawMatchFileAttributes";
import {
  copyOrMovePreservingMetadata,
  executeRemoteRawMatchCopy,
  readFileAttributeSnapshot,
  verifyFileAttributeSnapshot,
} from "@/lib/selectMatch/node/rawMatchCopy";
import { resolveDestinationDirectory, resolveWorkerRawRootNearJpg, resolveWorkerRootByLocator, resolveWorkerRootFromRemoteSelection } from "@/lib/selectMatch/node/rawMatchPathResolution";
import { remoteRawMatchRunDisabledReason, runRemoteRawMatchCopy } from "@/lib/selectMatch/remoteRawMatch";

const execFileAsync = promisify(execFile);
const temporaryRoots: string[] = [];

function snapshot(input: Partial<Awaited<ReturnType<typeof readFileAttributeSnapshot>>> = {}) {
  return {
    size: 10,
    mtimeSeconds: 100,
    birthtimeSeconds: 200,
    device: 1,
    xattrs: {},
    ...input,
  };
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "olivia-raw-worker-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("RAW 속성 비교 허용 범위", () => {
  it("mtime 1초 차이는 통과하고 3초 차이는 실패한다", () => {
    expect(verifyFileAttributeSnapshot(snapshot(), snapshot({ mtimeSeconds: 101 })).ok).toBe(true);
    expect(verifyFileAttributeSnapshot(snapshot(), snapshot({ mtimeSeconds: 103 }))).toMatchObject({ ok: false, reasons: ["수정일 불일치"] });
  });

  it("일반 확장속성 차이는 경고만 남기고 통과한다", () => {
    const result = verifyFileAttributeSnapshot(
      snapshot({ xattrs: { "com.apple.lastuseddate#PS": "aa" } }),
      snapshot({ xattrs: { "com.apple.lastuseddate#PS": "bb" } }),
    );
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual(["확장속성 차이: com.apple.lastuseddate#PS"]);
  });

  it("원본에 없던 quarantine 또는 WhereFroms가 생기면 실패한다", () => {
    expect(verifyFileAttributeSnapshot(snapshot(), snapshot({ xattrs: { "com.apple.quarantine": "added" } })).ok).toBe(false);
    expect(verifyFileAttributeSnapshot(snapshot(), snapshot({ xattrs: { "com.apple.metadata:kMDItemWhereFroms": "added" } })).ok).toBe(false);
  });
});

describe("RAW 매칭 실행 가능 조건", () => {
  it("확정 1장 이상과 워커 연결만을 버튼 조건으로 사용한다", () => {
    expect(remoteRawMatchRunDisabledReason(12, true)).toBeNull();
    expect(remoteRawMatchRunDisabledReason(0, true)).toContain("확정된 RAW");
    expect(remoteRawMatchRunDisabledReason(12, false)).toContain("워커");
  });
});

describe("Mac Studio RAW 폴더 자동 탐색", () => {
  it("볼륨까지 지정한 RAW는 그 경로만 확인하고 다른 볼륨의 동일한 파일로 대체하지 않는다", async () => {
    const root = path.join(await temporaryRoot(), "Volumes");
    const archive = path.join(root, "Seagate", "2026", "Project", "R5");
    const workstation = path.join(root, "Workstation", "Project", "R5");
    for (const directory of [archive, workstation]) {
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, "A.ARW"), "raw");
    }
    const locator = { projectKey: "Project", folderName: "R5", relativePath: "Volumes/Seagate/2026/Project/R5", kind: "raw" } as const;
    const samples = [{ relativePath: "A.ARW", expectedSize: 3, expectedCaptureTimeMs: null }];
    await expect(resolveWorkerRootByLocator(locator, [root], "RAW 원본 폴더", samples)).resolves.toBe(await realpath(archive));
    await rm(archive, { recursive: true });
    await expect(resolveWorkerRootByLocator(locator, [root], "RAW 원본 폴더", samples)).rejects.toThrow(/Seagate/u);
  });

  it("JPG 폴더와 상위 두 단계에서만 RAW 표본을 확인한다", async () => {
    const root = await realpath(await temporaryRoot());
    const project = path.join(root, "project");
    const exports = path.join(project, "exports");
    const jpgFolder = path.join(exports, "JPG");
    await mkdir(jpgFolder, { recursive: true });
    for (const directory of [root, project, exports, jpgFolder]) {
      await writeFile(path.join(directory, "A.ARW"), "raw");
    }
    const samples = [{ relativePath: "A.ARW", expectedSize: 3, expectedCaptureTimeMs: null }];
    const resolve = (folder: string) => resolveWorkerRawRootNearJpg(jpgFolder, {
      projectKey: "project", folderName: path.basename(folder), kind: "raw",
    }, [root], samples);
    await expect(resolve(jpgFolder)).resolves.toBe(jpgFolder);
    await expect(resolve(exports)).resolves.toBe(exports);
    await expect(resolve(project)).resolves.toBe(project);
    await expect(resolve(root)).rejects.toThrow(/상위 두 단계/u);
  });

  it("SMB 재마운트 이름만 보정하고 프로젝트의 숫자 접미사는 그대로 비교한다", async () => {
    const mounts = path.join(await temporaryRoot(), "Volumes");
    const jpgFolder = path.join(mounts, "Disk-1", "Project-2", "JPG");
    await mkdir(jpgFolder, { recursive: true });
    await writeFile(path.join(jpgFolder, "A.JPG"), "jpg");
    const locator = { projectKey: "Project-2", folderName: "JPG", kind: "jpg" } as const;
    const samples = [{ relativePath: "A.JPG", expectedSize: 3, expectedCaptureTimeMs: null }];
    const resolve = (relativePath: string) => resolveWorkerRootByLocator({ ...locator, relativePath }, [mounts], "JPG 기준 폴더", samples, { requirePathHint: true });
    await expect(resolve("Disk/Project-2/JPG")).resolves.toBe(await realpath(jpgFolder));
    await expect(resolve("Disk/Project-1/JPG")).rejects.toThrow(/찾지 못했습니다/u);
  });

  it("결과 폴더 경로가 링크라면 다른 경로에 하위 폴더를 만들기 전에 멈춘다", async () => {
    const root = await realpath(await temporaryRoot());
    const selected = path.join(root, "selected");
    const unrelated = path.join(root, "unrelated");
    await Promise.all([mkdir(selected), mkdir(unrelated)]);
    await symlink(unrelated, path.join(selected, "Selected_RAW"));
    await expect(resolveDestinationDirectory(selected, "Selected_RAW/scene", "RAW 결과 폴더")).rejects.toThrow(/안전한 폴더/u);
    await expect(stat(path.join(unrelated, "scene"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("같은 JPG가 여러 저장소에 있으면 복사나 이동 전에 멈춘다", async () => {
    const mounts = path.join(await temporaryRoot(), "Volumes");
    const volumes = ["FirstDisk", "SecondDisk"].map((name) => path.join(mounts, name, "project", "R5"));
    for (const root of volumes) {
      await mkdir(root, { recursive: true });
      await writeFile(path.join(root, "A.JPG"), "jpg");
      await writeFile(path.join(root, "A.ARW"), "raw");
    }
    await expect(executeRemoteRawMatchCopy({
      jpgRoot: { projectKey: "R5", folderName: "R5", relativePath: "R5", kind: "jpg" },
      rawRoot: { projectKey: "R5", folderName: "R5", kind: "raw" },
      rawRootRelation: { parentSteps: 0 },
      items: [{ rawPath: "A.ARW", destDir: "Selected_RAW", rawExpectedSize: 3, rawExpectedCaptureTimeMs: null,
        jpgPath: "A.JPG", jpgExpectedSize: 3, jpgExpectedCaptureTimeMs: null }],
      logRows: [],
    }, { allowedRoots: [mounts] })).rejects.toThrow(/JPG 기준 폴더.*후보가 여러 곳/u);
    for (const root of volumes) {
      await expect(stat(path.join(root, "Selected_RAW"))).rejects.toMatchObject({ code: "ENOENT" });
    }
  });

  it("NFD 폴더와 SMB 재마운트 이름을 표본 2개로 찾고 프로젝트별로 캐시한다", async () => {
    const root = await temporaryRoot();
    const mount = path.join(root, "Agentstation-1");
    const projectName = "1114_서울예방치과교실";
    const nfdProjectName = projectName.normalize("NFD");
    const rawRoot = path.join(mount, "촬영", nfdProjectName);
    await mkdir(rawRoot, { recursive: true });
    await writeFile(path.join(rawRoot, "A.CR2"), "raw-a");
    await writeFile(path.join(rawRoot, "B.CR2"), "raw-b");
    const a = await stat(path.join(rawRoot, "A.CR2"));
    const b = await stat(path.join(rawRoot, "B.CR2"));
    const cacheFilePath = path.join(root, "state", "raw-match-root-cache.json");

    const resolved = await resolveWorkerRootByLocator({
      projectKey: "seoul-preventive-dentistry",
      folderName: projectName,
      relativePath: `촬영/${projectName}`,
      kind: "raw",
    }, [root], "RAW 원본 폴더", [
      { relativePath: "A.CR2", expectedSize: a.size, expectedCaptureTimeMs: null },
      { relativePath: "B.CR2", expectedSize: b.size, expectedCaptureTimeMs: null },
    ], { cacheFilePath });

    expect(resolved).toBe(await realpath(rawRoot));
    expect(await readFile(cacheFilePath, "utf8")).toContain("seoul-preventive-dentistry");
  });

  it("폴더를 찾지 못하면 폴더 이름과 찾은 후보를 오류에 남긴다", async () => {
    const root = await temporaryRoot();
    const candidate = path.join(root, "JPG전체", "단체사진");
    await mkdir(candidate, { recursive: true });
    await writeFile(path.join(candidate, "A.JPG"), "wrong-size");

    await expect(resolveWorkerRootByLocator({
      projectKey: "seoul-preventive-dentistry",
      folderName: "단체사진",
      relativePath: "JPG전체/단체사진",
      kind: "jpg",
    }, [root], "JPG 기준 폴더", [
      { relativePath: "A.JPG", expectedSize: 1, expectedCaptureTimeMs: null },
    ])).rejects.toThrow(/JPG 기준 폴더.*단체사진.*찾은 후보/u);
  });

  it("NAS 선택기의 root-N 경로를 표본 JPG 없이 실제 촬영 폴더로 연다", async () => {
    const root = await temporaryRoot();
    const project = path.join(root, "1116_프로젝트");
    await mkdir(project);
    const previous = process.env.OLIVIA_PERSON_SELECT_ROOTS;
    process.env.OLIVIA_PERSON_SELECT_ROOTS = JSON.stringify([root]);
    try {
      await expect(resolveWorkerRootFromRemoteSelection({
        projectKey: "root-0/1116_프로젝트",
        folderName: "1116_프로젝트",
        relativePath: "root-0/1116_프로젝트",
        kind: "raw",
      }, [root], "NAS 촬영 폴더")).resolves.toBe(await realpath(project));
    } finally {
      if (previous === undefined) delete process.env.OLIVIA_PERSON_SELECT_ROOTS;
      else process.env.OLIVIA_PERSON_SELECT_ROOTS = previous;
    }
  });
});

describe("RAW 전체 실패 판정", () => {
  it("원본과 다른 기존 파일 때문에 0장 처리되면 완료 결과를 반환하지 않는다", async () => {
    const root = await temporaryRoot();
    const rawRoot = path.join(root, "RAW");
    const destinationDirectory = path.join(rawRoot, "Selected_RAW");
    await mkdir(destinationDirectory, { recursive: true });
    const source = path.join(rawRoot, "collision.CR2");
    await writeFile(source, "source");
    await writeFile(path.join(destinationDirectory, "collision.CR2"), "different-existing-file");
    const sourceStat = await stat(source);

    await expect(executeRemoteRawMatchCopy({
      rawRootPath: rawRoot,
      items: [{
        rawPath: "collision.CR2",
        destDir: "Selected_RAW",
        rawExpectedSize: sourceStat.size,
        rawExpectedCaptureTimeMs: null,
      }],
      logRows: [],
    }, { allowedRoots: [root] })).rejects.toThrow("RAW 복사가 모두 실패했습니다");
  });
});

describe.runIf(process.platform === "darwin")("Mac Studio RAW 속성 보존 복사", () => {
  it("같은 이름·크기·수정일이어도 내용이 다른 JPG는 양쪽 모두 보존한다", async () => {
    const root = await temporaryRoot();
    const destinationDirectory = path.join(root, "1차보정본");
    await mkdir(destinationDirectory);
    const source = path.join(root, "A.JPG");
    const destination = path.join(destinationDirectory, "A.JPG");
    await Promise.all([writeFile(source, "alpha"), writeFile(destination, "omega")]);
    const time = new Date("2026-11-14T10:00:00Z");
    await Promise.all([utimes(source, time, time), utimes(destination, time, time)]);
    await expect(copyOrMovePreservingMetadata({ source, destinationDirectory, move: true })).rejects.toThrow(/같은 이름의 다른 파일/u);
    await expect(readFile(source, "utf8")).resolves.toBe("alpha");
    await expect(readFile(destination, "utf8")).resolves.toBe("omega");
  });

  it("이동할 파일이 이미 해당 폴더에 있으면 원본을 유지한다", async () => {
    const root = await temporaryRoot();
    const source = path.join(root, "A.JPG");
    await writeFile(source, "the only copy");
    await expect(copyOrMovePreservingMetadata({ source, destinationDirectory: root, move: true })).resolves.toMatchObject({ alreadyExisted: true });
    await expect(readFile(source, "utf8")).resolves.toBe("the only copy");
  });

  it("동시에 같은 최종 이름으로 이동해도 나머지 원본을 보존한다", async () => {
    const root = await temporaryRoot();
    const inputFolders = ["project-1", "project-2"].map((name) => path.join(root, name));
    const destinationDirectory = path.join(root, "result");
    await Promise.all([...inputFolders, destinationDirectory].map((folder) => mkdir(folder)));
    const paths = inputFolders.map((folder) => path.join(folder, "A.JPG"));
    await Promise.all(paths.map((file, index) => writeFile(file, `file-${index}`)));
    const results = await Promise.allSettled(paths.map((source) => copyOrMovePreservingMetadata({ source, destinationDirectory, move: true })));
    const winner = results.findIndex((result) => result.status === "fulfilled");
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    await expect(readFile(path.join(destinationDirectory, "A.JPG"), "utf8")).resolves.toBe(`file-${winner}`);
    await expect(readFile(paths[1 - winner], "utf8")).resolves.toBe(`file-${1 - winner}`);
  });

  it("같은 크기의 RAW 충돌을 완료로 바꾸거나 관련 JPG를 옮기지 않는다", async () => {
    const root = await temporaryRoot();
    const destination = path.join(root, "Selected_RAW");
    await mkdir(destination);
    const raw = path.join(root, "A.ARW");
    const rawCopy = path.join(destination, "A.ARW");
    const jpg = path.join(root, "A.JPG");
    await Promise.all([writeFile(raw, "alpha"), writeFile(rawCopy, "omega"), writeFile(jpg, "jpg")]);
    const time = new Date("2026-11-14T10:00:00Z");
    await Promise.all([utimes(raw, time, time), utimes(rawCopy, time, time)]);
    await expect(executeRemoteRawMatchCopy({
      rawRootPath: root, jpgRootPath: root,
      items: [{ rawPath: "A.ARW", destDir: "Selected_RAW", rawExpectedSize: 5, rawExpectedCaptureTimeMs: null,
        jpgPath: "A.JPG", jpgDestDir: "1차보정본", jpgExpectedSize: 3, jpgExpectedCaptureTimeMs: null }],
      logRows: [],
    }, { allowedRoots: [root] })).rejects.toThrow(/같은 이름의 다른 파일/u);
    await expect(readFile(rawCopy, "utf8")).resolves.toBe("omega");
    await expect(readFile(jpg, "utf8")).resolves.toBe("jpg");
    await expect(stat(path.join(root, "1차보정본"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("워커가 복사 후 쓰는 로그가 다른 파일의 내용을 바꾸지 않는다", async () => {
    const root = await temporaryRoot();
    const output = path.join(root, "Selected_RAW");
    const linkedFile = path.join(root, "original-report.txt");
    await mkdir(output);
    await Promise.all([writeFile(path.join(root, "A.ARW"), "raw"), writeFile(linkedFile, "original")]);
    await symlink(linkedFile, path.join(output, "_match_log.csv"));
    const result = await executeRemoteRawMatchCopy({
      rawRootPath: root,
      items: [{ rawPath: "A.ARW", destDir: "Selected_RAW", rawExpectedSize: 3, rawExpectedCaptureTimeMs: null }],
      logRows: [{ jpgName: "A.JPG", jpgPath: "A.JPG", jpgCaptureTime: "-", rawPath: "A.ARW", rawCaptureTime: "-", result: "확정" }],
    }, { allowedRoots: [root] });
    await expect(readFile(linkedFile, "utf8")).resolves.toBe("original");
    expect(await readFile(result.logPath, "utf8")).toContain('"통과"');
  });

  it("확인된 JPG의 두 단계 위에서 RAW를 복사하고 JPG 이동을 요청하지 않으면 원래 위치에 둔다", async () => {
    const mounts = path.join(await temporaryRoot(), "Volumes");
    const project = path.join(mounts, "CurrentDisk", "project");
    const unrelated = path.join(mounts, "OtherDisk", "project");
    const jpgFolder = path.join(project, "JPG전체", "scene");
    for (const folder of [jpgFolder, path.join(project, "RAW"), path.join(unrelated, "RAW")]) await mkdir(folder, { recursive: true });
    await writeFile(path.join(jpgFolder, "A.JPG"), "jpg");
    await writeFile(path.join(project, "RAW", "A.ARW"), "raw");
    await writeFile(path.join(unrelated, "RAW", "A.ARW"), "raw");
    const result = await executeRemoteRawMatchCopy({
      jpgRoot: { projectKey: "project", folderName: "scene", relativePath: "CurrentDisk/project/JPG전체/scene", kind: "jpg" },
      rawRoot: { projectKey: "project", folderName: "RAW", kind: "raw" },
      rawRootRelation: { parentSteps: 2, subdirectory: "RAW" },
      items: [{ rawPath: "A.ARW", destDir: "Selected_RAW", rawExpectedSize: 3, rawExpectedCaptureTimeMs: null,
        jpgPath: "A.JPG", jpgExpectedSize: 3, jpgExpectedCaptureTimeMs: null }],
      logRows: [],
    }, { allowedRoots: [mounts] });
    expect(result).toMatchObject({ copied: 1, jpgMoved: 0, failed: 0, outputDir: await realpath(path.join(project, "RAW", "Selected_RAW")) });
    await expect(readFile(path.join(jpgFolder, "A.JPG"), "utf8")).resolves.toBe("jpg");
    await expect(stat(path.join(unrelated, "RAW", "Selected_RAW"))).rejects.toMatchObject({ code: "ENOENT" });
  });
  it.each([false, true])("생성일 차이는 RAW 내용 검증 후에만 허용한다 (손상 %s)", async (corrupt) => {
    const root = await realpath(await temporaryRoot());
    const source = path.join(root, "A.ARW");
    const destinationDirectory = path.join(root, "Selected_RAW");
    await writeFile(source, "raw-a");
    await mkdir(destinationDirectory);
    const snapshot = rawMatchFileAttributes.readFileAttributeSnapshot;
    const attributes = vi.spyOn(rawMatchFileAttributes, "readFileAttributeSnapshot").mockImplementation(async (filePath) => {
      const result = await snapshot(filePath);
      if (filePath === source) return result;
      if (corrupt && path.basename(filePath).startsWith(".olivia-copy-")) await writeFile(filePath, "raw-b");
      return { ...result, birthtimeSeconds: result.birthtimeSeconds + 3600 };
    });
    try {
      const copy = copyOrMovePreservingMetadata({ source, destinationDirectory, move: false });
      if (corrupt) {
        await expect(copy).rejects.toThrow(/SHA-256 불일치/u);
        await expect(stat(path.join(destinationDirectory, "A.ARW"))).rejects.toMatchObject({ code: "ENOENT" });
      } else {
        await expect(copy).resolves.toMatchObject({ warnings: ["생성일 차이 · 파일 내용 SHA-256 일치"] });
        await expect(readFile(path.join(destinationDirectory, "A.ARW"), "utf8")).resolves.toBe("raw-a");
      }
    } finally {
      attributes.mockRestore();
    }
  });

  it("ditto 복사 후 크기·mtime·birthtime·확장속성이 원본과 같고 quarantine가 없다", async () => {
    const root = await temporaryRoot();
    const rawRoot = path.join(root, "RAW");
    await mkdir(rawRoot);
    const source = path.join(rawRoot, "_AK_0177.CR2");
    await writeFile(source, Buffer.from("olivia-raw-source"));
    await execFileAsync("/usr/bin/xattr", ["-w", "com.olivia.test", "preserved", source]);
    await execFileAsync("/usr/bin/xattr", ["-d", "com.apple.quarantine", source]).catch(() => undefined);

    const sourceStat = await stat(source);
    const result = await executeRemoteRawMatchCopy({
      rawRootPath: rawRoot,
      items: [{
        rawPath: "_AK_0177.CR2",
        destDir: "Selected_RAW",
        rawExpectedSize: sourceStat.size,
        rawExpectedCaptureTimeMs: null,
      }],
      logRows: [{
        jpgName: "_AK_0177.JPG",
        jpgPath: "_AK_0177.JPG",
        jpgCaptureTime: "-",
        rawPath: "_AK_0177.CR2",
        rawCaptureTime: "-",
        result: "확정",
      }],
    }, { allowedRoots: [root] });

    const destination = path.join(rawRoot, "Selected_RAW", "_AK_0177.CR2");
    const sourceAttributes = await readFileAttributeSnapshot(source);
    const destinationAttributes = await readFileAttributeSnapshot(destination);
    expect(verifyFileAttributeSnapshot(sourceAttributes, destinationAttributes)).toEqual({ ok: true, reasons: [], warnings: [] });
    expect(destinationAttributes.xattrs["com.apple.quarantine"]).toBeUndefined();
    expect(result).toMatchObject({ copied: 1, failed: 0, attributePassed: 1, attributeFailed: 0 });
    expect(await readFile(result.logPath, "utf8")).toContain('"속성 확인"');
    expect(await readFile(result.logPath, "utf8")).toContain('"통과"');
  });

  it("대상에 같은 이름이 있으면 덮어쓰지 않는다", async () => {
    const root = await temporaryRoot();
    const rawRoot = path.join(root, "RAW");
    const destinationDirectory = path.join(rawRoot, "Selected_RAW");
    await mkdir(destinationDirectory, { recursive: true });
    const source = path.join(rawRoot, "A.CR2");
    const destination = path.join(destinationDirectory, "A.CR2");
    await writeFile(source, "new-source");
    await writeFile(destination, "existing-destination");
    const sourceStat = await stat(source);

    await expect(executeRemoteRawMatchCopy({
      rawRootPath: rawRoot,
      items: [{ rawPath: "A.CR2", destDir: "Selected_RAW", rawExpectedSize: sourceStat.size, rawExpectedCaptureTimeMs: null }],
      logRows: [],
    }, { allowedRoots: [root] })).rejects.toThrow("RAW 복사가 모두 실패했습니다");

    expect(await readFile(destination, "utf8")).toBe("existing-destination");
    expect(await readFile(source, "utf8")).toBe("new-source");
  });

  it("원본 경로가 틀리면 빈 Selected_RAW 폴더를 만들지 않고 실패한다", async () => {
    const root = await temporaryRoot();
    const rawRoot = path.join(root, "RAW");
    await mkdir(rawRoot);

    await expect(executeRemoteRawMatchCopy({
      rawRootPath: rawRoot,
      items: [{ rawPath: "missing.CR2", destDir: "Selected_RAW", rawExpectedSize: 10, rawExpectedCaptureTimeMs: null }],
      logRows: [],
    }, { allowedRoots: [root] })).rejects.toThrow();
    await expect(stat(path.join(rawRoot, "Selected_RAW"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("대상에 크기와 mtime이 같은 파일이 있으면 이미 복사됨으로 성공 처리한다", async () => {
    const root = await temporaryRoot();
    const sourceDirectory = path.join(root, "source");
    const destinationDirectory = path.join(root, "destination");
    await mkdir(sourceDirectory);
    await mkdir(destinationDirectory);
    const source = path.join(sourceDirectory, "same.CR2");
    const destination = path.join(destinationDirectory, "same.CR2");
    await writeFile(source, "same-content");
    await writeFile(destination, "same-content");
    const sourceStats = await stat(source);
    const destinationStats = await stat(destination);
    const seconds = Math.floor(Math.min(sourceStats.mtimeMs, destinationStats.mtimeMs) / 1000);
    await execFileAsync("/usr/bin/touch", ["-t", new Date(seconds * 1000).toISOString().replace(/[-:T]/g, "").slice(0, 12), source, destination]);

    const result = await copyOrMovePreservingMetadata({ source, destinationDirectory, move: false });
    expect(result.alreadyExisted).toBe(true);
    expect(await readFile(destination, "utf8")).toBe("same-content");
  });

  it("RAW 성공 뒤 JPG 이동 실패는 jpg_move로 남고 재시도는 RAW를 건너뛴다", async () => {
    const root = await temporaryRoot();
    const rawRoot = path.join(root, "RAW");
    const jpgRoot = path.join(root, "JPG");
    const jpgDestination = path.join(jpgRoot, "1차보정본");
    await mkdir(rawRoot);
    await mkdir(jpgRoot);
    await mkdir(jpgDestination);
    await writeFile(path.join(rawRoot, "retry.CR2"), "raw-retry");
    await writeFile(path.join(jpgRoot, "retry.JPG"), "jpg-retry");
    await writeFile(path.join(jpgDestination, "retry.JPG"), "different-collision-content");
    const rawStats = await stat(path.join(rawRoot, "retry.CR2"));
    const jpgStats = await stat(path.join(jpgRoot, "retry.JPG"));
    const payload = {
      rawRootPath: rawRoot,
      jpgRootPath: jpgRoot,
      items: [{
        rawPath: "retry.CR2",
        destDir: "Selected_RAW",
        rawExpectedSize: rawStats.size,
        rawExpectedCaptureTimeMs: null,
        jpgPath: "retry.JPG",
        jpgDestDir: "1차보정본",
        jpgExpectedSize: jpgStats.size,
        jpgExpectedCaptureTimeMs: null,
      }],
      logRows: [],
    };

    const first = await executeRemoteRawMatchCopy(payload, { allowedRoots: [root] });
    expect(first).toMatchObject({ copied: 1, alreadyCopied: 0, jpgMoved: 0, failed: 1 });
    expect(first.failures[0]).toMatchObject({ stage: "jpg_move", path: "retry.JPG" });
    await rm(path.join(jpgDestination, "retry.JPG"));

    const second = await executeRemoteRawMatchCopy(payload, { allowedRoots: [root] });
    expect(second).toMatchObject({ copied: 0, alreadyCopied: 1, jpgMoved: 1, failed: 0 });
  });

  it("브라우저 경로가 직접 열리지 않아도 /Volumes 아래 표본 크기가 맞는 폴더를 찾아 실행한다", async () => {
    const root = await temporaryRoot();
    const rawRoot = path.join(root, "촬영프로젝트", "RAW");
    await mkdir(rawRoot, { recursive: true });
    const source = path.join(rawRoot, "C.CR2");
    await writeFile(source, "raw-c");
    const sourceStat = await stat(source);

    const result = await executeRemoteRawMatchCopy({
      rawRootPath: "/Volumes/브라우저표시경로/RAW",
      items: [{ rawPath: "C.CR2", destDir: "Selected_RAW", rawExpectedSize: sourceStat.size, rawExpectedCaptureTimeMs: null }],
      logRows: [],
    }, { allowedRoots: [root] });

    expect(result).toMatchObject({ copied: 1, failed: 0 });
    expect(await readFile(path.join(rawRoot, "Selected_RAW", "C.CR2"), "utf8")).toBe("raw-c");
  });

  it("RAW가 복사된 항목의 JPG와 같은 이름 XMP만 보정본 폴더로 이동한다", async () => {
    const root = await temporaryRoot();
    const rawRoot = path.join(root, "RAW");
    const jpgRoot = path.join(root, "JPG전체");
    await mkdir(rawRoot);
    await mkdir(jpgRoot);
    const rawSource = path.join(rawRoot, "B.CR2");
    const jpgSource = path.join(jpgRoot, "B.JPG");
    const xmpSource = path.join(jpgRoot, "B.xMp");
    await writeFile(rawSource, "raw-b");
    await writeFile(jpgSource, "jpg-b");
    await writeFile(xmpSource, "xmp-b");
    const rawStat = await stat(rawSource);
    const jpgStat = await stat(jpgSource);
    const jpgAttributes = await readFileAttributeSnapshot(jpgSource);
    const xmpAttributes = await readFileAttributeSnapshot(xmpSource);

    const result = await executeRemoteRawMatchCopy({
      rawRootPath: rawRoot,
      jpgRootPath: jpgRoot,
      items: [{
        rawPath: "B.CR2",
        destDir: "Selected_RAW",
        rawExpectedSize: rawStat.size,
        rawExpectedCaptureTimeMs: null,
        jpgPath: "B.JPG",
        jpgDestDir: "1차보정본",
        jpgExpectedSize: jpgStat.size,
        jpgExpectedCaptureTimeMs: null,
      }],
      logRows: [],
    }, { allowedRoots: [root] });

    const jpgDestination = path.join(jpgRoot, "1차보정본", "B.JPG");
    const xmpDestination = path.join(jpgRoot, "1차보정본", "B.xMp");
    expect(result).toMatchObject({ copied: 1, jpgMoved: 1, xmpMoved: 1, failed: 0, attributePassed: 3, attributeFailed: 0 });
    await expect(stat(jpgSource)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(xmpSource)).rejects.toMatchObject({ code: "ENOENT" });
    expect(verifyFileAttributeSnapshot(jpgAttributes, await readFileAttributeSnapshot(jpgDestination)).ok).toBe(true);
    expect(verifyFileAttributeSnapshot(xmpAttributes, await readFileAttributeSnapshot(xmpDestination)).ok).toBe(true);
  });
});

describe("워커 연결 차단", () => {
  it("워커가 꺼져 있으면 원격 job을 만들지 않고 브라우저 복사로 대체하지 않는다", async () => {
    const fetcher = vi.fn();
    await expect(runRemoteRawMatchCopy({
      rawRootPath: "/Volumes/Agentstation/RAW",
      items: [{ rawPath: "A.CR2", destDir: "Selected_RAW", rawExpectedSize: 1, rawExpectedCaptureTimeMs: null }],
      logRows: [],
    }, { workerOnline: false, fetcher: fetcher as unknown as typeof fetch })).rejects.toThrow("맥스튜디오 워커가 꺼져 있어 원본 속성을 지킬 수 없습니다");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
