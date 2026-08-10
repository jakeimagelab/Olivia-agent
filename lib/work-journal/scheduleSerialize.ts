import type { Equipment, ScheduleRental, ScheduleTodo } from "./scheduleTypes";

export function rowToScheduleTodo(row: Record<string, any>): ScheduleTodo {
  return {
    id: row.id,
    scheduleId: row.schedule_id,
    title: row.title ?? "",
    completed: !!row.completed,
    assignee: row.assignee ?? null,
    memo: row.memo ?? null,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToEquipment(row: Record<string, any>): Equipment {
  return {
    id: row.id,
    name: row.name ?? "",
    category: row.category,
    active: !!row.active,
    sortOrder: row.sort_order ?? 0,
  };
}

export function rowToScheduleRental(row: Record<string, any>): ScheduleRental {
  return {
    id: row.id,
    scheduleId: row.schedule_id,
    name: row.name ?? "",
    checked: !!row.checked,
    memo: row.memo ?? null,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
