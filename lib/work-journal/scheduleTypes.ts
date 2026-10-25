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

export type EquipmentCategory =
  | "CAMERA"
  | "LENS"
  | "LIGHT"
  | "STAND"
  | "TRIPOD"
  | "SLIDER"
  | "GIMBAL"
  | "TRIGGER"
  | "BATTERY"
  | "STORAGE"
  | "ETC";

export type Equipment = {
  id: string;
  name: string;
  category: EquipmentCategory;
  quantity: number;
  usage: string | null;
  note: string | null;
  active: boolean;
  sortOrder: number;
};

// schedule_equipment 조인 결과 — 활성 장비 전체와 이 일정에서 이미 선택된 비활성 장비를 반환한다.
// 아직 한 번도 건드리지 않은 항목은 scheduleEquipmentId가 null(schedule_equipment 행이 아직 없음).
// checked는 스키마엔 있지만 Phase 1 UI에는 노출하지 않는다(다음 차수 현장 보기 모드용).
export type PrepEquipmentItem = {
  equipmentId: string;
  scheduleEquipmentId: string | null;
  name: string;
  category: EquipmentCategory;
  quantity: number;
  usage: string | null;
  note: string | null;
  inactive: boolean;
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
