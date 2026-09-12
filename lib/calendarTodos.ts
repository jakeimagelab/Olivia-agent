export type CalendarTodo = {
  id: string;
  title: string;
  completed: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export function normalizeCalendarTodoTitle(value: unknown) {
  const title = String(value ?? "").normalize("NFC").trim();
  if (!title) return { ok: false as const, error: "할 일을 입력해주세요." };
  if (title.length > 160) return { ok: false as const, error: "할 일은 160자 이하로 입력해주세요." };
  return { ok: true as const, title };
}

export function rowToCalendarTodo(row: Record<string, unknown>): CalendarTodo {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    completed: row.completed === true,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}
