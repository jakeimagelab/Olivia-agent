"use client";

import { useMemo, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, Check, GripVertical, Share2, SlidersHorizontal } from "lucide-react";
import ContiSceneCard from "@/components/conti/ContiSceneCard";
import type { ContiSceneRow } from "@/components/conti/v2/types";
import type { ContiStudioController } from "@/components/conti/v2/useContiStudio";
import { parsePreparationText } from "@/lib/conti/deriveChecklist";
import { resolveSceneVisual } from "@/lib/conti/sceneVisualLibrary";
import type { ContiFieldCardSize } from "@/lib/conti/studioState";
import styles from "@/components/conti/v2/ContiV2.module.css";

type FieldTab = "cards" | "checklist" | "schedule";
const CARD_SIZES: ContiFieldCardSize[] = ["compact", "normal", "large"];

export default function ContiFieldView({ controller, onBack }: { controller: ContiStudioController; onBack: () => void }) {
  const [tab, setTab] = useState<FieldTab>("cards");
  const [shareStatus, setShareStatus] = useState("");
  const document = controller.document;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 140, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const groupById = useMemo(() => new Map((document?.groups ?? []).map((group, index) => [group.id, { name: group.name, color: GROUP_COLORS[index % GROUP_COLORS.length] }])), [document?.groups]);
  if (!document) return null;
  const activeDocument = document;
  const completed = activeDocument.scenes.filter((scene) => scene.completed).length;
  const total = activeDocument.scenes.length;
  const progress = total ? completed / total : 0;
  const cardSize = activeDocument.studioState.fieldCardSize;
  const fieldTitle = activeDocument.run.hospital_name?.trim() || `${specialtyLabel(activeDocument.run.specialty)} 촬영 콘티`;

  function handleDragEnd(event: DragEndEvent) {
    if (event.over && event.active.id !== event.over.id) controller.reorderScenes(String(event.active.id), String(event.over.id));
  }

  async function share() {
    setShareStatus("공유 링크 생성 중…");
    try {
      const response = await fetch(`/api/conti/runs/${activeDocument.run.id}/share`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audience: "staff" }) });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? "공유 링크 생성 실패");
      await navigator.clipboard.writeText(`${window.location.origin}/conti/share/${body.token}`);
      setShareStatus("현장팀 링크가 복사되었습니다.");
    } catch (caught) { setShareStatus(caught instanceof Error ? caught.message : "공유 링크 생성 실패"); }
    setTimeout(() => setShareStatus(""), 3000);
  }

  return (
    <div className={styles.fieldWorkspace}>
      <header className={styles.fieldHeader}>
        <div className={styles.fieldTitle}><button type="button" onClick={onBack} aria-label="편집 화면으로"><ArrowLeft size={19} /></button><div><span>FIELD VIEW</span><h2>{fieldTitle}</h2></div></div>
        <div className={styles.fieldProgressCopy}><strong>{completed} / {total} 완료</strong><div><span style={{ transform: `scaleX(${progress})` }} /></div></div>
        <div className={styles.fieldHeaderActions}>{shareStatus ? <span role="status">{shareStatus}</span> : null}<button type="button" onClick={() => void share()}><Share2 size={16} />공유</button></div>
      </header>

      <div className={styles.fieldControls}>
        <div className={styles.fieldTabs} role="tablist" aria-label="현장뷰 메뉴">
          {([['cards', '촬영 카드'], ['checklist', '준비사항'], ['schedule', '촬영스케줄']] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? styles.fieldTabActive : undefined} onClick={() => setTab(value)}>{label}{value === "checklist" ? <small>{controller.checklist.filter((item) => item.completed).length}/{controller.checklist.length}</small> : null}</button>)}
        </div>
        {tab === "cards" ? <label className={styles.cardSizeControl}><SlidersHorizontal size={15} /><span>카드 크기</span><small>작게</small><input type="range" min={0} max={2} step={1} value={CARD_SIZES.indexOf(cardSize)} onChange={(event) => controller.setFieldCardSize(CARD_SIZES[Number(event.target.value)])} /><small>크게</small></label> : null}
      </div>

      {tab === "cards" ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={document.scenes.map((scene) => scene.id)} strategy={rectSortingStrategy}>
            <div className={`${styles.fieldCardGrid} ${styles[`fieldCardGrid_${cardSize}`]}`}>
              {document.scenes.map((scene, index) => {
                const group = scene.group_id ? groupById.get(scene.group_id) : undefined;
                const visual = document.studioState.sceneMeta[scene.id]?.visual ?? resolveSceneVisual({ specialty: document.run.specialty, name: scene.name, keyword: scene.keyword, procedures: scene.procedures });
                return <SortableFieldCard key={scene.id} scene={scene} index={index + 1} groupName={group?.name || "미지정"} groupColor={group?.color || "#155855"} imageUrl={visual.imageUrl} cameraAngle={document.studioState.sceneMeta[scene.id]?.cameraAngle} onComplete={controller.toggleSceneComplete} />;
              })}
            </div>
          </SortableContext>
        </DndContext>
      ) : null}

      {tab === "checklist" ? <section className={styles.fieldChecklist}>{controller.checklist.length ? controller.checklist.map((item) => <label key={item.id} className={item.completed ? styles.fieldChecklistDone : undefined}><input type="checkbox" checked={item.completed} onChange={() => controller.toggleChecklistItem(item.id)} /><span><Check size={15} /></span><strong>{item.label}</strong><small>{item.linkedSceneIds.length ? `${item.linkedSceneIds.length}개 Scene에서 사용` : "직접 추가"}</small></label>) : <p>등록된 준비사항이 없습니다.</p>}</section> : null}

      {tab === "schedule" ? <section className={styles.fieldSchedule}><header><label>촬영 시작 <input type="time" value={document.studioState.scheduleStartTime ?? ""} onChange={(event) => controller.setScheduleStartTime(event.target.value)} /></label><span>순서를 바꾸면 시간이 자동으로 다시 계산됩니다.</span></header>{controller.schedule.map((row) => <article key={row.sceneId}><span>{String(row.order).padStart(2, "0")}</span><time>{row.startTime && row.endTime ? `${row.startTime}–${row.endTime}` : `${row.minutes}분`}</time><div><strong>{row.name}</strong><small>{row.location}</small></div></article>)}</section> : null}
    </div>
  );
}

function SortableFieldCard({ scene, index, groupName, groupColor, imageUrl, cameraAngle, onComplete }: { scene: ContiSceneRow; index: number; groupName: string; groupColor: string; imageUrl?: string; cameraAngle?: string; onComplete: (sceneId: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: scene.id });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? .62 : undefined, zIndex: isDragging ? 4 : undefined }}>
    <ContiSceneCard
      index={index}
      category={scene.name || "이름 없는 Scene"}
      duration={scene.minutes != null ? `${scene.minutes}분` : undefined}
      keyword={scene.keyword || groupName}
      description={scene.description}
      location={scene.space_text}
      cameraAngle={cameraAngle}
      personnel={scene.people_text}
      imageUrl={imageUrl}
      preparationItems={parsePreparationText(scene.preparation_text)}
      color={{ bg: `${groupColor}18`, text: groupColor }}
      completed={scene.completed}
      headerLeft={<button type="button" className={styles.fieldDragHandle} aria-label={`${scene.name} 순서 이동`} {...attributes} {...listeners}><GripVertical size={17} /></button>}
      headerRight={<button type="button" className={`${styles.fieldCompleteButton} ${scene.completed ? styles.fieldCompleteButtonDone : ""}`} onClick={() => onComplete(scene.id)}><span><Check size={12} /></span>{scene.completed ? "완료" : "완료 체크"}</button>}
    />
  </div>;
}

const GROUP_COLORS = ["#155855", "#E85D2C", "#3B6FB4", "#8A5EC2", "#B4823B", "#4C9E6E", "#B1477D", "#5C7CBE"];

function specialtyLabel(value?: string | null) {
  const labels: Record<string, string> = { dermatology: "피부과", orthopedics: "정형외과", ophthalmology: "안과", "plastic-surgery": "성형외과", rehabilitation: "재활의학과", dental: "치과", internal: "내과", pediatrics: "소아과", gynecology: "산부인과" };
  return value ? labels[value] || value : "촬영";
}
