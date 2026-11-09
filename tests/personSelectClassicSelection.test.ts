import { describe, expect, it } from "vitest";
import { resolveClassicSelectionShortcut } from "@/lib/person-select/classicSelection";
import { matchesPersonLoginName } from "@/lib/person-select/loginNames";

describe("기존 방식 숫자 셀렉", () => {
  it("1은 선택, 0은 해제이며 다른 숫자는 선택을 바꾸지 않는다", () => {
    expect(resolveClassicSelectionShortcut("1")).toBe("select");
    expect(resolveClassicSelectionShortcut("0")).toBe("clear");
    expect(resolveClassicSelectionShortcut("2")).toBeNull();
    expect(resolveClassicSelectionShortcut("5")).toBeNull();
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
