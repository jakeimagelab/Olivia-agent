"use client";

import { Fragment, useMemo, useRef } from "react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import type { ContiEditableSceneField, ContiGroupRow, ContiSceneRow } from "@/components/conti/v2/types";
import type { ContiStudioController } from "@/components/conti/v2/useContiStudio";
import { CONTI_GROUP_COLORS } from "@/lib/conti/departmentTaxonomy";
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
    if (event.key === "Enter" && !event.shiftKey && event.currentTarget.tagName !== "TEXTAREA") {
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
              <th className={styles.numberColumn}>No</th>
              <th>구분</th>
              <th>장면</th>
              <th>촬영시간</th>
              <th>분</th>
              <th>사진/영상</th>
              <th>키워드</th>
              <th className={styles.detailColumn}>설명</th>
              <th>장소</th>
              <th>인물</th>
              <th>환자 역할</th>
              <th>준비사항 (병원요청)</th>
            </tr></thead>
            <SortableContext items={scenes.map((scene) => scene.id)} strategy={verticalListSortingStrategy}>
              <tbody>{scenes.map((scene, index) => <Fragment key={scene.id}>
                {scene.repeat_scope === "per_doctor" && !scenes.slice(0, index).some((item) => item.repeat_scope === "per_doctor") ? <tr className={styles.repeatBand}><td colSpan={12}>의료진 개인 촬영 · × {document.run.doctors?.length || document.run.doctor_count || 1}명 · 타임테이블에서 전개</td></tr> : null}
                <SortableSceneRow
                  key={scene.id}
                  scene={scene}
                  groups={groups}
                  groupName={scene.group_id ? groupNameById.get(scene.group_id) ?? "미지정" : "미지정"}
                  rowIndex={index}
                  scheduleTime={controller.schedule.find((row) => row.sceneIds.includes(scene.id))?.startTime}
                  scheduleEndTime={controller.schedule.find((row) => row.sceneIds.includes(scene.id))?.endTime}
                  onMoveFocus={moveFocus}
                  onUpdate={controller.updateSceneFields}
                  onDuplicate={controller.duplicateScene}
                  onDelete={async (sceneId) => { if (window.confirm("이 장면을 삭제할까요?")) await controller.deleteScene(sceneId); }}
                />
              </Fragment>)}</tbody>
            </SortableContext>
          </table>
        </DndContext>
      </div>
      <footer className={styles.tableFooter}>
        <span>총 {scenes.length} Scene · Enter 줄바꿈 · Tab 다음 셀</span>
        <button type="button" onClick={() => void controller.addScene()}><Plus size={14} />장면 추가</button>
      </footer>
    </section>
  );
}

function SortableSceneRow({ scene, groups, groupName, rowIndex, scheduleTime, scheduleEndTime, onMoveFocus, onUpdate, onDuplicate, onDelete }: {
  scene: ContiSceneRow;
  groups: ContiGroupRow[];
  groupName: string;
  rowIndex: number;
  scheduleTime?: string;
  scheduleEndTime?: string;
  onMoveFocus: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, rowIndex: number, field: ContiEditableSceneField | "cameraAngle") => void;
  onUpdate: (sceneId: string, fields: Partial<Record<ContiEditableSceneField, string | number | null>>) => void;
  onDuplicate: (sceneId: string) => Promise<boolean>;
  onDelete: (sceneId: string) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: scene.id });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.58 : 1, position: "relative", zIndex: isDragging ? 3 : undefined };
  const groupIndex = Math.max(0, groups.findIndex((group) => group.id === scene.group_id));

  return (
    <tr ref={setNodeRef} style={style}>
      <td className={styles.numberColumn}><div className={styles.sceneCodeCell}><button type="button" className={styles.dragHandle} aria-label={`${scene.name || "장면"} 순서 이동`} {...attributes} {...listeners}><GripVertical size={15} /></button><span>{scene.scene_code || `S${rowIndex + 1}`}</span><div className={styles.rowActions}><button type="button" title="복제" aria-label={`${scene.name} 복제`} onClick={() => void onDuplicate(scene.id)}><Copy size={12} /></button><button type="button" title="삭제" aria-label={`${scene.name} 삭제`} onClick={() => void onDelete(scene.id)}><Trash2 size={12} /></button></div></div></td>
      <td><span className={styles.groupPill} style={{ "--group-color": CONTI_GROUP_COLORS[groupIndex % CONTI_GROUP_COLORS.length] } as React.CSSProperties}>{groupName}</span></td>
      <EditableCell scene={scene} field="name" rowIndex={rowIndex} textarea onMoveFocus={onMoveFocus} onUpdate={onUpdate} />
      <td className={styles.timeCell}>{scene.repeat_scope === "per_doctor" ? "타임테이블" : scheduleTime && scheduleEndTime ? `${scheduleTime}–${scheduleEndTime}` : "미정"}</td>
      <EditableCell scene={scene} field="minutes" rowIndex={rowIndex} numeric onMoveFocus={onMoveFocus} onUpdate={onUpdate} />
      <td className={styles.mediaCell}>{mediaLabel(scene.media)}</td>
      <EditableCell scene={scene} field="keyword" rowIndex={rowIndex} textarea onMoveFocus={onMoveFocus} onUpdate={onUpdate} />
      <EditableCell scene={scene} field="description" rowIndex={rowIndex} textarea onMoveFocus={onMoveFocus} onUpdate={onUpdate} />
      <EditableCell scene={scene} field="space_text" rowIndex={rowIndex} textarea onMoveFocus={onMoveFocus} onUpdate={onUpdate} />
      <EditableCell scene={scene} field="people_text" rowIndex={rowIndex} textarea onMoveFocus={onMoveFocus} onUpdate={onUpdate} />
      <EditableCell scene={scene} field="patient_role_text" rowIndex={rowIndex} textarea onMoveFocus={onMoveFocus} onUpdate={onUpdate} />
      <EditableCell scene={scene} field="preparation_text" rowIndex={rowIndex} textarea onMoveFocus={onMoveFocus} onUpdate={onUpdate} />
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
  return textarea ? <textarea {...shared} rows={Math.min(6, Math.max(2, value.split("\n").length))} onInput={(event) => { event.currentTarget.rows = Math.min(6, Math.max(2, event.currentTarget.value.split("\n").length)); }} /> : <input {...shared} type={numeric ? "number" : "text"} />;
}

function mediaLabel(value: ContiSceneRow["media"]): string {
  if (value === "none") return "—";
  return value === "photo_video" ? "사진 + 영상" : "사진";
}
const PLACEHOLDERS: Record<ContiEditableSceneField, string> = {
  name: "장면 이름", space_text: "장소 미정", minutes: "분", keyword: "키워드", description: "촬영 포인트", people_text: "필요 인원", patient_role_text: "환자 역할", preparation_text: "준비사항", note: "비고",
};
