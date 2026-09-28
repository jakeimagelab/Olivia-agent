"use client";

import { useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import MemoTextArea from "@/components/memo/MemoTextArea";
import type { TodoItem } from "@/lib/memo/types";

type Props = {
  todos: TodoItem[];
  onChange: (todos: TodoItem[]) => void;
};

function newTodo(): TodoItem {
  return { id: crypto.randomUUID(), text: "", done: false };
}

export default function TodoListPanel({ todos, onChange }: Props) {
  const rows = todos.length ? todos : [newTodo()];
  const textareaRefs = useRef(new Map<string, HTMLTextAreaElement>());

  const focus = (id: string, atEnd = false) => requestAnimationFrame(() => {
    const field = textareaRefs.current.get(id);
    if (!field) return;
    field.focus();
    const position = atEnd ? field.value.length : 0;
    field.setSelectionRange(position, position);
  });
  const update = (id: string, patch: Partial<TodoItem>) => onChange(rows.map((todo) => todo.id === id ? { ...todo, ...patch } : todo));
  const append = (afterId?: string) => {
    const item = newTodo();
    const index = afterId ? rows.findIndex((todo) => todo.id === afterId) : rows.length - 1;
    const next = index < 0 ? [...rows, item] : [...rows.slice(0, index + 1), item, ...rows.slice(index + 1)];
    onChange(next);
    focus(item.id);
  };
  const remove = (id: string) => {
    const index = rows.findIndex((todo) => todo.id === id);
    const next = rows.filter((todo) => todo.id !== id);
    if (!next.length) {
      const item = newTodo();
      onChange([item]);
      focus(item.id);
      return;
    }
    onChange(next);
    const prior = next[Math.max(0, index - 1)];
    focus(prior.id, true);
  };
  const completed = rows.filter((todo) => todo.done).length;

  return (
    <section className="memo-todo-panel" aria-label="할 일 목록">
      <header><strong>To do list</strong><span>{completed} / {rows.length} 완료</span></header>
      <div className="memo-todo-list">
        {rows.map((todo) => (
          <div className={`memo-todo-row${todo.done ? " is-done" : ""}`} key={todo.id}>
            <input
              aria-label={`${todo.text || "할 일"} 완료`}
              type="checkbox"
              checked={todo.done}
              onChange={() => update(todo.id, { done: !todo.done })}
            />
            <MemoTextArea
              ref={(node) => {
                if (node) textareaRefs.current.set(todo.id, node);
                else textareaRefs.current.delete(todo.id);
              }}
              aria-label="할 일 내용"
              rows={1}
              value={todo.text}
              onChange={(text) => update(todo.id, { text })}
              onEnter={() => append(todo.id)}
              onEmptyBackspace={() => remove(todo.id)}
              placeholder="할 일을 입력하세요"
            />
            <button type="button" className="memo-todo-delete" aria-label="할 일 삭제" onClick={() => remove(todo.id)}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <button type="button" className="memo-todo-add" onClick={() => append()}><Plus size={16} /> 항목 추가</button>
    </section>
  );
}
