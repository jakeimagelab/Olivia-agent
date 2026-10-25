"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, GripVertical, Sparkles, Trash2 } from "lucide-react";
import ContiSceneAddDialog from "@/components/conti/v2/ContiSceneAddDialog";
import type { ContiEditableSceneField, ContiGroupRow, ContiSceneRow } from "@/components/conti/v2/types";
import type { ContiStudioController } from "@/components/conti/v2/useContiStudio";
import { CONTI_GROUP_COLORS } from "@/lib/conti/departmentTaxonomy";
import { sceneShootingTime } from "@/lib/conti/exportModel";
import { inferContiShotType, type ContiShotType } from "@/lib/conti/shotType";
import styles from "@/components/conti/v2/ContiV2.module.css";

export default function ContiResultTable({ controller }: { controller: ContiStudioController }) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const document = controller.document;
  const groups = useMemo(() => document?.groups ?? [], [document?.groups]);
  const scenes = useMemo(() => document?.scenes ?? [], [document?.scenes]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    if (event.over && event.active.id !== event.over.id) controller.reorderScenes(String(event.active.id), String(event.over.id));
  }

  function moveFocus(event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, rowIndex: number, field: ContiEditableSceneField | "cameraAngle" | "shootingTime") {
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
                  rowIndex={index}
                  shootingTime={sceneShootingTime(document, controller.schedule, scene.id)}
                  onMoveFocus={moveFocus}
                  onUpdate={controller.updateSceneFields}
                  onUpdateGroup={controller.updateSceneGroup}
                  onUpdateMedia={controller.updateSceneMedia}
                  onUpdateShotType={controller.updateSceneShotType}
                  onUpdateShootingTime={controller.setSceneShootingTime}
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
        <button type="button" onClick={() => setAddDialogOpen(true)}><Sparkles size={14} />장면 추가</button>
      </footer>
      <ContiSceneAddDialog open={addDialogOpen} controller={controller} onClose={() => setAddDialogOpen(false)} />
    </section>
  );
}

function SortableSceneRow({ scene, groups, rowIndex, shootingTime, onMoveFocus, onUpdate, onUpdateGroup, onUpdateMedia, onUpdateShotType, onUpdateShootingTime, onDuplicate, onDelete }: {
  scene: ContiSceneRow;
  groups: ContiGroupRow[];
  rowIndex: number;
  shootingTime: string;
  onMoveFocus: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, rowIndex: number, field: ContiEditableSceneField | "cameraAngle" | "shootingTime") => void;
  onUpdate: (sceneId: string, fields: Partial<Record<ContiEditableSceneField, string | number | null>>) => void;
  onUpdateGroup: (sceneId: string, groupId: string | null) => void;
  onUpdateMedia: ContiStudioController["updateSceneMedia"];
  onUpdateShotType: ContiStudioController["updateSceneShotType"];
  onUpdateShootingTime: ContiStudioController["setSceneShootingTime"];
  onDuplicate: (sceneId: string) => Promise<boolean>;
  onDelete: (sceneId: string) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: scene.id });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.58 : 1, position: "relative", zIndex: isDragging ? 3 : undefined };
  const groupIndex = Math.max(0, groups.findIndex((group) => group.id === scene.group_id));
  const groupName = groups.find((group) => group.id === scene.group_id)?.name;
  const inferredShotType = inferContiShotType({ name: scene.name, groupName });

  return (
    <tr ref={setNodeRef} style={style}>
      <td className={styles.numberColumn}><div className={styles.sceneCodeCell}><button type="button" className={styles.dragHandle} aria-label={`${scene.name || "장면"} 순서 이동`} {...attributes} {...listeners}><GripVertical size={15} /></button><span>{scene.scene_code || `S${rowIndex + 1}`}</span><div className={styles.rowActions}><button type="button" title="복제" aria-label={`${scene.name} 복제`} onClick={() => void onDuplicate(scene.id)}><Copy size={12} /></button><button type="button" title="삭제" aria-label={`${scene.name} 삭제`} onClick={() => void onDelete(scene.id)}><Trash2 size={12} /></button></div></div></td>
      <td><div className={styles.groupAndShotType}><select className={styles.groupSelect} style={{ "--group-color": CONTI_GROUP_COLORS[groupIndex % CONTI_GROUP_COLORS.length] } as React.CSSProperties} value={scene.group_id ?? ""} aria-label={`${scene.name || "장면"} 구분`} onChange={(event) => onUpdateGroup(scene.id, event.target.value || null)}>
        <option value="">미지정</option>
        {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
      </select><select className={styles.shotTypeSelect} value={scene.shot_type ?? ""} aria-label={`${scene.name || "장면"} 촬영 종류`} onChange={(event) => onUpdateShotType(scene.id, (event.target.value || null) as ContiShotType | null)}>
        <option value="">없음{scene.shot_type == null ? ` · 자동 ${SHOT_TYPE_LABEL[inferredShotType]}` : ""}</option>
        <option value="scene">연출</option><option value="group">단체</option><option value="profile">프로필</option><option value="interior">인테리어</option><option value="video">영상</option>
      </select></div></td>
      <EditableCell scene={scene} field="name" rowIndex={rowIndex} textarea onMoveFocus={onMoveFocus} onUpdate={onUpdate} />
      <td className={styles.timeCell}><CellInput key={shootingTime} value={shootingTime} field="shootingTime" rowIndex={rowIndex} textarea placeholder="촬영시간" onMoveFocus={onMoveFocus} onCommit={(value) => { if (value !== shootingTime) onUpdateShootingTime(scene.id, value); }} /></td>
      <EditableCell scene={scene} field="minutes" rowIndex={rowIndex} numeric onMoveFocus={onMoveFocus} onUpdate={onUpdate} />
      <td className={styles.mediaCell}><select aria-label={`${scene.name || "장면"} 사진·영상`} value={scene.media ?? "photo"} onChange={(event) => onUpdateMedia(scene.id, event.target.value as "photo" | "photo_video" | "none")}><option value="photo">사진</option><option value="photo_video">사진 + 영상</option><option value="none">없음</option></select></td>
      <EditableCell scene={scene} field="keyword" rowIndex={rowIndex} textarea onMoveFocus={onMoveFocus} onUpdate={onUpdate} />
      <EditableCell scene={scene} field="description" rowIndex={rowIndex} textarea onMoveFocus={onMoveFocus} onUpdate={onUpdate} />
      <EditableCell scene={scene} field="space_text" rowIndex={rowIndex} textarea onMoveFocus={onMoveFocus} onUpdate={onUpdate} />
      <EditableCell scene={scene} field="people_text" rowIndex={rowIndex} textarea onMoveFocus={onMoveFocus} onUpdate={onUpdate} />
      <EditableCell scene={scene} field="patient_role_text" rowIndex={rowIndex} textarea onMoveFocus={onMoveFocus} onUpdate={onUpdate} />
      <EditableCell scene={scene} field="preparation_text" rowIndex={rowIndex} textarea onMoveFocus={onMoveFocus} onUpdate={onUpdate} />
    </tr>
  );
}

const SHOT_TYPE_LABEL: Record<ContiShotType, string> = { scene: "연출", group: "단체", profile: "프로필", interior: "인테리어", video: "영상" };

function EditableCell({ scene, field, rowIndex, textarea, numeric, onMoveFocus, onUpdate }: {
  scene: ContiSceneRow;
  field: ContiEditableSceneField;
  rowIndex: number;
  textarea?: boolean;
  numeric?: boolean;
  onMoveFocus: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, rowIndex: number, field: ContiEditableSceneField | "cameraAngle" | "shootingTime") => void;
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
  field: ContiEditableSceneField | "cameraAngle" | "shootingTime";
  rowIndex: number;
  textarea?: boolean;
  numeric?: boolean;
  placeholder: string;
  onMoveFocus: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, rowIndex: number, field: ContiEditableSceneField | "cameraAngle" | "shootingTime") => void;
  onCommit: (value: string) => void;
}) {
  const shared = { defaultValue: value, placeholder, "data-conti-cell": "true", "data-row": String(rowIndex), "data-field": field, onBlur: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => onCommit(event.target.value), onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => onMoveFocus(event, rowIndex, field), className: styles.cellInput };
  return textarea ? <textarea {...shared} rows={Math.min(6, Math.max(2, value.split("\n").length))} onInput={(event) => { event.currentTarget.rows = Math.min(6, Math.max(2, event.currentTarget.value.split("\n").length)); }} /> : <input {...shared} type={numeric ? "number" : "text"} />;
}

const PLACEHOLDERS: Record<ContiEditableSceneField, string> = {
  name: "장면 이름", space_text: "장소 미정", minutes: "분", keyword: "키워드", description: "촬영 포인트", people_text: "필요 인원", patient_role_text: "환자 역할", preparation_text: "준비사항", note: "비고",
};
