import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseCaptureTime } from "@/lib/selectMatch/captureTime";
import { executeRemoteBridgeRawMatch } from "@/lib/selectMatch/node/remoteBridgeRawMatch";

const temporaryRoots: string[] = [];

function makeTiff(date = "2026:11:16 12:19:06", subsec = "250"): ArrayBuffer {
  const buffer = new ArrayBuffer(96);
  const view = new DataView(buffer);
  const encoder = new TextEncoder();
  view.setUint16(0, 0x4949, false);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, 1, true);
  view.setUint16(10, 0x8769, true);
  view.setUint16(12, 4, true);
  view.setUint32(14, 1, true);
  view.setUint32(18, 26, true);
  view.setUint32(22, 0, true);
  view.setUint16(26, 2, true);
  view.setUint16(28, 0x9003, true);
  view.setUint16(30, 2, true);
  view.setUint32(32, 20, true);
  view.setUint32(36, 58, true);
  view.setUint16(40, 0x9291, true);
  view.setUint16(42, 2, true);
  view.setUint32(44, subsec.length + 1, true);
  for (const [index, value] of encoder.encode(`${subsec}\0`).entries()) view.setUint8(48 + index, value);
  view.setUint32(52, 0, true);
  for (const [index, value] of encoder.encode(`${date}\0`).entries()) view.setUint8(58 + index, value);
  return buffer;
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "olivia-local-nas-match-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe.runIf(process.platform === "darwin")("로컬 JPG 셀렉 → NAS RAW 워커 실행", () => {
  it("로컬 JPG 경로 없이 선택한 NAS 촬영 폴더의 RAW만 Selected_RAW에 복사한다", async () => {
    const allowedRoot = await temporaryRoot();
    const projectRoot = path.join(allowedRoot, "1116_프로젝트");
    const rawDirectory = path.join(projectRoot, "RAW");
    await mkdir(rawDirectory, { recursive: true });
    const rawBuffer = makeTiff();
    await writeFile(path.join(rawDirectory, "A.CR2"), new Uint8Array(rawBuffer));
    const captureTimeMs = parseCaptureTime(rawBuffer)?.timestampMs;
    expect(captureTimeMs).toBeTypeOf("number");

    const previousRoots = process.env.OLIVIA_PERSON_SELECT_ROOTS;
    const previousSourceRoot = process.env.SOURCE_ROOT;
    process.env.OLIVIA_PERSON_SELECT_ROOTS = JSON.stringify([allowedRoot]);
    process.env.SOURCE_ROOT = allowedRoot;
    try {
      const result = await executeRemoteBridgeRawMatch({
        projectRoot: {
          projectKey: "root-0/1116_프로젝트",
          folderName: "1116_프로젝트",
          relativePath: "root-0/1116_프로젝트",
          kind: "raw",
        },
        selectedJpgs: [{
          name: "A.JPG",
          relativePath: "도수치료/A.JPG",
          size: 1234,
          captureTimeMs: captureTimeMs ?? null,
        }],
        moveJpgs: false,
        openOutput: false,
      });

      expect(result).toMatchObject({
        selected: 1,
        confirmed: 1,
        copied: 1,
        jpgMoved: 0,
        xmpMoved: 0,
        deliveredDir: "",
        needsReview: 0,
      });
      expect(await readFile(path.join(projectRoot, "Selected_RAW", "A.CR2"))).toEqual(Buffer.from(rawBuffer));
    } finally {
      if (previousRoots === undefined) delete process.env.OLIVIA_PERSON_SELECT_ROOTS;
      else process.env.OLIVIA_PERSON_SELECT_ROOTS = previousRoots;
      if (previousSourceRoot === undefined) delete process.env.SOURCE_ROOT;
      else process.env.SOURCE_ROOT = previousSourceRoot;
    }
  });
});
