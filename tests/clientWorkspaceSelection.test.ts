import { describe, expect, it } from "vitest";
import { resolveClientWorkspaceSelection, resolveClientWorkspaceSelectionDetail, resolveEmbeddedClientDetailTarget } from "@/components/clients/ClientsWorkspace";

describe("customer workspace selection", () => {
  it("uses an initial customer when the window context genuinely changes", () => {
    expect(resolveClientWorkspaceSelection({
      initialClientId: "client-a",
      initialClientChanged: true,
      selectedClientId: "client-b",
      availableClientIds: ["client-a", "client-b"],
    })).toBe("client-a");
  });

  it("keeps the user's newly selected customer instead of restoring stale initial context", () => {
    expect(resolveClientWorkspaceSelection({
      initialClientId: "client-a",
      initialClientChanged: false,
      selectedClientId: "client-b",
      availableClientIds: ["client-a", "client-b"],
    })).toBe("client-b");
  });

  it("uses the first customer only to keep the detail panel populated", () => {
    expect(resolveClientWorkspaceSelection({
      initialClientId: "missing",
      initialClientChanged: false,
      selectedClientId: "also-missing",
      availableClientIds: ["client-a", "client-b"],
    })).toBe("client-a");
  });

  it("uses the first customer as a visual fallback in a list-only window", () => {
    expect(resolveClientWorkspaceSelection({
      initialClientId: null,
      initialClientChanged: true,
      selectedClientId: null,
      availableClientIds: ["client-a", "client-b"],
    })).toBe("client-a");
  });
});

describe("선택이 채팅의 '지금 대상'을 바꿔도 되는가", () => {
  // 2026-09-27: 고객목록을 그냥 열었더니 첫 고객이 채팅의 대상이 되어,
  // 청담스시 견적서를 이야기하다 "견적서 열어줘"가 엉뚱한 고객을 가리켰다.
  it("목록을 그냥 열어 첫 고객으로 떨어진 것은 명시적 선택이 아니다", () => {
    expect(resolveClientWorkspaceSelectionDetail({
      initialClientId: null,
      initialClientChanged: false,
      selectedClientId: null,
      availableClientIds: ["여의도기통찬의원", "히어산부인과"],
    })).toEqual({ clientId: "여의도기통찬의원", source: "fallback" });
  });

  it("선택이 사라져 첫 고객으로 되돌아간 것도 명시적 선택이 아니다", () => {
    expect(resolveClientWorkspaceSelectionDetail({
      initialClientId: "missing",
      initialClientChanged: false,
      selectedClientId: "also-missing",
      availableClientIds: ["client-a", "client-b"],
    })).toEqual({ clientId: "client-a", source: "fallback" });
  });

  it("창을 특정 고객으로 열면 명시적 선택이다", () => {
    expect(resolveClientWorkspaceSelectionDetail({
      initialClientId: "client-a",
      initialClientChanged: true,
      selectedClientId: "client-b",
      availableClientIds: ["client-a", "client-b"],
    })).toEqual({ clientId: "client-a", source: "explicit" });
  });

  it("사용자가 이미 고른 고객이 유지되는 것은 명시적 선택이다", () => {
    expect(resolveClientWorkspaceSelectionDetail({
      initialClientId: "client-a",
      initialClientChanged: false,
      selectedClientId: "client-b",
      availableClientIds: ["client-a", "client-b"],
    })).toEqual({ clientId: "client-b", source: "explicit" });
  });

  it("고객이 하나도 없으면 none이다", () => {
    expect(resolveClientWorkspaceSelectionDetail({
      initialClientId: null,
      initialClientChanged: false,
      selectedClientId: null,
      availableClientIds: [],
    })).toEqual({ clientId: null, source: "none" });
  });
});

describe("embedded customer detail target", () => {
  it("keeps customer and workflow context inside the native window", () => {
    expect(resolveEmbeddedClientDetailTarget("client-a", "workflow-a")).toEqual({
      clientId: "client-a",
      workflowRunId: "workflow-a",
    });
  });

  it("allows customers without a workflow run to open their native detail", () => {
    expect(resolveEmbeddedClientDetailTarget("client-a")).toEqual({
      clientId: "client-a",
      workflowRunId: null,
    });
  });
});
