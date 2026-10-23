import type { ContiDoctor, ContiMedia, ContiRepeatScope } from "@/components/conti/v2/types";
import type { ContiScheduleBlock, ContiScheduleSegment, ContiStudioState } from "@/lib/conti/studioState";

export interface ScheduleSceneInput {
  id: string;
  sort: number;
  scene_code?: string | null;
  name: string;
  space_text?: string | null;
  minutes?: number | null;
  keyword?: string | null;
  description?: string | null;
  people_text?: string | null;
  patient_role_text?: string | null;
  preparation_text?: string | null;
  note?: string | null;
  repeat_scope?: ContiRepeatScope;
  media?: ContiMedia;
}

export interface DerivedContiScheduleStep {
  id: string;
  sceneId?: string;
  name: string;
  minutes: number;
  media: ContiMedia;
}

export interface DerivedContiScheduleRow {
  rowId: string;
  sceneId: string;
  sceneIds: string[];
  order: number;
  name: string;
  location: string;
  minutes: number;
  startTime?: string;
  endTime?: string;
  date?: string;
  segmentId?: string;
  dayLabel?: string;
  type: "scene" | "doctor" | "break";
  locked: boolean;
  media: ContiMedia;
  keyword: string;
  description: string;
  people: string;
  patientRole: string;
  preparation: string;
  note: string;
  doctorId?: string;
  doctorName?: string;
  surgeries?: string[];
  steps?: DerivedContiScheduleStep[];
}

export interface ScheduleSegmentSummary {
  segmentId: string;
  usedMinutes: number;
  availableMinutes: number;
  remainingMinutes: number;
  warning: boolean;
}

type ScheduleOptions = { doctors?: ContiDoctor[]; studioState?: ContiStudioState };

function parseTime(value: string | undefined): number | null {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function duration(scene: ScheduleSceneInput): number {
  return Number.isFinite(scene.minutes) && Number(scene.minutes) > 0 ? Number(scene.minutes) : 0;
}

function baseRow(scene: ScheduleSceneInput): DerivedContiScheduleRow {
  return {
    rowId: `${scene.id}:once`, sceneId: scene.id, sceneIds: [scene.id], order: 0,
    name: scene.name || "이름 없는 장면", location: scene.space_text?.trim() || "장소 미정",
    minutes: duration(scene), type: "scene", locked: false, media: scene.media ?? "photo",
    keyword: scene.keyword?.trim() || "", description: scene.description?.trim() || "",
    people: scene.people_text?.trim() || "", patientRole: scene.patient_role_text?.trim() || "",
    preparation: scene.preparation_text?.trim() || "", note: scene.note?.trim() || "",
  };
}

function doctorRows(scenes: ScheduleSceneInput[], doctors: ContiDoctor[]): DerivedContiScheduleRow[] {
  const stageMinutes = scenes.reduce((sum, scene) => sum + duration(scene), 0);
  return doctors.map((doctor, index) => {
    const name = doctor.name.trim() || `의료진 ${index + 1}`;
    const steps: DerivedContiScheduleStep[] = [
      ...scenes.map((scene) => ({ id: `${scene.id}:${doctor.id}`, sceneId: scene.id, name: scene.name, minutes: duration(scene), media: scene.media ?? "photo" as ContiMedia })),
      { id: `cleanup:${doctor.id}`, name: "정리 · 이동", minutes: 10, media: "none" },
    ];
    return {
      ...baseRow(scenes[0]), rowId: `doctor:${doctor.id}`, sceneIds: scenes.map((scene) => scene.id),
      name, location: "의료진 촬영 동선", minutes: stageMinutes + 10, type: "doctor", media: "photo_video",
      people: name, doctorId: doctor.id, doctorName: name, surgeries: doctor.surgeries, steps,
    };
  });
}

function pairRows(scene: ScheduleSceneInput, doctors: ContiDoctor[]): DerivedContiScheduleRow[] {
  const rows: DerivedContiScheduleRow[] = [];
  for (let index = 0; index < doctors.length; index += 2) {
    const pair = doctors.slice(index, index + 2);
    const names = pair.map((doctor) => doctor.name.trim()).filter(Boolean).join(" · ") || `의료진 ${index + 1}`;
    rows.push({ ...baseRow(scene), rowId: `${scene.id}:pair:${pair.map((doctor) => doctor.id).join("-")}`, name: `${scene.name} · ${names}`, people: names, type: "doctor", doctorId: pair.map((doctor) => doctor.id).join("-"), doctorName: names, surgeries: pair.flatMap((doctor) => doctor.surgeries) });
  }
  return rows;
}

function blockRow(block: ContiScheduleBlock): DerivedContiScheduleRow {
  return {
    rowId: `block:${block.id}`, sceneId: `block:${block.id}`, sceneIds: [], order: 0, name: block.label,
    location: block.location || "", minutes: block.minutes, segmentId: block.segmentId, type: "break", locked: true,
    media: "none", keyword: "", description: "촬영이 아닌 고정 일정", people: "", patientRole: "", preparation: "", note: "",
    ...(block.startTime ? { startTime: block.startTime } : {}),
  };
}

function applyTimelineOrder(rows: DerivedContiScheduleRow[], order: string[]): DerivedContiScheduleRow[] {
  if (!order.length) return rows;
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...rows].sort((left, right) => (rank.get(left.rowId) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.rowId) ?? Number.MAX_SAFE_INTEGER));
}

// 단체사진과 단체 하모니컷은 콘티에서는 서로 다른 장면 정의로 남기되,
// 같은 인원이 이어서 촬영하므로 타임테이블에서는 한 블록으로 전개한다.
function collapseContinuousGroupPhotos(rows: DerivedContiScheduleRow[]): DerivedContiScheduleRow[] {
  const firstIndex = rows.findIndex((row) => row.name === "단체사진");
  const harmonyIndex = rows.findIndex((row) => row.name === "단체 하모니컷");
  if (firstIndex < 0 || harmonyIndex < 0) return rows;
  const first = rows[firstIndex]; const harmony = rows[harmonyIndex];
  const combined: DerivedContiScheduleRow = {
    ...first,
    rowId: `combined:${first.sceneId}:${harmony.sceneId}`,
    sceneIds: [first.sceneId, harmony.sceneId],
    name: "단체사진 · 단체 하모니컷",
    minutes: first.minutes + harmony.minutes,
    description: [first.description, harmony.description].filter(Boolean).join("\n"),
    preparation: [first.preparation, harmony.preparation].filter(Boolean).join(", "),
  };
  const result = rows.filter((_, index) => index !== firstIndex && index !== harmonyIndex);
  result.splice(Math.min(firstIndex, harmonyIndex), 0, combined);
  return result;
}

function segmentForRow(row: DerivedContiScheduleRow, segments: ContiScheduleSegment[], doctors: ContiDoctor[]): ContiScheduleSegment | undefined {
  if (row.segmentId) return segments.find((segment) => segment.id === row.segmentId) ?? segments[0];
  if (row.doctorId) {
    const day = doctors.find((doctor) => doctor.id === row.doctorId)?.day;
    if (day) return segments.find((segment) => segment.id === day || segment.date === day || segment.label === day) ?? segments[0];
  }
  return segments[0];
}

export function deriveContiSchedule(scenes: ScheduleSceneInput[], startTimeOrOptions?: string | ScheduleOptions): DerivedContiScheduleRow[] {
  const legacyStartTime = typeof startTimeOrOptions === "string" ? startTimeOrOptions : undefined;
  const options = typeof startTimeOrOptions === "object" ? startTimeOrOptions : {};
  const doctors = options.doctors ?? [];
  const state = options.studioState;
  const segments = state?.scheduleSegments?.length ? state.scheduleSegments : [{ id: "day-1", label: "1일차", startTime: legacyStartTime, endTime: undefined }];

  const sorted = [...scenes].sort((left, right) => left.sort - right.sort);
  const personal = sorted.filter((scene) => (scene.repeat_scope ?? "once") === "per_doctor");
  const expanded: DerivedContiScheduleRow[] = [];
  let insertedPersonal = false;
  for (const scene of sorted) {
    const scope = scene.repeat_scope ?? "once";
    if (scope === "per_doctor") {
      if (!insertedPersonal) {
        const fallbackDoctor: ContiDoctor = { id: "doctor-1", name: "의료진 1", surgeries: [], note: "", day: null };
        expanded.push(...doctorRows(personal, doctors.length ? doctors : [fallbackDoctor]));
        insertedPersonal = true;
      }
      continue;
    }
    if (scope === "per_doctor_pair") expanded.push(...pairRows(scene, doctors));
    else expanded.push(baseRow(scene));
  }
  const ordered = applyTimelineOrder([...collapseContinuousGroupPhotos(expanded), ...(state?.scheduleBlocks ?? []).map(blockRow)], state?.timelineOrder ?? []);
  const cursorBySegment = new Map<string, number | null>();
  for (const segment of segments) cursorBySegment.set(segment.id, parseTime(segment.startTime));

  return ordered.map((source, index) => {
    const segment = segmentForRow(source, segments, doctors);
    const row = {
      ...source,
      order: index + 1,
      ...(segment ? { segmentId: segment.id, dayLabel: segment.label, ...(segment.date ? { date: segment.date } : {}) } : {}),
    };
    if (!segment) return row;
    let cursor = cursorBySegment.get(segment.id) ?? null;
    const fixed = state?.fixedSceneTimes?.[source.sceneId];
    if (fixed?.segmentId === segment.id) { const fixedStart = parseTime(fixed.startTime); if (fixedStart != null) cursor = fixedStart; row.locked = true; }
    const explicitStart = parseTime(source.startTime);
    if (explicitStart != null) cursor = explicitStart;
    const override = state?.timelineOverrides?.[source.rowId];
    const hasDateOverride = Boolean(override) && Object.prototype.hasOwnProperty.call(override, "date");
    const hasStartOverride = Boolean(override) && Object.prototype.hasOwnProperty.call(override, "startTime");
    const hasEndOverride = Boolean(override) && Object.prototype.hasOwnProperty.call(override, "endTime");

    if (hasDateOverride) {
      if (override?.date) row.date = override.date;
      else delete row.date;
    }

    const overriddenStart = parseTime(override?.startTime ?? undefined);
    const calculationStart = hasStartOverride && overriddenStart != null ? overriddenStart : cursor;
    const calculatedEnd = calculationStart != null ? calculationStart + row.minutes : null;

    if (hasStartOverride) {
      if (override?.startTime) row.startTime = override.startTime;
      else delete row.startTime;
    } else if (calculationStart != null) {
      row.startTime = formatTime(calculationStart);
    }

    const overriddenEnd = parseTime(override?.endTime ?? undefined);
    if (hasEndOverride) {
      if (override?.endTime) row.endTime = override.endTime;
      else delete row.endTime;
    } else if (calculatedEnd != null) {
      row.endTime = formatTime(calculatedEnd);
    }

    const nextCursor = hasEndOverride && overriddenEnd != null ? overriddenEnd : calculatedEnd;
    if (nextCursor != null) cursorBySegment.set(segment.id, nextCursor);
    return row;
  });
}

export function summarizeScheduleSegments(rows: DerivedContiScheduleRow[], segments: ContiScheduleSegment[]): ScheduleSegmentSummary[] {
  return segments.map((segment) => {
    const start = parseTime(segment.startTime); const end = parseTime(segment.endTime);
    const availableMinutes = start != null && end != null && end >= start ? end - start : 0;
    const usedMinutes = rows.filter((row) => row.segmentId === segment.id).reduce((sum, row) => sum + row.minutes, 0);
    const remainingMinutes = Math.max(0, availableMinutes - usedMinutes);
    return { segmentId: segment.id, usedMinutes, availableMinutes, remainingMinutes, warning: availableMinutes > 0 && remainingMinutes === 0 };
  });
}
