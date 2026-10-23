import type { ContiStudioDocument } from "@/components/conti/v2/types";
import type { DerivedContiChecklistItem } from "@/lib/conti/deriveChecklist";
import type { DerivedContiScheduleRow } from "@/lib/conti/deriveSchedule";

export interface ContiExportRow {
  no: string;
  group: string;
  scene: string;
  shootingTime: string;
  minutes: number | "";
  media: string;
  keyword: string;
  description: string;
  location: string;
  people: string;
  patientRole: string;
  preparation: string;
}

export interface ContiChecklistExportRow {
  completed: string;
  group: string;
  item: string;
  note: string;
  assignee: string;
}

export interface ContiScheduleExportRow {
  day: string;
  order: number;
  start: string;
  end: string;
  minutes: number;
  scene: string;
  content: string;
  makeup: string;
  people: string;
  location: string;
  note: string;
}

export interface ContiPersonalCompositionRow {
  order: number;
  scene: string;
  minutes: number;
  media: string;
}

export interface ContiExportModel {
  title: string;
  contiRows: ContiExportRow[];
  checklistRows: ContiChecklistExportRow[];
  scheduleRows: ContiScheduleExportRow[];
  personalComposition: ContiPersonalCompositionRow[];
  personalCompositionTotal: number;
}

export function mediaLabel(value: string | null | undefined): string {
  if (value === "none") return "—";
  return value === "photo_video" ? "사진 + 영상" : "사진";
}

export function sceneShootingTime(document: ContiStudioDocument, schedule: DerivedContiScheduleRow[], sceneId: string): string {
  const scene = document.scenes.find((item) => item.id === sceneId);
  if (!scene) return "";
  const meta = document.studioState.sceneMeta[sceneId];
  if (meta && Object.prototype.hasOwnProperty.call(meta, "shootingTimeOverride")) return meta.shootingTimeOverride ?? "";
  if (scene.repeat_scope === "per_doctor") return "타임테이블에서 전개";
  const row = schedule.find((item) => item.sceneIds.includes(sceneId));
  return row?.startTime && row.endTime ? `${row.startTime}–${row.endTime}` : "";
}

function dayWithDate(row: DerivedContiScheduleRow): string {
  if (!row.date) return row.dayLabel || "";
  const parsed = new Date(`${row.date}T00:00:00+09:00`);
  const weekday = Number.isNaN(parsed.getTime()) ? "" : new Intl.DateTimeFormat("ko-KR", { weekday: "short", timeZone: "Asia/Seoul" }).format(parsed);
  return `${row.date}${weekday ? ` (${weekday})` : ""}`;
}

export function buildContiExportModel(input: {
  title: string;
  document: ContiStudioDocument;
  checklist: DerivedContiChecklistItem[];
  schedule: DerivedContiScheduleRow[];
}): ContiExportModel {
  const { title, document, checklist, schedule } = input;
  const groupById = new Map(document.groups.map((group) => [group.id, group.name]));
  const contiRows = document.scenes.map((scene, index): ContiExportRow => ({
    no: scene.scene_code || `S${index + 1}`,
    group: groupById.get(scene.group_id ?? "") || "미지정",
    scene: scene.name,
    shootingTime: sceneShootingTime(document, schedule, scene.id),
    minutes: scene.minutes ?? "",
    media: mediaLabel(scene.media),
    keyword: scene.keyword,
    description: scene.description,
    location: scene.space_text,
    people: scene.people_text,
    patientRole: scene.patient_role_text,
    preparation: scene.preparation_text,
  }));
  const checklistRows = checklist.map((item): ContiChecklistExportRow => ({
    completed: item.completed ? "완료" : "미완료",
    group: item.linkedSceneIds.length ? "장면 준비" : "공통",
    item: item.label,
    note: item.notes || "",
    assignee: document.studioState.checklistAssignees[item.id] || "",
  }));
  const scheduleRows = schedule.map((row): ContiScheduleExportRow => ({
    day: dayWithDate(row),
    order: row.order,
    start: row.startTime || "",
    end: row.endTime || "",
    minutes: row.minutes,
    scene: row.name,
    content: row.description,
    makeup: row.steps?.some((step) => step.name.includes("메이크업")) ? "병행" : "",
    people: row.doctorName || row.people || "",
    location: row.location,
    note: row.note,
  }));
  const personalSource = schedule.find((row) => row.type === "doctor" && row.steps?.length)?.steps ?? [];
  const personalComposition = personalSource.map((step, index): ContiPersonalCompositionRow => ({
    order: index + 1,
    scene: step.name,
    minutes: step.minutes,
    media: mediaLabel(step.media),
  }));
  return {
    title,
    contiRows,
    checklistRows,
    scheduleRows,
    personalComposition,
    personalCompositionTotal: personalComposition.reduce((sum, row) => sum + row.minutes, 0),
  };
}
