import { describe, expect, it } from "vitest";
import { readFile, mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  canAccessImageRecord,
  constantTimePinEqual,
  createUniquePin,
  derivePersonLoginName,
  eventIsLocked,
  isLoginRateLimited,
  normalizeLoginName,
  normalizeNfc,
  parseGroupFolderName,
  parsePersonFolderName,
  requiredCategoryKeys,
  validateChoiceInput,
} from "@/lib/person-select/core";
import { DEFAULT_PERSON_SELECT_CATEGORIES } from "@/lib/person-select/types";
import { findSkippedFolders, scanPersonSelectFolders } from "@/scripts/person-select-import";
import { formatSeoulDeadline, formatSeoulDateTimeInput, parseSeoulDateTime, defaultSeoulDeadlineInput } from "@/lib/person-select/date";
import { getPersonSelectRoots, resolvePersonSelectSourcePath } from "@/lib/person-select/sourceRoots";

describe("person select public access", () => {
  it("normalizes NFC names and removes spaces", () => {
    const nfd = "고가연".normalize("NFD");
    expect(normalizeLoginName(` ${nfd} `)).toBe("고가연");
    expect(normalizeLoginName(" 고 가연 ")).toBe("고가연");
    expect(normalizeNfc(nfd)).toBe("고가연");
  });

  it("keeps the folder display name but removes only supported trailing roles from login names", () => {
    expect(derivePersonLoginName("김정현과장님")).toBe("김정현");
    expect(derivePersonLoginName("김하영 부장님")).toBe("김하영");
    expect(derivePersonLoginName("손현정대리님")).toBe("손현정");
    expect(derivePersonLoginName("유지나대표님")).toBe("유지나");
    expect(derivePersonLoginName("이신옥과장님")).toBe("이신옥");
    expect(derivePersonLoginName("김과장님수")).toBe("김과장님수");
    expect(derivePersonLoginName("하느님")).toBe("하느님");
  });

  it("compares PINs without exposing which character differed and locks on the tenth failure", () => {
    expect(constantTimePinEqual("0123", "0123")).toBe(true);
    expect(constantTimePinEqual("0123", "0124")).toBe(false);
    expect(isLoginRateLimited(9)).toBe(false);
    expect(isLoginRateLimited(10)).toBe(true);
  });

  it("issues unique four digit PINs inside one event", () => {
    const existing = new Set(["0000", "0001", "9999"]);
    const pins = Array.from({ length: 50 }, () => {
      const pin = createUniquePin(existing); existing.add(pin); return pin;
    });
    expect(new Set(pins).size).toBe(50);
    expect(pins.every((pin) => /^\d{4}$/.test(pin))).toBe(true);
  });

  it("allows same-name people to be distinguished by their issued PIN", async () => {
    const schema = await readFile(path.join(process.cwd(), "supabase/person-select-schema.sql"), "utf8");
    expect(schema).toContain("drop index if exists public.person_select_people_event_login_idx");
    expect(schema).toContain("person_select_people_event_pin_idx on public.person_select_people(event_id, pin_code)");
    expect(constantTimePinEqual("1010", "1010")).toBe(true);
    expect(constantTimePinEqual("1010", "2020")).toBe(false);
  });

  it("denies another person image and homeroom images without a matching group", () => {
    expect(canAccessImageRecord({ personId: "a", groupLabel: null, categoryKey: "profile", imageOwnerPersonId: "b", imageOwnerGroup: null })).toBe(false);
    expect(canAccessImageRecord({ personId: "a", groupLabel: null, categoryKey: "homeroom", imageOwnerPersonId: null, imageOwnerGroup: "1반" })).toBe(false);
    expect(canAccessImageRecord({ personId: "a", groupLabel: "1반", categoryKey: "homeroom", imageOwnerPersonId: null, imageOwnerGroup: "1반" })).toBe(true);
  });

  it("rejects unknown retouch keys, 301 characters, and locked events", () => {
    expect(validateChoiceInput({ retouchKeys: ["unknown"], memo: "", allowedKeys: ["skin"], memoMax: 300 })).toContain("없는");
    expect(validateChoiceInput({ retouchKeys: [], memo: "a".repeat(301), allowedKeys: ["skin"], memoMax: 300 })).toContain("300자");
    expect(eventIsLocked({ status: "open", deadline_at: "2026-10-18T00:00:00Z" }, new Date("2026-10-19T00:00:00Z"))).toBe(true);
  });

  it("requires only the homeroom choice when a homeroom teacher has no profile images", () => {
    const required = requiredCategoryKeys({
      categories: DEFAULT_PERSON_SELECT_CATEGORIES,
      groupLabel: "4반",
      imageCounts: { profile: 0, homeroom: 20 },
    });

    expect(required).toEqual(["homeroom"]);
    expect(required.every((categoryKey) => new Set(["homeroom"]).has(categoryKey))).toBe(true);
  });

  it("requires only the profile choice for a non-homeroom teacher", () => {
    const required = requiredCategoryKeys({
      categories: DEFAULT_PERSON_SELECT_CATEGORIES,
      groupLabel: null,
      imageCounts: { profile: 10, homeroom: 20 },
    });

    expect(required).toEqual(["profile"]);
    expect(required.every((categoryKey) => new Set(["profile"]).has(categoryKey))).toBe(true);
  });

  it("requires both choices when a homeroom teacher can see both categories", () => {
    const required = requiredCategoryKeys({
      categories: DEFAULT_PERSON_SELECT_CATEGORIES,
      groupLabel: "1반",
      imageCounts: { profile: 10, homeroom: 20 },
    });

    expect(required).toEqual(["profile", "homeroom"]);
    expect(required.every((categoryKey) => new Set(["profile"]).has(categoryKey))).toBe(false);
    expect(required.every((categoryKey) => new Set(["profile", "homeroom"]).has(categoryKey))).toBe(true);
  });
});

describe("person select importer", () => {
  it("parses person and group folders and normalizes NFD paths to NFC", async () => {
    expect(parsePersonFolderName("선생님프로필_고가연", "선생님프로필")).toBe("고가연");
    expect(parseGroupFolderName("담임선생님_3반선생님", "담임선생님")).toBe("3반");
    const root = await mkdtemp(path.join(tmpdir(), "person-select-"));
    try {
      const folder = path.join(root, "선생님프로필".normalize("NFD"), "선생님프로필_고가연".normalize("NFD"));
      await mkdir(folder, { recursive: true });
      await writeFile(path.join(folder, "선생님프로필_고가연__AK_7738.JPG".normalize("NFD")), "test");
      const rows = await scanPersonSelectFolders(root, [{ folder: "선생님프로필".normalize("NFD"), category: "profile", owner: "person" }]);
      expect(rows).toHaveLength(1);
      expect(rows[0].ownerName).toBe("고가연");
      expect(rows[0].relPath).toBe(rows[0].relPath.normalize("NFC"));
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("scans only mapped folders and reports 학생사진 as skipped", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "person-select-skip-"));
    try {
      await mkdir(path.join(root, "선생님프로필", "선생님프로필_고가연"), { recursive: true });
      await mkdir(path.join(root, "학생사진", "학생_가연"), { recursive: true });
      await writeFile(path.join(root, "선생님프로필", "선생님프로필_고가연", "A.JPG"), "teacher");
      await writeFile(path.join(root, "학생사진", "학생_가연", "B.JPG"), "student");
      const mappings = [{ folder: "선생님프로필", category: "profile", owner: "person" as const }];
      expect(await scanPersonSelectFolders(root, mappings)).toHaveLength(1);
      expect(await findSkippedFolders(root, mappings)).toEqual(["학생사진"]);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("accepts only configured person-select roots after realpath and rejects traversal or symlink escapes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "person-select-root-"));
    const outside = await mkdtemp(path.join(tmpdir(), "person-select-outside-"));
    const env = JSON.stringify([root]);
    try {
      await mkdir(path.join(root, "학교전달"));
      await symlink(outside, path.join(root, "outside-link"));
      expect(getPersonSelectRoots(env)[0]?.path).toBe(root);
      await expect(resolvePersonSelectSourcePath(path.join(root, "학교전달"), env)).resolves.toMatchObject({ relativePath: "학교전달" });
      await expect(resolvePersonSelectSourcePath("root-0/학교전달", env)).resolves.toMatchObject({ relativePath: "학교전달" });
      await expect(resolvePersonSelectSourcePath(`${root}/../outside`, env)).rejects.toThrow("허용 루트 밖");
      await expect(resolvePersonSelectSourcePath(outside, env)).rejects.toThrow("허용 루트 밖");
      await expect(resolvePersonSelectSourcePath(path.join(root, "outside-link"), env)).rejects.toThrow("안전한 폴더");
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("opens an available configured drive even when another configured drive is disconnected", async () => {
    const available = await mkdtemp(path.join(tmpdir(), "person-select-available-"));
    const missing = path.join(tmpdir(), `person-select-missing-${Date.now()}`);
    const env = JSON.stringify([missing, available]);
    try {
      await mkdir(path.join(available, "촬영폴더"));
      await expect(resolvePersonSelectSourcePath("root-1/촬영폴더", env)).resolves.toMatchObject({ relativePath: "촬영폴더" });
      await expect(resolvePersonSelectSourcePath(path.join(available, "촬영폴더"), env)).resolves.toMatchObject({ relativePath: "촬영폴더" });
      await expect(resolvePersonSelectSourcePath("root-0", env)).rejects.toThrow("드라이브가 연결되어 있지 않아요");
    } finally {
      await rm(available, { recursive: true, force: true });
    }
  });

  it("stores KST datetime-local values as timestamptz and formats deadline without seconds", () => {
    expect(parseSeoulDateTime("2026-10-31T18:00")).toBe("2026-10-31T09:00:00.000Z");
    expect(formatSeoulDateTimeInput("2026-10-31T09:00:00.000Z")).toBe("2026-10-31T18:00");
    expect(formatSeoulDeadline("2026-10-31T09:00:00.000Z")).toBe("10월 31일 (토) 오후 6:00");
    expect(defaultSeoulDeadlineInput(new Date("2026-10-19T17:00:00.000Z"))).toBe("2026-11-03T18:00");
  });

  it("keeps pin_code out of every public pick response source", async () => {
    const files = [
      "app/api/pick/[eventSlug]/me/route.ts",
      "app/api/pick/[eventSlug]/images/route.ts",
      "app/api/pick/[eventSlug]/choices/[category]/route.ts",
      "app/api/pick/[eventSlug]/submit/route.ts",
    ];
    for (const file of files) expect(await readFile(path.join(process.cwd(), file), "utf8")).not.toContain("pin_code");
  });

  it("records the previous choice before every overwrite", async () => {
    const source = await readFile(path.join(process.cwd(), "app/api/pick/[eventSlug]/choices/[category]/route.ts"), "utf8");
    expect(source.indexOf("person_select_choice_history")).toBeGreaterThan(-1);
    // 같은 사진 수정과, 1장 항목에서 다른 사진으로 바꾸기 모두 덮어쓰기 전에 이력을 남긴다.
    for (const overwrite of [".update(values)", ".update({ image_id: body.image_id"]) {
      const at = source.indexOf(overwrite);
      expect(at).toBeGreaterThan(-1);
      expect(source.lastIndexOf("person_select_choice_history", at)).toBeGreaterThan(-1);
      expect(source.slice(source.lastIndexOf("historyRow(", at), at)).toContain("historyRow(");
    }
  });
});
