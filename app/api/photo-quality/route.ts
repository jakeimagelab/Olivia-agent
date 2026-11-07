/**
 * 이전의 인증 없는 base64 AI 분석 API는 폐기했다.
 * 프로젝트 소유관계·관리자 권한·배치 캐시를 검증하는 새 경로만 사용한다.
 */
export async function POST() {
  return Response.json({
    ok: false,
    error: "프로젝트 AI 품질 검사 API를 사용해 주세요.",
    endpoint: "/api/person-select/{eventId}/quality",
  }, { status: 410 });
}
