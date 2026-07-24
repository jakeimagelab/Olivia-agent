import { describe, expect, it } from "vitest";
import {
  actionRequiresConfirmation,
  canRoleExecute,
  requiredRoleForAction,
} from "@/lib/assistant/permissions";

describe("assistant permissions", () => {
  it("OWNER는 모든 역할의 Action을 실행할 수 있다", () => {
    expect(canRoleExecute("OWNER", "OWNER")).toBe(true);
    expect(canRoleExecute("OWNER", "READ_ONLY")).toBe(true);
  });

  it("낮은 역할은 높은 역할 Action을 실행할 수 없다", () => {
    expect(canRoleExecute("STAFF", "OWNER")).toBe(false);
    expect(canRoleExecute("READ_ONLY", "STAFF")).toBe(false);
  });

  it("조회 Action은 READ_ONLY에 허용된다", () => {
    expect(requiredRoleForAction("calendar.search")).toBe("READ_ONLY");
    expect(requiredRoleForAction("project.getStatus")).toBe("READ_ONLY");
  });

  it("외부 발송과 민감 작업은 OWNER 전용이다", () => {
    expect(requiredRoleForAction("email.send")).toBe("OWNER");
    expect(requiredRoleForAction("file.delete")).toBe("OWNER");
  });

  it("일정 생성·수정·취소와 발송은 항상 확인이 필요하다", () => {
    expect(actionRequiresConfirmation("calendar.create", "web")).toBe(true);
    expect(actionRequiresConfirmation("calendar.update", "kakao")).toBe(true);
    expect(actionRequiresConfirmation("calendar.cancel", "kakao")).toBe(true);
    expect(actionRequiresConfirmation("email.send", "web")).toBe(true);
  });

  it("조회는 확인 없이 실행할 수 있다", () => {
    expect(actionRequiresConfirmation("project.search", "kakao")).toBe(false);
  });
});
