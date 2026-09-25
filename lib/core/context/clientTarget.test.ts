import { describe, expect, it } from "vitest";
import type { OliviaContextSnapshot } from "@/lib/olivia/v2/types";
import {
  extractExplicitClientHint,
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
    })).toEqual({ clientId: "client-1", clientName: "기통찬", projectId: "project-1", projectName: "가을 촬영" });
  });

  it("explicit context가 snapshot과 recent보다 우선한다", () => {
    expect(resolveTrustedClientProjectContext({
      message: "견적 승인해줘",
      snapshot: { ...emptyContext, activeClientId: "snapshot-client", activeProjectId: "snapshot-project" },
      explicit: { clientId: "explicit-client", clientName: "명시 고객" },
      recent: { clientId: "recent-client" },
    })).toMatchObject({ clientId: "explicit-client", clientName: "명시 고객", projectId: "snapshot-project" });
  });

  it("명시 이름과 active 이름을 사용하고 없으면 최근 후보와 함께 되묻는다", () => {
    expect(requireClientTarget(emptyContext, " 기통찬의원 ", "견적서")).toEqual({ ok: true, clientName: "기통찬의원" });
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
