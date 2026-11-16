import { describe, expect, it } from "vitest";

import {
  nasRawMatchPreferenceStorageKey,
  normalizeNasRawMatchFolderIdentity,
  parseNasRawMatchPreference,
  readNasRawMatchPreference,
  writeNasRawMatchPreference,
} from "@/lib/selectMatch/nasRawMatchPreference";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

describe("NAS RAW 매칭 폴더 기억", () => {
  it("NFC/NFD와 경로 구분자 공백을 같은 로컬 폴더 식별자로 정규화한다", () => {
    const nfc = "촬영/JPG전체";
    const nfd = nfc.normalize("NFD").replace("/", " / ");
    expect(normalizeNasRawMatchFolderIdentity(nfd)).toBe(nfc);
    expect(nasRawMatchPreferenceStorageKey(nfd)).toBe(nasRawMatchPreferenceStorageKey(nfc));
  });

  it("로컬 Bridge 폴더별로 마지막 NAS 촬영 폴더를 독립 저장한다", () => {
    const storage = memoryStorage();
    const first = { path: "root-0/1116_A", displayPath: "1116_A", rootName: "Agentstation" };
    const second = { path: "root-1/1116_B", displayPath: "1116_B", rootName: "Workstation" };
    expect(writeNasRawMatchPreference(storage, "A/JPG전체", first)).toBe(true);
    expect(writeNasRawMatchPreference(storage, "B/JPG전체", second)).toBe(true);
    expect(readNasRawMatchPreference(storage, "A/JPG전체")).toEqual(first);
    expect(readNasRawMatchPreference(storage, "B/JPG전체")).toEqual(second);
  });

  it("저장소가 막히거나 값이 손상돼도 현재 작업을 막지 않는다", () => {
    const blocked = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    const selection = { path: "root-0/project", displayPath: "project", rootName: "NAS" };
    expect(readNasRawMatchPreference(blocked, "project/JPG")).toBeNull();
    expect(writeNasRawMatchPreference(blocked, "project/JPG", selection)).toBe(false);
    expect(parseNasRawMatchPreference({ version: 1, selection: { path: 1 } })).toBeNull();
  });
});
