import { describe, expect, it } from "vitest";
import { canApproveTask, canSubmitTask, canToggleChecklistItem, canViewTask } from "./permissions";

const employee = { id: "11111111-1111-4111-8111-111111111111", isAdmin: false };
const owner = { id: "22222222-2222-4222-8222-222222222222", isAdmin: false };
const creator = { id: "33333333-3333-4333-8333-333333333333", isAdmin: false };
const stranger = { id: "44444444-4444-4444-8444-444444444444", isAdmin: false };

describe("team task permissions", () => {
  it("담당자는 진행 중인 업무를 확인 요청할 수 있다", () => {
    expect(canSubmitTask(employee, {
      assignee_id: employee.id,
      created_by: creator.id,
      status: "in_progress",
    })).toBe(true);
  });

  it("일반 직원은 타인의 업무를 승인할 수 없다", () => {
    expect(canApproveTask(employee, {
      assignee_id: owner.id,
      created_by: creator.id,
      status: "review",
    })).toBe(false);
  });

  it("프로젝트 owner는 담당자가 다른 업무를 승인할 수 있다", () => {
    expect(canApproveTask(owner, {
      assignee_id: employee.id,
      created_by: creator.id,
      status: "review",
      project: { owner_id: owner.id, created_by: creator.id },
    })).toBe(true);
  });

  it("일반 직원은 본인 업무를 본인이 승인할 수 없다", () => {
    expect(canApproveTask(employee, {
      assignee_id: employee.id,
      created_by: employee.id,
      status: "review",
    })).toBe(false);
  });

  it("관리자가 직접 만들고 수행한 내부 업무는 직접 승인할 수 있다", () => {
    const admin = { ...employee, isAdmin: true };
    expect(canApproveTask(admin, {
      assignee_id: admin.id,
      created_by: admin.id,
      status: "review",
    })).toBe(true);
  });

  it("캘린더 연동 업무는 담당자·생성자가 아닌 직원도 볼 수 있다", () => {
    expect(canViewTask(stranger, {
      assignee_id: null,
      created_by: creator.id,
      calendarLinked: true,
    })).toBe(true);
  });

  it("캘린더 연동이 아닌 업무는 관계 없는 직원이 볼 수 없다", () => {
    expect(canViewTask(stranger, {
      assignee_id: null,
      created_by: creator.id,
      calendarLinked: false,
    })).toBe(false);
  });

  it("체크리스트 항목의 담당자는 업무 편집 권한이 없어도 그 항목은 체크할 수 있다", () => {
    expect(canToggleChecklistItem(employee, {
      assignee_id: null,
      created_by: creator.id,
    }, employee.id)).toBe(true);
  });

  it("체크리스트 항목의 담당자가 아니고 업무 편집 권한도 없으면 체크할 수 없다", () => {
    expect(canToggleChecklistItem(stranger, {
      assignee_id: null,
      created_by: creator.id,
    }, employee.id)).toBe(false);
  });

  it("업무 편집 권한이 있으면 담당자가 아닌 체크리스트 항목도 체크할 수 있다", () => {
    expect(canToggleChecklistItem(creator, {
      assignee_id: null,
      created_by: creator.id,
    }, employee.id)).toBe(true);
  });
});
