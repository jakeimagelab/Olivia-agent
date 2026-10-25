"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, LockKeyhole, Send } from "lucide-react";
import type { ContiDoctor, ContiGroupRow, ContiRunRow, ContiSceneRow } from "@/components/conti/v2/types";
import { deriveContiChecklist } from "@/lib/conti/deriveChecklist";
import { deriveContiSchedule, type DerivedContiScheduleRow } from "@/lib/conti/deriveSchedule";
import { getSurgeryTypeLabel } from "@/lib/conti/departmentTaxonomy";
import { normalizeContiStudioState, type ContiStudioState } from "@/lib/conti/studioState";
import styles from "@/components/conti/v2/ContiV2.module.css";

type Tab = "checklist" | "conti" | "schedule";

export default function ContiHospitalShareEditor({ token, hospitalName, run, groups, scenes, editedAt }: {
  token: string;
  hospitalName: string;
  run: ContiRunRow;
  groups: ContiGroupRow[];
  scenes: ContiSceneRow[];
  editedAt?: string | null;
}) {
  const [tab, setTab] = useState<Tab>("checklist");
  const [doctors, setDoctors] = useState<ContiDoctor[]>(run.doctors ?? []);
  const [studioState, setStudioState] = useState<ContiStudioState>(() => normalizeContiStudioState(run.studio_state));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [lastSavedAt, setLastSavedAt] = useState(editedAt ?? "");
  const [error, setError] = useState("");
  const mounted = useRef(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const checklist = useMemo(() => deriveContiChecklist(scenes, studioState), [scenes, studioState]);
  const schedule = useMemo(() => deriveContiSchedule(scenes, { doctors, studioState }), [doctors, scenes, studioState]);
  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group.name])), [groups]);
  const dayCounts = useMemo(() => studioState.scheduleSegments.map((segment) => ({ ...segment, count: doctors.filter((doctor) => doctor.day === segment.id || doctor.day === segment.date || doctor.day === segment.label).length })), [doctors, studioState.scheduleSegments]);
  const undecided = doctors.filter((doctor) => !doctor.day).length;

  async function save(submitted = false) {
    setSaveState("saving"); setError("");
    try {
      const response = await fetch(`/api/conti/shares/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checklistCompleted: studioState.checklistCompleted,
          checklistAssignees: studioState.checklistAssignees,
          doctors: doctors.map(({ id, name, day }) => ({ id, name, day })),
          timelineOrder: studioState.timelineOrder,
          hospitalRequestNote: studioState.hospitalRequestNote,
          shootTypes: studioState.shootSetup.shootTypes.filter((value) => value === "scene" || value === "profile" || value === "interior"),
          ...(submitted ? { submitted: true } : {}),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) { setSaveState("failed"); setError(body.error ?? "저장하지 못했습니다."); return false; }
      setSaveState("saved"); setLastSavedAt(body.editedAt); return true;
    } catch (caught) {
      setSaveState("failed");
      setError(caught instanceof Error ? caught.message : "저장하지 못했습니다.");
      return false;
    }
  }

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    setSaveState("idle");
    const timer = window.setTimeout(() => void save(), 900);
    return () => window.clearTimeout(timer);
    // `save` intentionally reads the latest editable state after the debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctors, studioState]);

  function dragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const active = schedule.find((row) => row.rowId === event.active.id);
    const over = schedule.find((row) => row.rowId === event.over?.id);
    if (!active || !over || active.locked || over.locked) return;
    const order = schedule.map((row) => row.rowId);
    const from = order.indexOf(active.rowId); const to = order.indexOf(over.rowId);
    const [moved] = order.splice(from, 1); order.splice(to, 0, moved);
    setStudioState((state) => ({ ...state, timelineOrder: order }));
  }

  return <main className={styles.hospitalShareShell}>
    <header className={styles.hospitalShareHeader}>
      <div><span>{hospitalName}</span><h1>촬영 콘티 준비</h1><p>포토클리닉이 보낸 콘티입니다 · 점선 칸만 고칠 수 있습니다</p></div>
      <div><small>{saveState === "saving" ? "저장 중…" : saveState === "failed" ? "저장 실패" : lastSavedAt ? `마지막 저장 ${new Date(lastSavedAt).toLocaleString("ko-KR")}` : "자동저장 준비됨"}</small><button type="button" onClick={() => void save(true)}><Send size={15} />작성 완료 보내기</button></div>
    </header>
    {error ? <p className={styles.hospitalShareError} role="alert">{error}</p> : null}
    <section className={styles.hospitalShootTypes} aria-label="촬영 종류">
      <strong>촬영 종류</strong>
      {([['scene', '연출'], ['profile', '프로필'], ['interior', '인테리어']] as const).map(([value, label]) => <label key={value}><input type="checkbox" checked={studioState.shootSetup.shootTypes.includes(value)} onChange={() => setStudioState((state) => ({ ...state, shootSetup: { ...state.shootSetup, shootTypes: state.shootSetup.shootTypes.includes(value) ? state.shootSetup.shootTypes.filter((entry) => entry !== value) : [...state.shootSetup.shootTypes, value] } }))} /><span><Check size={13} />{label}</span></label>)}
      <small>단체사진·영상·프로필 형태는 포토클리닉 설정을 유지합니다.</small>
    </section>
    <nav className={styles.shareEditorTabs}>{([['checklist', '준비사항'], ['conti', '콘티'], ['schedule', '타임테이블']] as const).map(([value, label]) => <button key={value} type="button" aria-current={tab === value ? "page" : undefined} onClick={() => setTab(value)}>{label}</button>)}</nav>

    {tab === "checklist" ? <div className={styles.hospitalShareContent}>
      <section className={styles.hospitalEditPanel}><header><h2>준비사항</h2><span>점선 칸은 병원에서 작성할 수 있습니다.</span></header>{checklist.map((item) => <div key={item.id} className={styles.hospitalChecklistRow}><label><input type="checkbox" checked={item.completed} onChange={() => setStudioState((state) => ({ ...state, checklistCompleted: { ...state.checklistCompleted, [item.id]: !state.checklistCompleted[item.id] } }))} /><span><Check size={12} /></span></label><strong>{item.label}</strong><small>{item.notes || ""}</small><input value={studioState.checklistAssignees[item.id] || ""} onChange={(event) => setStudioState((state) => ({ ...state, checklistAssignees: { ...state.checklistAssignees, [item.id]: event.target.value } }))} placeholder="담당자" /></div>)}</section>
      <section className={styles.hospitalEditPanel}><header><h2>의료진 배정</h2><span>{dayCounts.map((day) => `${day.label} ${day.count}명`).join(" · ")} · 미정 {undecided}명</span></header>{doctors.map((doctor) => <div key={doctor.id} className={styles.hospitalDoctorRow}><input value={doctor.name} onChange={(event) => setDoctors((rows) => rows.map((row) => row.id === doctor.id ? { ...row, name: event.target.value } : row))} aria-label="의료진 이름" /><select value={doctor.day || ""} onChange={(event) => setDoctors((rows) => rows.map((row) => row.id === doctor.id ? { ...row, day: event.target.value || null } : row))}><option value="">촬영일 미정</option>{studioState.scheduleSegments.map((segment) => <option key={segment.id} value={segment.id}>{segment.label}{segment.date ? ` · ${segment.date}` : ""}</option>)}</select><span className={styles.lockedCell}><LockKeyhole size={13} />{doctor.surgeries.map((value) => getSurgeryTypeLabel(run.specialty || "", value)).join(" · ") || "담당 수술 미정"}</span></div>)}</section>
      <section className={styles.hospitalEditPanel}><header><h2>잠긴 항목 요청</h2><span>장면·시간·담당 수술 변경은 메모로 요청해 주세요.</span></header><textarea value={studioState.hospitalRequestNote} onChange={(event) => setStudioState((state) => ({ ...state, hospitalRequestNote: event.target.value }))} placeholder="포토클리닉에 전달할 요청을 적어 주세요." /></section>
    </div> : null}

    {tab === "conti" ? <div className={styles.hospitalContiTable}><div className={styles.hospitalContiHead}><span>No</span><span>구분</span><span>장면</span><span>시간</span><span>설명</span><span>장소</span><span>준비사항</span></div>{scenes.map((scene, index) => <div key={scene.id}><span>{scene.scene_code || `S${index + 1}`}</span><span>{scene.group_id ? groupById.get(scene.group_id) : "미지정"}</span><strong>{scene.name}</strong><span>{scene.minutes ?? "-"}분</span><span>{scene.description}</span><span>{scene.space_text}</span><span>{scene.preparation_text}</span></div>)}</div> : null}

    {tab === "schedule" ? <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}><SortableContext items={schedule.map((row) => row.rowId)} strategy={verticalListSortingStrategy}><div className={styles.hospitalTimeline}><header><h2>촬영 순서</h2><p>고정 시각과 휴식은 움직일 수 없습니다. 나머지 줄을 끌면 시간이 다시 계산됩니다.</p></header>{schedule.map((row) => <HospitalTimelineRow key={row.rowId} row={row} />)}</div></SortableContext></DndContext> : null}
  </main>;
}

function HospitalTimelineRow({ row }: { row: DerivedContiScheduleRow }) {
  const sortable = useSortable({ id: row.rowId, disabled: row.locked });
  return <div ref={sortable.setNodeRef} className={row.locked ? styles.timelineLocked : undefined} style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }}>
    <button type="button" disabled={row.locked} aria-label={`${row.name} 촬영 순서 변경`} {...sortable.attributes} {...sortable.listeners}>{row.locked ? <LockKeyhole size={14} /> : <GripVertical size={14} />}</button><span>{row.dayLabel || "-"}</span><time>{row.startTime && row.endTime ? `${row.startTime}–${row.endTime}` : `${row.minutes}분`}</time><strong>{row.name}</strong><span>{row.doctorName || row.people || "-"}</span><span>{row.location}</span>
  </div>;
}
