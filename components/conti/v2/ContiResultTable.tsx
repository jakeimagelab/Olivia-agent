"use client";

import { useMemo, useRef } from "react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import type { ContiEditableSceneField, ContiGroupRow, ContiSceneRow } from "@/components/conti/v2/types";
import type { ContiStudioController } from "@/components/conti/v2/useContiStudio";
import styles from "@/components/conti/v2/ContiV2.module.css";

export default function ContiResultTable({ controller }: { controller: ContiStudioController }) {
  const tableRef = useRef<HTMLTableElement>(null);
  const document = controller.document;
  const groups = useMemo(() => document?.groups ?? [], [document?.groups]);
  const scenes = useMemo(() => document?.scenes ?? [], [document?.scenes]);
  const groupNameById = useMemo(() => new Map(groups.map((group) => [group.id, group.name])), [groups]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    if (event.over && event.active.id !== event.over.id) controller.reorderScenes(String(event.active.id), String(event.over.id));
  }

  function moveFocus(event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, rowIndex: number, field: ContiEditableSceneField | "cameraAngle") {
    if (event.key === "Tab") {
      const cells = [...(tableRef.current?.querySelectorAll<HTMLElement>("[data-conti-cell='true']") ?? [])];
      const index = cells.indexOf(event.currentTarget);
      const target = cells[index + (event.shiftKey ? -1 : 1)];
      if (target) { event.preventDefault(); target.focus(); }
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      const target = tableRef.current?.querySelector<HTMLElement>(`[data-row='${rowIndex + 1}'][data-field='${field}']`);
      if (target) { event.preventDefault(); target.focus(); }
    }
  }

  if (!document) return null;

  return (
    <section className={styles.tableSection} aria-label="콘티 편집 표">
      <div className={styles.tableViewport}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <table ref={tableRef} className={styles.resultTable}>
            <thead><tr>
              <th className={styles.dragColumn} aria-label="순서" />
              <th className={styles.numberColumn}>#</th>
              <th>구분</th>
              <th>Scene</th>
              <th className={styles.detailColumn}>세부내용 / 촬영포인트</th>
              <th>인원</th>
              <th>장소</th>
              <th>구도</th>
              <th>준비사항</th>
              <th>예상시간</th>
              <th>비고</th>
              <th>상태</th>
              <th aria-label="행 메뉴" />
            </tr></thead>
            <SortableContext items={scenes.map((scene) => scene.id)} strategy={verticalListSortingStrategy}>
              <tbody>{scenes.map((scene, index) => (
                <SortableSceneRow
                  key={scene.id}
                  scene={scene}
                  groups={groups}
                  groupName={scene.group_id ? groupNameById.get(scene.group_id) ?? "미지정" : "미지정"}
                  rowIndex={index}
                  cameraAngle={document.studioState.sceneMeta[scene.id]?.cameraAngle ?? ""}
                  onMoveFocus={moveFocus}
                  onUpdate={controller.updateSceneFields}
                  onCameraAngle={controller.setSceneCameraAngle}
                  onComplete={controller.toggleSceneComplete}
                  onDuplicate={controller.duplicateScene}
                  onDelete={async (sceneId) => { if (window.confirm("이 장면을 삭제할까요?")) await controller.deleteScene(sceneId); }}
                />
              ))}</tbody>
            </SortableContext>
          </table>
        </DndContext>
      </div>
      <footer className={styles.tableFooter}>
        <span>총 {scenes.length} Scene · 셀을 클릭해 바로 수정할 수 있습니다.</span>
        <button type="button" onClick={() => void controller.addScene()}><Plus size={14} />장면 추가</button>
      </footer>
    </section>
  );
}

function SortableSceneRow({ scene, groups, groupName, rowIndex, cameraAngle, onMoveFocus, onUpdate, onCameraAngle, onComplete, onDuplicate, onDelete }: {
  scene: ContiSceneRow;
  groups: ContiGroupRow[];
  groupName: string;
  rowIndex: number;
  cameraAngle: string;
  onMoveFocus: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, rowIndex: number, field: ContiEditableSceneField | "cameraAngle") => void;
  onUpdate: (sceneId: string, fields: Partial<Record<ContiEditableSceneField, string | number | null>>) => void;
  onCameraAngle: (sceneId: string, value: string) => void;
  onComplete: (sceneId: string) => void;
  onDuplicate: (sceneId: string) => Promise<boolean>;
  onDelete: (sceneId: string) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: scene.id });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.58 : scene.completed ? 0.68 : 1, position: "relative", zIndex: isDragging ? 3 : undefined };
  const groupIndex = Math.max(0, groups.findIndex((group) => group.id === scene.group_id));

  return (
    <tr ref={setNodeRef} style={style} className={scene.completed ? styles.completedRow : undefined}>
      <td className={styles.dragColumn}><button type="button" className={styles.dragHandle} aria-label={`${scene.name || "장면"} 순서 이동`} {...attributes} {...listeners}><GripVertical size={15} /></button></td>
      <td className={styles.numberColumn}>{String(rowIndex + 1).padStart(2, "0")}</td>
      <td><span className={styles.groupPill} style={{ "--group-color": GROUP_COLORS[groupIndex % GROUP_COLORS.length] } as React.CSSProperties}>{groupName}</span></td>
      <EditableCell scene={scene} field="name" rowIndex={rowIndex} onMoveFocus={onMoveFocus} onUpdate={onUpdate} />
      <EditableCell scene={scene} field="description" rowIndex={rowIndex} textarea onMoveFocus={onMoveFocus} onUpdate={onUpdate} />
      <EditableCell scene={scene} field="people_text" rowIndex={rowIndex} onMoveFocus={onMoveFocus} onUpdate={onUpdate} />
      <EditableCell scene={scene} field="space_text" rowIndex={rowIndex} onMoveFocus={onMoveFocus} onUpdate={onUpdate} />
      <td><CellInput key={cameraAngle} value={cameraAngle} field="cameraAngle" rowIndex={rowIndex} placeholder="정면 / 디테일" onMoveFocus={onMoveFocus} onCommit={(value) => { if (value !== cameraAngle) onCameraAngle(scene.id, value); }} /></td>
      <EditableCell scene={scene} field="preparation_text" rowIndex={rowIndex} textarea onMoveFocus={onMoveFocus} onUpdate={onUpdate} />
      <EditableCell scene={scene} field="minutes" rowIndex={rowIndex} numeric onMoveFocus={onMoveFocus} onUpdate={onUpdate} />
      <EditableCell scene={scene} field="note" rowIndex={rowIndex} onMoveFocus={onMoveFocus} onUpdate={onUpdate} />
      <td><button type="button" className={`${styles.statusToggle} ${scene.completed ? styles.statusToggleDone : ""}`} onClick={() => onComplete(scene.id)}><span><Check size={11} /></span>{scene.completed ? "완료" : "대기"}</button></td>
      <td><div className={styles.rowActions}><button type="button" title="복제" aria-label={`${scene.name} 복제`} onClick={() => void onDuplicate(scene.id)}><Copy size={13} /></button><button type="button" title="삭제" aria-label={`${scene.name} 삭제`} onClick={() => void onDelete(scene.id)}><Trash2 size={13} /></button></div></td>
    </tr>
  );
}

function EditableCell({ scene, field, rowIndex, textarea, numeric, onMoveFocus, onUpdate }: {
  scene: ContiSceneRow;
  field: ContiEditableSceneField;
  rowIndex: number;
  textarea?: boolean;
  numeric?: boolean;
  onMoveFocus: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, rowIndex: number, field: ContiEditableSceneField | "cameraAngle") => void;
  onUpdate: (sceneId: string, fields: Partial<Record<ContiEditableSceneField, string | number | null>>) => void;
}) {
  const initial = String(scene[field] ?? "");
  return <td className={scene.field_sources?.[field] === "blank" ? styles.blankCell : undefined}><CellInput key={initial} value={initial} field={field} rowIndex={rowIndex} textarea={textarea} numeric={numeric} placeholder={PLACEHOLDERS[field]} onMoveFocus={onMoveFocus} onCommit={(rawValue) => {
    if (rawValue === initial) return;
    onUpdate(scene.id, { [field]: numeric ? (rawValue.trim() ? Number(rawValue) : null) : rawValue });
  }} /></td>;
}

function CellInput({ value, field, rowIndex, textarea, numeric, placeholder, onMoveFocus, onCommit }: {
  value: string;
  field: ContiEditableSceneField | "cameraAngle";
  rowIndex: number;
  textarea?: boolean;
  numeric?: boolean;
  placeholder: string;
  onMoveFocus: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, rowIndex: number, field: ContiEditableSceneField | "cameraAngle") => void;
  onCommit: (value: string) => void;
}) {
  const shared = { defaultValue: value, placeholder, "data-conti-cell": "true", "data-row": String(rowIndex), "data-field": field, onBlur: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => onCommit(event.target.value), onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => onMoveFocus(event, rowIndex, field), className: styles.cellInput };
  return textarea ? <textarea {...shared} rows={2} /> : <input {...shared} type={numeric ? "number" : "text"} />;
}

const GROUP_COLORS = ["#155855", "#E85D2C", "#3B6FB4", "#8A5EC2", "#B4823B", "#4C9E6E", "#B1477D", "#5C7CBE"];
const PLACEHOLDERS: Record<ContiEditableSceneField, string> = {
  name: "장면 이름", space_text: "장소 미정", minutes: "분", keyword: "키워드", description: "촬영 포인트", people_text: "필요 인원", patient_role_text: "환자 역할", preparation_text: "준비사항", note: "비고",
};
