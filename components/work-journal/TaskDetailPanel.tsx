"use client";

import { useRef, useState } from "react";
import { Check, Download, File as FileIcon, Plus, Trash2, X } from "lucide-react";
import { C, R } from "@/lib/theme";
import type { TaskDetail, TaskPriority, TaskStatus } from "@/lib/work-journal/types";

const STATUS_LABEL: Record<TaskStatus, string> = { todo: "대기", in_progress: "진행 중", done: "완료" };
const PRIORITY_LABEL: Record<TaskPriority, string> = { low: "낮음", normal: "보통", high: "높음" };
const PRIORITY_COLOR: Record<TaskPriority, string> = { low: C.hint, normal: C.orange, high: C.danger };
const MEMO_MAX = 500;

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function dueDateLabel(dueDate: string): string {
  const d = new Date(`${dueDate}T00:00:00`);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${dueDate.replace(/-/g, ".")}(${weekday})`;
}

export default function TaskDetailPanel({
  detail,
  onUpdate,
  onDelete,
  onAddChecklistItem,
  onToggleChecklistItem,
  onDeleteChecklistItem,
  onUploadFile,
  onDeleteFile,
  assigneeOptions,
}: {
  detail: TaskDetail | null;
  onUpdate: (patch: Partial<TaskDetail>) => void;
  onDelete: () => void;
  onAddChecklistItem: (label: string) => void;
  onToggleChecklistItem: (itemId: string, done: boolean) => void;
  onDeleteChecklistItem: (itemId: string) => void;
  onUploadFile: (file: File) => void;
  onDeleteFile: (fileId: string) => void;
  assigneeOptions: string[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [newChecklistLabel, setNewChecklistLabel] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!detail) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.hint, fontSize: 12.5, textAlign: "center", padding: 20 }}>
        업무를 선택하면<br />세부 내용을 확인할 수 있습니다.
      </div>
    );
  }

  const addChecklist = () => {
    if (!newChecklistLabel.trim()) return;
    onAddChecklistItem(newChecklistLabel.trim());
    setNewChecklistLabel("");
  };

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    Array.from(files).forEach((file) => onUploadFile(file));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginBottom: 12, flexShrink: 0, position: "relative" }}>
        <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-label="더보기"
          style={{ width: 28, height: 28, borderRadius: R.sm, border: `1px solid ${C.border}`, background: "#fff", color: C.muted, cursor: "pointer" }}>
          ⋮
        </button>
        {menuOpen ? (
          <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: "#fff", border: `1px solid ${C.border}`, borderRadius: R.md, boxShadow: "0 8px 24px rgba(21,88,85,.12)", zIndex: 20, minWidth: 120 }}>
            <button type="button" onClick={() => { setMenuOpen(false); onDelete(); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", border: 0, background: "transparent", fontSize: 12, color: C.danger, cursor: "pointer" }}>
              업무 삭제
            </button>
          </div>
        ) : null}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <button
            type="button"
            onClick={() => onUpdate({ status: detail.status === "done" ? "todo" : "done" })}
            aria-label="완료 표시"
            style={{
              width: 22, height: 22, marginTop: 3, borderRadius: "50%", border: `1.5px solid ${detail.status === "done" ? C.success : C.border}`,
              background: detail.status === "done" ? C.success : "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
            }}
          >
            {detail.status === "done" ? <Check size={13} color="#fff" strokeWidth={3} /> : null}
          </button>
          <input
            value={detail.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            placeholder="업무 제목"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 18, fontWeight: 900, color: C.ink, fontFamily: "inherit", padding: 0 }}
          />
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <FieldRow label="담당자">
            <input
              value={detail.assigneeName ?? ""}
              onChange={(e) => onUpdate({ assigneeName: e.target.value })}
              list="wj-detail-assignee-options"
              placeholder="담당자 이름"
              style={{ height: 30, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 10px", fontSize: 12.5, width: "100%", boxSizing: "border-box" }}
            />
            <datalist id="wj-detail-assignee-options">
              {assigneeOptions.map((name) => <option key={name} value={name} />)}
            </datalist>
          </FieldRow>
          <FieldRow label="마감일">
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="date"
                value={detail.dueDate}
                onChange={(e) => onUpdate({ dueDate: e.target.value })}
                style={{ height: 30, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 8px", fontSize: 12, flex: 1 }}
              />
              <input
                type="time"
                value={detail.dueTime ?? ""}
                onChange={(e) => onUpdate({ dueTime: e.target.value || null })}
                style={{ height: 30, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 8px", fontSize: 12, width: 96 }}
              />
            </div>
            <span style={{ fontSize: 10.5, color: C.hint }}>{dueDateLabel(detail.dueDate)}{detail.dueTime ? ` ${detail.dueTime}` : ""}</span>
          </FieldRow>
          <FieldRow label="우선순위">
            <select
              value={detail.priority}
              onChange={(e) => onUpdate({ priority: e.target.value as TaskPriority })}
              style={{ height: 30, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 8px", fontSize: 12.5, width: "100%", color: PRIORITY_COLOR[detail.priority], fontWeight: 700 }}
            >
              {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="상태">
            <select
              value={detail.status}
              onChange={(e) => onUpdate({ status: e.target.value as TaskStatus })}
              style={{ height: 30, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 8px", fontSize: 12.5, width: "100%" }}
            >
              {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </FieldRow>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, marginBottom: 8 }}>세부 체크리스트</div>
          <div style={{ display: "grid", gap: 6 }}>
            {detail.checklist.map((item) => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => onToggleChecklistItem(item.id, !item.done)}
                  aria-label="체크"
                  style={{
                    width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${item.done ? C.success : C.border}`,
                    background: item.done ? C.success : "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
                  }}
                >
                  {item.done ? <Check size={10} color="#fff" strokeWidth={3} /> : null}
                </button>
                <span style={{ flex: 1, fontSize: 12, color: item.done ? C.hint : C.ink, textDecoration: item.done ? "line-through" : "none" }}>{item.label}</span>
                <button type="button" onClick={() => onDeleteChecklistItem(item.id)} aria-label="삭제"
                  style={{ border: "none", background: "transparent", color: C.hint, cursor: "pointer", display: "flex" }}>
                  <X size={13} />
                </button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
              <input
                value={newChecklistLabel}
                onChange={(e) => setNewChecklistLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addChecklist(); }}
                placeholder="세부 업무 추가"
                style={{ flex: 1, height: 28, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 8px", fontSize: 11.5 }}
              />
              <button type="button" onClick={addChecklist} aria-label="추가"
                style={{ width: 28, height: 28, borderRadius: R.sm, border: `1px solid ${C.border}`, background: "#fff", color: C.teal, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: C.muted }}>메모</span>
            <span style={{ fontSize: 10, color: C.hint }}>{detail.memo.length} / {MEMO_MAX}</span>
          </div>
          <textarea
            value={detail.memo}
            onChange={(e) => onUpdate({ memo: e.target.value.slice(0, MEMO_MAX) })}
            rows={4}
            placeholder="간단한 메모를 남겨보세요."
            style={{ width: "100%", boxSizing: "border-box", borderRadius: R.sm, border: `1px solid ${C.border}`, padding: 10, fontSize: 12, lineHeight: 1.6, resize: "vertical", fontFamily: "inherit" }}
          />
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, marginBottom: 8 }}>첨부 파일</div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `1.5px dashed ${dragOver ? C.teal : C.border}`, borderRadius: R.md, padding: "16px 10px", textAlign: "center",
              background: dragOver ? C.mint : "#fff", cursor: "pointer", fontSize: 11.5, color: C.hint, marginBottom: 8,
            }}
          >
            파일을 드래그하거나 클릭하여 첨부하세요.
            <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {detail.files.map((file) => (
              <div key={file.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: R.sm, border: `1px solid ${C.border}` }}>
                <FileIcon size={14} color={C.teal} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.fileName}</span>
                <span style={{ fontSize: 10, color: C.hint, flexShrink: 0 }}>{formatSize(file.fileSize)}</span>
                <a href={file.fileUrl} download={file.fileName} target="_blank" rel="noreferrer" aria-label="다운로드" style={{ color: C.muted, display: "flex", flexShrink: 0 }}>
                  <Download size={13} />
                </a>
                <button type="button" onClick={() => onDeleteFile(file.id)} aria-label="삭제" style={{ border: "none", background: "transparent", color: C.hint, cursor: "pointer", display: "flex", flexShrink: 0 }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "60px 1fr", alignItems: "start", gap: 8 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted, marginTop: 6 }}>{label}</span>
      <div style={{ display: "grid", gap: 3 }}>{children}</div>
    </div>
  );
}
