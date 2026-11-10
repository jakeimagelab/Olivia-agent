import { describe, expect, it } from "vitest";
import { resolveClassicSelectionShortcut, resolveVisibleClassicSelectionIds } from "@/lib/person-select/classicSelection";
import { matchesPersonLoginName } from "@/lib/person-select/loginNames";

describe("기존 방식 숫자 셀렉", () => {
  it("1은 선택, 0은 해제이며 다른 숫자는 선택을 바꾸지 않는다", () => {
    expect(resolveClassicSelectionShortcut("1")).toBe("select");
    expect(resolveClassicSelectionShortcut("0")).toBe("clear");
    expect(resolveClassicSelectionShortcut("2")).toBeNull();
    expect(resolveClassicSelectionShortcut("5")).toBeNull();
  });
});

describe("모바일 기존 방식 즉시 해제", () => {
  it("서버 응답 전에도 해제 중인 사진을 선택 수와 표시에서 제외한다", () => {
    const serverSelected = new Set(["image-a", "image-b", "image-c"]);
    const visible = resolveVisibleClassicSelectionIds(serverSelected, new Set(["image-b"]));

    expect([...visible]).toEqual(["image-a", "image-c"]);
    expect(serverSelected.size).toBe(3);
  });

  it("서버에서 확정된 뒤 낙관적 해제 목록이 비어도 해제 상태를 유지한다", () => {
    const refreshedSelected = new Set(["image-a", "image-c"]);
    expect([...resolveVisibleClassicSelectionIds(refreshedSelected, new Set())]).toEqual(["image-a", "image-c"]);
  });
});

describe("직책이 포함된 기존 로그인 이름", () => {
  const person = { display_name: "김정현과장님", login_name: "김정현과장님" };

  it("이름만 입력해도 로그인 대상을 찾는다", () => {
    expect(matchesPersonLoginName(person, "김정현")).toBe(true);
  });

  it("기존 직책 포함 로그인 이름도 계속 허용한다", () => {
    expect(matchesPersonLoginName(person, "김정현과장님")).toBe(true);
  });
});
