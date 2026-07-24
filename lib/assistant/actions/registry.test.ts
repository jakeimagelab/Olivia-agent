import { describe, expect, it, vi } from "vitest";
import {
  AssistantActionNotFoundError,
  AssistantConfirmationRequiredError,
  AssistantPermissionError,
  dispatchAssistantAction,
} from "@/lib/assistant/actions/dispatcher";
import { createAssistantActionRegistry } from "@/lib/assistant/actions/registry";
import type { AssistantActionDefinition } from "@/lib/assistant/actions/types";
import type { AssistantActionContext } from "@/lib/assistant/types";
import { requireRecord } from "@/lib/assistant/validation";

const context: AssistantActionContext = {
  ownerId: "6f1ec392-5212-4e59-9747-fdff2651266f",
  role: "OWNER",
  channel: "kakao",
  requestId: "request-1",
};

function action(
  overrides: Partial<AssistantActionDefinition> = {},
): AssistantActionDefinition {
  return {
    actionName: "calendar.search",
    description: "일정 조회",
    requiredRole: "READ_ONLY",
    confirmationRequired: false,
    audit: true,
    validate: (input) => requireRecord(input),
    execute: vi.fn(async () => ({ ok: true, message: "조회 완료" })),
    ...overrides,
  };
}

describe("assistant action registry", () => {
  it("등록된 Action만 실행한다", async () => {
    const registry = createAssistantActionRegistry([action()]);
    await expect(
      dispatchAssistantAction({
        registry,
        context,
        actionName: "calendar.search",
        parameters: {},
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      dispatchAssistantAction({
        registry,
        context,
        actionName: "database.rawQuery",
        parameters: {},
      }),
    ).rejects.toBeInstanceOf(AssistantActionNotFoundError);
  });

  it("중복 Action 등록을 거부한다", () => {
    expect(() => createAssistantActionRegistry([action(), action()])).toThrow(
      "중복된 Assistant Action",
    );
  });

  it("권한이 부족하면 실행하지 않는다", async () => {
    const registry = createAssistantActionRegistry([
      action({ requiredRole: "OWNER" }),
    ]);
    await expect(
      dispatchAssistantAction({
        registry,
        context: { ...context, role: "STAFF" },
        actionName: "calendar.search",
        parameters: {},
      }),
    ).rejects.toBeInstanceOf(AssistantPermissionError);
  });

  it("확인이 필요한 Action은 confirmed 전에는 실행하지 않는다", async () => {
    const execute = vi.fn(async () => ({ ok: true, message: "생성 완료" }));
    const registry = createAssistantActionRegistry([
      action({
        actionName: "calendar.create",
        confirmationRequired: true,
        execute,
      }),
    ]);

    await expect(
      dispatchAssistantAction({
        registry,
        context,
        actionName: "calendar.create",
        parameters: {},
      }),
    ).rejects.toBeInstanceOf(AssistantConfirmationRequiredError);
    expect(execute).not.toHaveBeenCalled();

    await expect(
      dispatchAssistantAction({
        registry,
        context,
        actionName: "calendar.create",
        parameters: {},
        confirmed: true,
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(execute).toHaveBeenCalledOnce();
  });
});
