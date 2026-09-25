export function contractCompletionSummary(input: {
  idempotent?: boolean;
  currentStepName: string;
}) {
  return input.idempotent
    ? `이미 최종완료된 계약서예요. 현재 프로젝트는 ${input.currentStepName} 단계입니다.`
    : "계약서를 최종완료하고 콘티 단계로 이동했어요.";
}

export function contiCompletionSummary(input: {
  idempotent?: boolean;
  currentStepName: string;
}) {
  return input.idempotent
    ? `이미 최종완료된 콘티예요. 현재 프로젝트는 ${input.currentStepName} 단계입니다.`
    : "콘티를 최종완료하고 촬영 단계로 이동했어요.";
}
