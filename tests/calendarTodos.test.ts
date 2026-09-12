import { describe, expect, it } from "vitest";
import { isCalendarTodoTableMissing, normalizeCalendarTodoTitle, rowToCalendarTodo } from "@/lib/calendarTodos";

describe("calendar todos", () => {
  it("normalizes valid titles", () => {
    expect(normalizeCalendarTodoTitle("  견적 확인  ")).toEqual({ ok: true, title: "견적 확인" });
  });

  it("rejects empty and oversized titles", () => {
    expect(normalizeCalendarTodoTitle("   ").ok).toBe(false);
    expect(normalizeCalendarTodoTitle("가".repeat(161)).ok).toBe(false);
  });

  it("serializes database rows", () => {
    expect(rowToCalendarTodo({ id: "todo-1", title: "확인", completed: true, sort_order: 2, created_at: "a", updated_at: "b" }))
      .toEqual({ id: "todo-1", title: "확인", completed: true, sortOrder: 2, createdAt: "a", updatedAt: "b" });
  });

  it("detects only missing-table errors for the compatibility path", () => {
    expect(isCalendarTodoTableMissing({ code: "PGRST205", message: "Could not find the table calendar_todos in the schema cache" })).toBe(true);
    expect(isCalendarTodoTableMissing({ code: "42P01", message: "relation does not exist" })).toBe(true);
    expect(isCalendarTodoTableMissing({ code: "42501", message: "permission denied" })).toBe(false);
  });
});
