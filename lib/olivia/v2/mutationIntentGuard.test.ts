import { describe, expect, it } from "vitest";
import { validateMutationIntent } from "./mutationIntentGuard";

describe("Mutation Intent Guard", () => {
  const deleteRequest = "여의도기통찬의원 고객등록에서 삭제해줘";

  it.each(["client_create", "apply_client_create", "client_update"])("삭제 요청에서 %s를 차단한다", (toolName) => {
    expect(validateMutationIntent({ requestText: deleteRequest, toolName })).toEqual({
      allowed: false,
      code: "MUTATION_INTENT_CONFLICT",
      reason: "고객 삭제 요청을 고객 생성이나 수정 작업으로 바꿔 실행할 수 없습니다.",
    });
  });

  it("신규 고객 등록 요청에서 보관을 차단한다", () => {
    for (const toolName of ["client_archive", "apply_client_archive"]) {
      expect(validateMutationIntent({ requestText: "새봄의원 신규 고객으로 등록해줘", toolName }))
        .toMatchObject({ allowed: false, code: "MUTATION_INTENT_CONFLICT" });
    }
  });

  it("일반 삭제 요청의 보관 승인/실행은 허용한다", () => {
    expect(validateMutationIntent({ requestText: deleteRequest, toolName: "client_archive" })).toEqual({ allowed: true });
    expect(validateMutationIntent({ requestText: deleteRequest, toolName: "apply_client_archive" })).toEqual({ allowed: true });
  });

  it("완전 삭제 요청은 모든 고객 mutation을 차단하고 화면 삭제를 안내한다", () => {
    for (const toolName of ["client_create", "apply_client_create", "client_update", "client_archive", "apply_client_archive"]) {
      expect(validateMutationIntent({ requestText: "여의도기통찬의원을 완전히 삭제해줘", toolName }))
        .toMatchObject({ allowed: false, code: "MUTATION_INTENT_CONFLICT", reason: expect.stringContaining("고객관리 화면") });
    }
  });
});
