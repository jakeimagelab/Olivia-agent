export type ScheduleTodo = {
  id: string;
  scheduleId: string;
  title: string;
  completed: boolean;
  assignee: string | null;
  memo: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type EquipmentCategory = "LIGHT" | "CAMERA" | "COMPUTER" | "ETC";

export type Equipment = {
  id: string;
  name: string;
  category: EquipmentCategory;
  active: boolean;
  sortOrder: number;
};

// schedule_equipment 조인 결과 — equipment 마스터 47개를 항상 전부 반환하며, 이 촬영에서
// 아직 한 번도 건드리지 않은 항목은 scheduleEquipmentId가 null(schedule_equipment 행이 아직 없음).
// checked는 스키마엔 있지만 Phase 1 UI에는 노출하지 않는다(다음 차수 현장 보기 모드용).
export type PrepEquipmentItem = {
  equipmentId: string;
  scheduleEquipmentId: string | null;
  name: string;
  category: EquipmentCategory;
  selected: boolean;
  checked: boolean;
  memo: string | null;
};

export type ScheduleRental = {
  id: string;
  scheduleId: string;
  name: string;
  checked: boolean;
  memo: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};
