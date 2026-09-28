/** 내부 저장 키가 화면에 그대로 노출되지 않도록 촬영 준비 항목의 사람용 이름을 모은다. */
export const PREPARATION_FIELD_LABELS: Record<string, string> = {
  contractApproved: "계약서 승인",
  depositConfirmed: "계약금 확인",
  contiApproved: "촬영 콘티 승인",
  contactPhone: "담당자 연락처",
  location: "촬영 장소",
  medicalStaffCount: "의료진 인원",
  hasModel: "모델 여부",
  parkingInfo: "주차 안내",
  shootingTime: "촬영 시간",
  shootingItems: "촬영 항목",
};

/** 알 수 없는 내부 키는 나열하지 않는다. 사용자가 알아야 할 것은 준비되지 않은 항목 수다. */
export function missingPreparationSummary(fields: readonly string[]) {
  const count = fields.filter((field) => Boolean(PREPARATION_FIELD_LABELS[field])).length;
  return `촬영 준비 항목 ${count || fields.length}개가 비어 있습니다.`;
}
