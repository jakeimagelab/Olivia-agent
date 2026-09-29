import { describe, expect, it } from "vitest";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";
import {
  clientTargetConflictQuestion,
  extractExplicitClientHint,
  recentClientProjectContextFromHistory,
  requireClientTarget,
  resolveTrustedClientProjectContext,
  shouldRequireClientSelection,
} from "./clientTarget";

const emptyContext: OliviaContextSnapshot = { recentActions: [], revision: 0 };

describe("client target policy", () => {
  it("명시적 고객명을 추출하고 실행 요청의 route 선차단을 해제한다", () => {
    expect(extractExplicitClientHint("기통찬 견적 승인해줘")).toBe("기통찬");
    expect(shouldRequireClientSelection({ message: "기통찬 견적 승인해줘", resolved: {} })).toBe(false);
  });

  it("지시어만 있는 요청은 명시 고객명으로 취급하지 않는다", () => {
    expect(extractExplicitClientHint("아까 그 견적 승인해줘")).toBeUndefined();
    expect(shouldRequireClientSelection({ message: "아까 그 견적 승인해줘", resolved: {} })).toBe(true);
  });

  it("확정된 client id가 있으면 고객 종속 실행을 허용한다", () => {
    expect(shouldRequireClientSelection({ message: "견적 승인해줘", resolved: { clientId: "client-1" } })).toBe(false);
  });

  it("고객과 무관한 실행 요청은 대상 없이 허용한다", () => {
    expect(shouldRequireClientSelection({ message: "내일 일정 잡아줘", resolved: {} })).toBe(false);
  });

  it("실행 요청에서는 오래된 recent 고객과 프로젝트를 복구하지 않는다", () => {
    expect(resolveTrustedClientProjectContext({
      message: "견적 승인해줘",
      snapshot: emptyContext,
      recent: { clientId: "old-client", clientName: "이전 고객", projectId: "old-project" },
    })).toEqual({ clientId: undefined, clientName: undefined, projectId: undefined, projectName: undefined });
  });

  it("비실행 대화에서는 recent context를 참고할 수 있다", () => {
    expect(resolveTrustedClientProjectContext({
      message: "아까 견적 내용 알려줘",
      snapshot: emptyContext,
      recent: { clientId: "client-1", clientName: "기통찬", projectId: "project-1", projectName: "가을 촬영" },
    })).toMatchObject({ clientId: "client-1", clientName: "기통찬", projectId: "project-1", projectName: "가을 촬영", clientSource: "conversation" });
  });

  it("explicit context가 snapshot과 recent보다 우선한다", () => {
    expect(resolveTrustedClientProjectContext({
      message: "견적 승인해줘",
      snapshot: { ...emptyContext, activeClientId: "snapshot-client", activeProjectId: "snapshot-project" },
      explicit: { clientId: "explicit-client", clientName: "명시 고객" },
      recent: { clientId: "recent-client" },
    })).toMatchObject({ clientId: "explicit-client", clientName: "명시 고객", projectId: "snapshot-project" });
  });

  it("문장에 지정된 고객 context가 화면과 대화보다 우선한다", () => {
    expect(resolveTrustedClientProjectContext({
      message: "히어산부인과 견적서 열어줘",
      snapshot: { ...emptyContext, activeClientId: "screen", activeClientName: "여의도기통찬", activeClientSelectedAt: "2026-09-27T10:00:00.000Z" },
      explicit: { clientId: "explicit", clientName: "히어산부인과" },
      recent: { clientId: "recent", clientName: "청담스시", clientSelectedAt: "2026-09-27T10:09:00.000Z" },
    })).toMatchObject({ clientId: "explicit", clientName: "히어산부인과", clientSource: "explicit" });
  });

  it("대화에서 더 최근에 확정한 고객은 화면보다 우선한다", () => {
    expect(resolveTrustedClientProjectContext({
      message: "견적서 열어줘",
      snapshot: { ...emptyContext, activeClientId: "screen", activeClientName: "여의도기통찬", activeClientSelectedAt: "2026-09-27T10:00:00.000Z" },
      recent: { clientId: "recent", clientName: "청담스시", clientSelectedAt: "2026-09-27T10:09:00.000Z" },
    })).toMatchObject({ clientId: "recent", clientName: "청담스시", clientSource: "conversation" });
  });

  it("더 최근에 화면에서 직접 고른 고객은 대화보다 우선한다", () => {
    expect(resolveTrustedClientProjectContext({
      message: "견적서 열어줘",
      snapshot: { ...emptyContext, activeClientId: "screen", activeClientName: "여의도기통찬", activeClientSelectedAt: "2026-09-27T10:09:00.000Z" },
      recent: { clientId: "recent", clientName: "청담스시", clientSelectedAt: "2026-09-27T10:00:00.000Z" },
    })).toMatchObject({ clientId: "screen", clientName: "여의도기통찬", clientSource: "screen" });
  });

  it("선택 시각이 없는 구버전 화면은 기존처럼 화면을 우선한다", () => {
    expect(resolveTrustedClientProjectContext({
      message: "견적서 열어줘",
      snapshot: { ...emptyContext, activeClientId: "screen", activeClientName: "여의도기통찬" },
      recent: { clientId: "recent", clientName: "청담스시", clientSelectedAt: "2026-09-27T10:09:00.000Z" },
    })).toMatchObject({ clientId: "screen", clientName: "여의도기통찬", clientSource: "screen" });
  });

  it("화면이 없으면 비실행 문서는 최근 대화 고객을 쓴다", () => {
    expect(resolveTrustedClientProjectContext({
      message: "견적서 열어줘",
      snapshot: emptyContext,
      recent: { clientId: "recent", clientName: "청담스시", clientSelectedAt: "2026-09-27T10:09:00.000Z" },
    })).toMatchObject({ clientId: "recent", clientName: "청담스시" });
  });

  it("화면과 대화가 1분 이내로 어긋나면 실행 대신 대상을 되묻는다", () => {
    const resolved = resolveTrustedClientProjectContext({
      message: "견적서 열어줘",
      snapshot: { ...emptyContext, activeClientId: "screen", activeClientName: "여의도기통찬", activeClientSelectedAt: "2026-09-27T10:00:00.000Z" },
      recent: { clientId: "recent", clientName: "청담스시", clientSelectedAt: "2026-09-27T10:00:30.000Z" },
    });
    expect(resolved.clientConflict).toBeDefined();
    expect(shouldRequireClientSelection({ message: "견적서 열어줘", resolved })).toBe(true);
    expect(clientTargetConflictQuestion({ message: "견적서 열어줘", conflict: resolved.clientConflict! })).toContain("청담스시");
  });

  it("화면과 대화가 같은 고객이면 되묻지 않는다", () => {
    const resolved = resolveTrustedClientProjectContext({
      message: "견적서 열어줘",
      snapshot: { ...emptyContext, activeClientId: "client-1", activeClientName: "청담스시", activeClientSelectedAt: "2026-09-27T10:00:00.000Z" },
      recent: { clientId: "client-1", clientName: "청담스시", clientSelectedAt: "2026-09-27T10:00:30.000Z" },
    });
    expect(resolved.clientConflict).toBeUndefined();
    expect(shouldRequireClientSelection({ message: "견적서 열어줘", resolved })).toBe(false);
  });

  it("assistant 도구 결과의 created_at만 대화 대상 시각으로 쓴다", () => {
    expect(recentClientProjectContextFromHistory([
      { role: "user", created_at: "2026-09-27T10:02:00.000Z", metadata: { clientId: "screen", clientName: "화면 고객" } },
      { role: "assistant", created_at: "2026-09-27T10:01:00.000Z", metadata: { clientId: "chat", hospitalName: "청담스시", projectId: "p1" } },
    ])).toEqual({
      clientId: "chat",
      clientName: "청담스시",
      projectId: "p1",
      projectName: undefined,
      clientSelectedAt: "2026-09-27T10:01:00.000Z",
      clientSource: "conversation",
    });
  });

  it("명시 이름과 active 이름을 사용하고 없으면 최근 후보와 함께 되묻는다", () => {
    expect(requireClientTarget(emptyContext, " 기통찬의원 ", "견적서")).toEqual({ ok: true, clientName: "기통찬의원" });
    expect(requireClientTarget({ ...emptyContext, activeClientName: "화면에 열린 다른 고객" }, undefined, "견적서"))
      .toEqual({ ok: false, message: "어떤 고객의 견적서인가요?" });
    expect(requireClientTarget({ ...emptyContext, activeClientName: "연세라이프구강내과" }, undefined, "계약서"))
      .toEqual({ ok: true, clientName: "연세라이프구강내과" });

    const context: OliviaContextSnapshot = {
      ...emptyContext,
      recentEntities: [
        { type: "client", id: "c1", name: "기통찬의원", lastMentionedAt: "2026-09-25T00:00:00.000Z" },
        { type: "project", id: "p1", name: "9월 촬영", lastMentionedAt: "2026-09-25T00:00:01.000Z" },
        { type: "client", id: "c2", name: "연세라이프구강내과", lastMentionedAt: "2026-09-25T00:00:02.000Z" },
      ],
    };
    expect(requireClientTarget(context, undefined, "견적서")).toEqual({
      ok: false,
      message: "어떤 고객의 견적서인가요?\n최근: 기통찬의원 · 연세라이프구강내과",
    });
  });
});
