"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, BookOpen, Check, GripVertical, LockKeyhole, Share2, SlidersHorizontal } from "lucide-react";
import ContiSceneCard from "@/components/conti/ContiSceneCard";
import ContiShootSetupPanels from "@/components/conti/v2/ContiShootSetupPanels";
import type { ContiStudioController } from "@/components/conti/v2/useContiStudio";
import type { DerivedContiScheduleRow } from "@/lib/conti/deriveSchedule";
import { parsePreparationText } from "@/lib/conti/deriveChecklist";
import type { ContiFieldCardSize } from "@/lib/conti/studioState";
import { CONTI_GROUP_COLORS, getDepartmentContiTitle, getSurgeryTypeLabel } from "@/lib/conti/departmentTaxonomy";
import styles from "@/components/conti/v2/ContiV2.module.css";
import { getSetups, setupSummary } from "@/lib/shootSetup/rules";
import { resolveContiShotType } from "@/lib/conti/shotType";

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
  const groupById = useMemo(() => new Map((document?.groups ?? []).map((group, index) => [group.id, { name: group.name, color: CONTI_GROUP_COLORS[index % CONTI_GROUP_COLORS.length] }])), [document?.groups]);
  const shootSetup = document?.studioState.shootSetup ?? { shootTypes: ["scene", "group"] as const, hasVideo: false, profileStyle: "studio" as const };
  const setups = getSetups({ ...shootSetup, shootTypes: [...shootSetup.shootTypes] });
  if (!document) return null;
  const activeDocument = document;
  const completed = controller.schedule.filter((row) => row.steps?.length ? row.steps.every((step) => activeDocument.studioState.timelineCompleted[`${row.rowId}:${step.id}`]) : activeDocument.studioState.timelineCompleted[row.rowId]).length;
  const total = controller.schedule.length;
  const progress = total ? completed / total : 0;
  const cardSize = activeDocument.studioState.fieldCardSize;
  const fieldTitle = activeDocument.run.hospital_name?.trim() || getDepartmentContiTitle(activeDocument.run.specialty || "촬영");

  function handleDragEnd(event: DragEndEvent) {
    if (event.over && event.active.id !== event.over.id) controller.reorderTimeline(String(event.active.id), String(event.over.id));
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
        <div className={styles.fieldHeaderActions}>{shareStatus ? <span role="status">{shareStatus}</span> : null}<Link href="/staff-guide" target="_blank"><BookOpen size={16} />스텝 가이드</Link><button type="button" onClick={() => void share()}><Share2 size={16} />공유</button></div>
      </header>

      <ContiShootSetupPanels input={shootSetup} checked={activeDocument.studioState.equipmentChecked} onToggle={(name) => controller.updateStudioState((state) => ({ ...state, equipmentChecked: { ...state.equipmentChecked, [name]: !state.equipmentChecked[name] } }))} />

      <div className={styles.fieldControls}>
        <div className={styles.fieldTabs} role="tablist" aria-label="현장뷰 메뉴">
          {([['cards', '촬영 카드'], ['checklist', '준비사항'], ['schedule', '촬영스케줄']] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? styles.fieldTabActive : undefined} onClick={() => setTab(value)}>{label}{value === "checklist" ? <small>{controller.checklist.filter((item) => item.completed).length}/{controller.checklist.length}</small> : null}</button>)}
        </div>
        {tab === "cards" ? <label className={styles.cardSizeControl}><SlidersHorizontal size={15} /><span>카드 크기</span><small>작게</small><input type="range" min={0} max={2} step={1} value={CARD_SIZES.indexOf(cardSize)} onChange={(event) => controller.setFieldCardSize(CARD_SIZES[Number(event.target.value)])} /><small>크게</small></label> : null}
      </div>

      {tab === "cards" ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={controller.schedule.map((row) => row.rowId)} strategy={rectSortingStrategy}>
            <div className={`${styles.fieldCardGrid} ${styles[`fieldCardGrid_${cardSize}`]}`}>
              {controller.schedule.map((row) => {
                const scene = document.scenes.find((item) => item.id === row.sceneId);
                const group = scene?.group_id ? groupById.get(scene.group_id) : undefined;
                const shotType = scene ? resolveContiShotType({ shotType: scene.shot_type, name: scene.name, groupName: group?.name }) : undefined;
                return <SortableFieldCard key={row.rowId} row={row} specialty={document.run.specialty || ""} groupName={group?.name || (row.type === "break" ? "고정 일정" : "미지정")} groupColor={group?.color || "#155855"} setup={shotType ? setupSummary(setups[shotType]) : ""} completed={row.steps?.length ? row.steps.every((step) => document.studioState.timelineCompleted[`${row.rowId}:${step.id}`]) : Boolean(document.studioState.timelineCompleted[row.rowId])} completedMap={document.studioState.timelineCompleted} onComplete={(key) => {
                  if (key === row.rowId && row.steps?.length) {
                    const allDone = row.steps.every((step) => document.studioState.timelineCompleted[`${row.rowId}:${step.id}`]);
                    for (const step of row.steps) {
                      const stepKey = `${row.rowId}:${step.id}`;
                      if (Boolean(document.studioState.timelineCompleted[stepKey]) === allDone) controller.toggleTimelineItem(stepKey);
                    }
                    return;
                  }
                  controller.toggleTimelineItem(key);
                }} />;
              })}
            </div>
          </SortableContext>
        </DndContext>
      ) : null}

      {tab === "checklist" ? <section className={styles.fieldChecklist}>{controller.checklist.length ? controller.checklist.map((item) => <label key={item.id} className={item.completed ? styles.fieldChecklistDone : undefined}><input type="checkbox" checked={item.completed} onChange={() => controller.toggleChecklistItem(item.id)} /><span><Check size={15} /></span><strong>{item.label}</strong><small>{item.linkedSceneIds.length ? `${item.linkedSceneIds.length}개 Scene에서 사용` : "직접 추가"}</small></label>) : <p>등록된 준비사항이 없습니다.</p>}</section> : null}

      {tab === "schedule" ? <section className={styles.fieldSchedule}><header><label>촬영 시작 <input type="time" value={document.studioState.scheduleSegments[0]?.startTime ?? ""} onChange={(event) => controller.setScheduleStartTime(event.target.value)} /></label><span>순서를 바꾸면 시간이 자동으로 다시 계산됩니다.</span></header>{controller.schedule.map((row) => <article key={row.rowId}><span>{String(row.order).padStart(2, "0")}</span><time>{row.startTime && row.endTime ? `${row.startTime}–${row.endTime}` : `${row.minutes}분`}</time><div><strong>{row.name}</strong><small>{row.dayLabel} · {row.location}</small></div>{row.locked ? <LockKeyhole size={14} aria-label="고정 일정" /> : null}</article>)}</section> : null}
    </div>
  );
}

function SortableFieldCard({ row, specialty, groupName, groupColor, setup, completed, completedMap, onComplete }: { row: DerivedContiScheduleRow; specialty: string; groupName: string; groupColor: string; setup: string; completed: boolean; completedMap: Record<string, boolean>; onComplete: (rowId: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.rowId, disabled: row.locked });
  const surgeryText = row.surgeries?.map((value) => getSurgeryTypeLabel(specialty, value)).join(" · ");
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? .62 : undefined, zIndex: isDragging ? 4 : undefined }}>
    <ContiSceneCard
      index={row.order}
      category={row.type === "doctor" ? `${row.doctorName}${surgeryText ? ` · ${surgeryText}` : ""}` : row.name || "이름 없는 장면"}
      duration={row.startTime && row.endTime ? `${row.startTime}–${row.endTime} · ${row.minutes}분` : `${row.minutes}분`}
      keyword={row.keyword || groupName}
      description={row.type === "doctor" ? "메이크업 · 프로필 · 진료 연출 · 수술 연출 · 정리 이동" : row.description}
      location={row.location}
      personnel={row.people}
      patientRole={row.patientRole}
      media={row.media === "photo_video" ? "사진 + 영상" : row.media === "none" ? "—" : "사진"}
      preparationItems={parsePreparationText(row.preparation)}
      setup={setup || undefined}
      color={{ bg: `${groupColor}18`, text: groupColor }}
      completed={completed}
      headerLeft={row.locked ? <span className={styles.fieldDragHandle} title="고정 일정"><LockKeyhole size={15} /></span> : <button type="button" className={styles.fieldDragHandle} aria-label={`${row.name} 타임 순서 이동`} {...attributes} {...listeners}><GripVertical size={17} /></button>}
      headerRight={<button type="button" className={`${styles.fieldCompleteButton} ${completed ? styles.fieldCompleteButtonDone : ""}`} onClick={() => onComplete(row.rowId)}><span><Check size={12} /></span>{completed ? "완료" : "완료 체크"}</button>}
    />
    {row.steps?.length ? <div className={styles.doctorStepChecks}>{row.steps.filter((step) => !step.id.startsWith("cleanup:")).map((step) => {
      const key = `${row.rowId}:${step.id}`;
      const done = Boolean(completedMap[key]);
      return <button key={step.id} type="button" className={done ? styles.doctorStepDone : undefined} onClick={() => onComplete(key)}><span><Check size={11} /></span>{step.name}</button>;
    })}</div> : null}
  </div>;
}
