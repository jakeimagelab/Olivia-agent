"use client";

import type { MemoTemplateData, MemoTemplateType, TodoItem } from "@/lib/memo/types";

type Props = {
  type: MemoTemplateType;
  data: MemoTemplateData;
  onChange: (data: MemoTemplateData) => void;
};

const inputStyle: React.CSSProperties = {
  width: "100%", border: "none", outline: "none", resize: "vertical", background: "transparent",
  color: "#1C2B28", fontFamily: "inherit", fontSize: 14, lineHeight: 1.75, boxSizing: "border-box",
};

export default function NoteTemplateEditor({ type, data, onChange }: Props) {
  if (type === "blank" || type === "grid") return null;

  if (type === "text") {
    return <textarea aria-label="상담 메모" value={data.body ?? ""} onChange={event => onChange({ ...data, body: event.target.value })} rows={10} placeholder="상담 내용을 자유롭게 적어주세요." style={{ ...inputStyle, minHeight: 240 }} />;
  }

  if (type === "cornell") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(150px,.34fr) minmax(0,1fr)", gap: 0, borderRadius: 16, overflow: "hidden", background: "#FAFCFB" }}>
        <label style={{ padding: 16, borderRight: "1px solid rgba(21,88,85,.11)", minHeight: 230 }}>
          <span style={{ display: "block", color: "#E85D2C", fontSize: 10, fontWeight: 900, letterSpacing: ".12em", marginBottom: 8 }}>KEY CUES</span>
          <textarea value={data.cues ?? ""} onChange={event => onChange({ ...data, cues: event.target.value })} placeholder="핵심 키워드와 질문" style={{ ...inputStyle, minHeight: 180, fontSize: 12 }} />
        </label>
        <label style={{ padding: 16, minHeight: 230 }}>
          <span style={{ display: "block", color: "#155855", fontSize: 10, fontWeight: 900, letterSpacing: ".12em", marginBottom: 8 }}>NOTES</span>
          <textarea value={data.notes ?? ""} onChange={event => onChange({ ...data, notes: event.target.value })} placeholder="상담 내용을 자세히 기록하세요." style={{ ...inputStyle, minHeight: 180 }} />
        </label>
        <label style={{ gridColumn: "1/-1", padding: 16, borderTop: "1px solid rgba(21,88,85,.11)" }}>
          <span style={{ display: "block", color: "#155855", fontSize: 10, fontWeight: 900, letterSpacing: ".12em", marginBottom: 8 }}>SUMMARY</span>
          <textarea value={data.summary ?? ""} onChange={event => onChange({ ...data, summary: event.target.value })} placeholder="결론과 다음 행동을 요약하세요." rows={3} style={inputStyle} />
        </label>
      </div>
    );
  }

  if (type === "todo") {
    const todos = data.todos ?? [];
    const update = (id: string, patch: Partial<TodoItem>) => onChange({ ...data, todos: todos.map(item => item.id === id ? { ...item, ...patch } : item) });
    return (
      <div style={{ display: "grid", gap: 9 }}>
        {todos.map((item, index) => (
          <div key={item.id} style={{ display: "grid", gridTemplateColumns: "32px minmax(0,1fr) 34px", gap: 8, alignItems: "center", padding: "8px 9px", borderRadius: 12, background: item.done ? "#EAF4F2" : "#F8FBFA" }}>
            <input aria-label={`${index + 1}번 할 일 완료`} type="checkbox" checked={item.done} onChange={event => update(item.id, { done: event.target.checked })} style={{ width: 18, height: 18, accentColor: "#155855" }} />
            <input value={item.text} onChange={event => update(item.id, { text: event.target.value })} placeholder="할 일을 입력하세요" style={{ border: "none", outline: "none", background: "transparent", font: "inherit", fontSize: 13, textDecoration: item.done ? "line-through" : "none", color: item.done ? "#78908B" : "#1C2B28" }} />
            <button aria-label="할 일 삭제" onClick={() => onChange({ ...data, todos: todos.filter(row => row.id !== item.id) })} style={{ width: 32, height: 32, border: "none", borderRadius: 99, background: "transparent", color: "#9BB5B0", cursor: "pointer" }}>×</button>
          </div>
        ))}
        <button onClick={() => onChange({ ...data, todos: [...todos, { id: crypto.randomUUID(), text: "", done: false }] })} style={{ justifySelf: "start", border: "none", borderRadius: 99, padding: "9px 14px", background: "#EAF4F2", color: "#155855", font: "inherit", fontSize: 12, fontWeight: 900, cursor: "pointer" }}>+ 할 일 추가</button>
      </div>
    );
  }

  const columns = Math.min(4, Math.max(1, data.contiColumns ?? 2));
  const rows = Math.min(6, Math.max(1, data.contiRows ?? 3));
  const count = columns * rows;
  const captions = [...(data.contiCaptions ?? [])];
  while (captions.length < count) captions.push("");
  const resize = (nextColumns: number, nextRows: number) => onChange({ ...data, contiColumns: nextColumns, contiRows: nextRows, contiCaptions: Array.from({ length: nextColumns * nextRows }, (_, index) => captions[index] ?? "") });
  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        {[{ c: 2, r: 2 }, { c: 2, r: 3 }, { c: 3, r: 3 }].map(preset => (
          <button key={`${preset.c}x${preset.r}`} onClick={() => resize(preset.c, preset.r)} style={{ border: "none", borderRadius: 99, padding: "7px 11px", background: columns === preset.c && rows === preset.r ? "#155855" : "#EAF4F2", color: columns === preset.c && rows === preset.r ? "#fff" : "#155855", font: "inherit", fontSize: 11, fontWeight: 900, cursor: "pointer" }}>{preset.c}×{preset.r}</button>
        ))}
        <label style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: 4, color: "#607873", fontSize: 11 }}>열 <input aria-label="콘티 열" type="number" min={1} max={4} value={columns} onChange={event => resize(Math.min(4, Math.max(1, Number(event.target.value))), rows)} style={{ width: 46, padding: 6, border: "none", borderRadius: 8, background: "#EDF5F3" }} /></label>
        <label style={{ display: "flex", alignItems: "center", gap: 5, color: "#607873", fontSize: 11 }}>행 <input aria-label="콘티 행" type="number" min={1} max={6} value={rows} onChange={event => resize(columns, Math.min(6, Math.max(1, Number(event.target.value))))} style={{ width: 46, padding: 6, border: "none", borderRadius: 8, background: "#EDF5F3" }} /></label>
      </div>
      <div className="memo-conti-captions" style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))`, gap: 10 }}>
        {Array.from({ length: count }, (_, index) => (
          <label key={index} style={{ display: "grid", gap: 5 }}>
            <span style={{ aspectRatio: "16/9", borderRadius: 10, background: "#EDF5F3", display: "grid", placeItems: "center", color: "#9BB5B0", fontSize: 10, fontWeight: 900 }}>FRAME {index + 1}</span>
            <input value={captions[index]} onChange={event => { const next = [...captions]; next[index] = event.target.value; onChange({ ...data, contiCaptions: next }); }} placeholder="장면 설명" style={{ width: "100%", border: "none", borderBottom: "1px solid rgba(21,88,85,.14)", padding: "7px 4px", outline: "none", font: "inherit", fontSize: 11, boxSizing: "border-box" }} />
          </label>
        ))}
      </div>
    </div>
  );
}
