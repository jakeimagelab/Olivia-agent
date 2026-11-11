import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  classifyPersonFolderName,
  findPickShortage,
  pickShortageMessage,
  requiredPickCount,
  validateCategoryPicks,
} from "@/lib/person-select/core";
import { scanPersonFolders } from "@/scripts/person-select-import";
import { indexRawFiles, personFolderOf, pickRawCandidate } from "@/scripts/person-select-raw-match";
import { createRunnerInvocation } from "@/scripts/mac-studio-remote-bridge";

const photo = { key: "photo", label: "사진", pick: 3 };

describe("person select pick counts", () => {
  it("asks only for as many photos as were uploaded", () => {
    expect(requiredPickCount(3, 10)).toBe(3);
    expect(requiredPickCount(3, 2)).toBe(2);
    expect(requiredPickCount(3, 0)).toBe(0);
  });

  it("blocks submit until the exact count is chosen", () => {
    const base = { categories: [photo], groupLabel: null, imageCounts: { photo: 12 } };
    expect(findPickShortage({ ...base, chosenCounts: { photo: 2 } })).toEqual({ key: "photo", label: "사진", need: 3, have: 2 });
    expect(findPickShortage({ ...base, chosenCounts: { photo: 3 } })).toBeNull();
    expect(pickShortageMessage({ label: "사진", need: 3, have: 2 })).toBe("사진을 3장 골라주세요. (지금 2장)");
    expect(pickShortageMessage({ label: "사진", need: 2, have: 3 })).toContain("2장까지");
  });

  it("validates the admin quantity setting", () => {
    expect(validateCategoryPicks([photo])).toBeNull();
    expect(validateCategoryPicks([{ ...photo, pick: 0 }])).toContain("1장부터");
    expect(validateCategoryPicks([{ ...photo, pick: 1.5 }])).toContain("1장부터");
    expect(validateCategoryPicks([])).not.toBeNull();
  });
});
describe("person folder layout", () => {
  it("classifies person, group and unnamed folders", () => {
    expect(classifyPersonFolderName("김춘자")).toEqual({ kind: "person", name: "김춘자" });
    expect(classifyPersonFolderName("그룹1")).toEqual({ kind: "group" });
    expect(classifyPersonFolderName("단체")).toEqual({ kind: "group" });
    expect(classifyPersonFolderName("개인3")).toEqual({ kind: "unnamed" });
    expect(classifyPersonFolderName("Selected_RAW")).toEqual({ kind: "skip" });
    expect(classifyPersonFolderName(".DS_Store")).toEqual({ kind: "skip" });
  });

  it("reads JPG원본 inside each name folder and never uploads group or RAW files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "person-folders-"));
    try {
      await mkdir(path.join(root, "김춘자", "JPG원본"), { recursive: true });
      await writeFile(path.join(root, "김춘자", "R5K_0001.CR3"), "raw");
      await writeFile(path.join(root, "김춘자", "JPG원본", "R5K_0001.JPG"), "jpg");
      await mkdir(path.join(root, "이지영"), { recursive: true });
      await writeFile(path.join(root, "이지영", "DSC_0002.jpg"), "jpg");
      await mkdir(path.join(root, "그룹1", "JPG원본"), { recursive: true });
      await writeFile(path.join(root, "그룹1", "JPG원본", "R5K_0100.JPG"), "jpg");
      await mkdir(path.join(root, "개인3", "JPG원본"), { recursive: true });
      await writeFile(path.join(root, "개인3", "JPG원본", "R5K_0200.JPG"), "jpg");
      await mkdir(path.join(root, "박빈칸"), { recursive: true });
      const result = await scanPersonFolders(root);
      expect(result.files.map((file) => [file.ownerName, file.relPath, file.category])).toEqual([
        ["김춘자", "김춘자/JPG원본/R5K_0001.JPG", "photo"],
        ["이지영", "이지영/DSC_0002.jpg", "photo"],
      ]);
      expect(result.groupFolders).toEqual(["그룹1"]);
      expect(result.unnamedFolders).toEqual(["개인3"]);
      expect(result.emptyFolders).toEqual(["박빈칸"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("person select RAW match", () => {
  it("finds the RAW in the person's own folder first", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "person-raw-"));
    try {
      await mkdir(path.join(root, "김춘자", "JPG원본"), { recursive: true });
      await mkdir(path.join(root, "이지영"), { recursive: true });
      await writeFile(path.join(root, "김춘자", "R5K_0001.CR3"), "a");
      await writeFile(path.join(root, "이지영", "R5K_0001.CR3"), "b");
      await writeFile(path.join(root, "김춘자", "JPG원본", "R5K_0001.JPG"), "jpg");
      const index = await indexRawFiles(root);
      const candidates = index.get("r5k_0001") ?? [];
      expect(candidates).toHaveLength(2);
      const picked = pickRawCandidate(candidates, personFolderOf("김춘자/JPG원본/R5K_0001.JPG"));
      expect(picked.status).toBe("matched");
      expect(picked.status === "matched" && picked.file.relPath).toBe("김춘자/R5K_0001.CR3");
      expect(pickRawCandidate(candidates, "박없음").status).toBe("ambiguous");
      expect(pickRawCandidate([], "김춘자").status).toBe("missing");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not index RAW files inside JPG or delivered folders", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "person-raw-scope-"));
    try {
      await mkdir(path.join(root, "RAW"), { recursive: true });
      await mkdir(path.join(root, "JPG전체"), { recursive: true });
      await mkdir(path.join(root, "2차보정본"), { recursive: true });
      await writeFile(path.join(root, "RAW", "KEEP.CR3"), "keep");
      await writeFile(path.join(root, "JPG전체", "SKIP.CR3"), "skip");
      await writeFile(path.join(root, "2차보정본", "DELIVERED.CR3"), "skip");
      const index = await indexRawFiles(root);
      expect([...index.keys()]).toEqual(["keep"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("maps the new worker actions", () => {
    const repoRoot = "/repo";
    const job = (action: string, payload: Record<string, unknown>) => ({ job_id: "job", action, payload, target_worker: "jake-macstudio-01" });
    const raw = createRunnerInvocation(job("PERSON_SELECT_RAW_MATCH", { event_id: "018e2f30-92af-78b1-8f21-67f4404f5027" }) as never, repoRoot);
    expect(raw?.args).toContain(path.join(repoRoot, "scripts/person-select-raw-match.ts"));
    expect(raw?.args).toEqual(expect.arrayContaining(["--source", "submitted"]));
    const current = createRunnerInvocation(job("PERSON_SELECT_RAW_MATCH", { event_id: "018e2f30-92af-78b1-8f21-67f4404f5027", source: "current", reviewerIds: ["reviewer-a", "reviewer-b"] }) as never, repoRoot);
    expect(current?.args).toEqual(expect.arrayContaining(["--source", "current", "--reviewer-ids-json", '["reviewer-a","reviewer-b"]']));
    const folders = createRunnerInvocation(job("PERSON_SELECT_IMPORT", { event_id: "018e2f30-92af-78b1-8f21-67f4404f5027", source_relative_path: "1031_촬영", layout: "person-folders" }) as never, repoRoot);
    expect(folders?.args).toEqual(expect.arrayContaining(["--layout", "person-folders"]));
    expect(folders?.args).not.toContain("--mappings-json");
  });
});
