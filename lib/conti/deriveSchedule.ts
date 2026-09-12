export interface ScheduleSceneInput {
  id: string;
  sort: number;
  name: string;
  space_text?: string | null;
  minutes?: number | null;
}
export interface DerivedContiScheduleRow {
  sceneId: string;
  order: number;
  name: string;
  location: string;
  minutes: number;
  startTime?: string;
  endTime?: string;
}

function parseTime(value: string | undefined): number | null {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

export function deriveContiSchedule(scenes: ScheduleSceneInput[], startTime?: string): DerivedContiScheduleRow[] {
  let cursor = parseTime(startTime);
  return [...scenes]
    .sort((left, right) => left.sort - right.sort)
    .map((scene, index) => {
      const minutes = Number.isFinite(scene.minutes) && Number(scene.minutes) > 0 ? Number(scene.minutes) : 0;
      const row: DerivedContiScheduleRow = {
        sceneId: scene.id,
        order: index + 1,
        name: scene.name || "이름 없는 장면",
        location: scene.space_text?.trim() || "장소 미정",
        minutes,
      };
      if (cursor != null) {
        row.startTime = formatTime(cursor);
        cursor += minutes;
        row.endTime = formatTime(cursor);
      }
      return row;
    });
}
