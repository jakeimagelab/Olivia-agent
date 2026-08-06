import type { ChecklistItem, Task, TaskFile } from "./types";

export function rowToTask(row: Record<string, any>): Task {
  return {
    id: row.id,
    dueDate: row.due_date,
    dueTime: row.due_time ?? null,
    title: row.title ?? "",
    assigneeName: row.assignee_name ?? null,
    status: row.status,
    priority: row.priority,
    memo: row.memo ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToChecklistItem(row: Record<string, any>): ChecklistItem {
  return {
    id: row.id,
    taskId: row.task_id,
    label: row.label ?? "",
    done: !!row.done,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
  };
}

export function rowToFile(row: Record<string, any>): TaskFile {
  return {
    id: row.id,
    taskId: row.task_id,
    fileName: row.file_name,
    fileSize: row.file_size ?? null,
    fileUrl: row.file_url,
    createdAt: row.created_at,
  };
}
