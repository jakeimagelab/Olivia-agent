// 코드 요청서 4차(2026-08-16) — 스텝(진행바/전체 과정 모달)을 클릭했을 때 공용으로 쓰는
// "가능하면 이동" 호출. app/api/workflow-runs/[id]/move-step는 guardWorkflowStepJump로
// 이동 가능 여부를 이미 판단한다(문서 없는 quote/contract/conti는 조용히 막힘). 여기서는
// 성공/차단/이미 그 단계임 어느 쪽이든 결과를 신경 쓰지 않는다 — 화면 진입 자체는 항상
// 허용하고, 실제 단계 전진 여부만 이 호출의 성패에 달려 있다(설계 문서 2-4).
export async function tryMoveWorkflowStep(workflowRunId: string, toStepKey: string) {
  try {
    await fetch(`/api/workflow-runs/${workflowRunId}/move-step`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toStepKey, reason: "스텝 클릭으로 이동" }),
    });
  } catch {
    // 네트워크 오류 등도 조용히 무시 — 호출자는 이 함수의 성패와 무관하게 화면을 연다.
  }
}
