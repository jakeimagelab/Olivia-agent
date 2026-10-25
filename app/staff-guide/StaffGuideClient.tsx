"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera, Check, ChevronDown, CircleAlert, ClipboardCheck, Lightbulb, ListChecks, PackageCheck } from "lucide-react";
import type { Equipment } from "@/lib/work-journal/scheduleTypes";
import { EQUIPMENT_CONFUSION_NOTES, getCameraRoles, getPackingList, getSetups, setupSummary, STAFF_TASKS, type ProfileStyle, type ShootSetupInput, type ShootType } from "@/lib/shootSetup/rules";
import styles from "@/app/staff-guide/staffGuide.module.css";

const STORAGE_KEY = "olivia-staff-guide-equipment-v1";
const TYPE_OPTIONS: Array<[ShootType, string]> = [["scene", "연출"], ["group", "단체"], ["profile", "프로필"], ["interior", "인테리어"]];
const CATEGORY_LABEL: Record<string, string> = { CAMERA: "카메라", LENS: "렌즈", LIGHT: "조명", STAND: "스탠드", TRIPOD: "삼각대", SLIDER: "슬라이더", GIMBAL: "짐벌", TRIGGER: "동조기", BATTERY: "배터리", STORAGE: "저장장치", ETC: "기타" };

export default function StaffGuideClient({ equipment, loadError }: { equipment: Equipment[]; loadError: string }) {
  const [input, setInput] = useState<ShootSetupInput>({ shootTypes: ["scene", "group"], hasVideo: false, profileStyle: "studio" });
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try { setChecked(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}")); } catch { setChecked({}); }
  }, []);
  const packing = useMemo(() => getPackingList(input), [input]);
  const roles = useMemo(() => getCameraRoles(input), [input]);
  const setups = useMemo(() => getSetups(input), [input]);
  const equipmentByCategory = useMemo(() => {
    const map = new Map<string, Equipment[]>();
    for (const item of equipment) map.set(item.category, [...(map.get(item.category) ?? []), item]);
    return [...map.entries()];
  }, [equipment]);

  function toggleType(value: ShootType) {
    setInput((current) => ({ ...current, shootTypes: current.shootTypes.includes(value) ? current.shootTypes.filter((entry) => entry !== value) : [...current.shootTypes, value] }));
  }
  function toggleEquipment(name: string) {
    setChecked((current) => {
      const next = { ...current, [name]: !current[name] };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  return <main className={styles.shell}>
    <header className={styles.hero}><div><span>OLIVIA FIELD GUIDE</span><h1>촬영 스텝 가이드</h1><p>오늘 세팅과 장비를 한 화면에서 확인합니다.</p></div><ClipboardCheck size={30} /></header>

    <section className={styles.card}><Heading icon={<ListChecks size={18} />} number="1" title="스텝이 하는 일" /><div className={styles.taskGrid}>{STAFF_TASKS.map((task) => <div key={task} className={task.startsWith("메모리") ? styles.warningTask : undefined}><Check size={15} />{task}</div>)}</div></section>

    <section className={styles.card}><Heading icon={<Camera size={18} />} number="2" title="카메라 3대" /><div className={styles.cameraGrid}>{roles.map((camera) => <article key={camera.name} className={camera.name.startsWith("Canon") ? styles.canonBand : styles.sonyBand} data-used={camera.used}><strong>{camera.name}</strong><span>{camera.role}</span><small>파일명 접두어 {camera.prefix}</small></article>)}</div></section>

    <section className={styles.card}><Heading icon={<Lightbulb size={18} />} number="3" title="촬영 종류별 세팅" /><div className={styles.controls}><div>{TYPE_OPTIONS.map(([value, label]) => <button key={value} type="button" aria-pressed={input.shootTypes.includes(value)} onClick={() => toggleType(value)}>{label}</button>)}</div><div><button type="button" aria-pressed={!input.hasVideo} onClick={() => setInput((current) => ({ ...current, hasVideo: false }))}>사진만</button><button type="button" aria-pressed={input.hasVideo} onClick={() => setInput((current) => ({ ...current, hasVideo: true }))}>사진 + 영상</button></div><div><button type="button" disabled={!input.shootTypes.includes("profile")} aria-pressed={input.profileStyle === "studio"} onClick={() => setInput((current) => ({ ...current, profileStyle: "studio" as ProfileStyle }))}>스튜디오</button><button type="button" disabled={!input.shootTypes.includes("profile")} aria-pressed={input.profileStyle === "basic"} onClick={() => setInput((current) => ({ ...current, profileStyle: "basic" as ProfileStyle }))}>기본</button></div></div><div className={styles.setupList}>{Object.entries(setups).map(([kind, setup]) => <article key={kind} className={kind === "video" ? styles.videoBand : setup?.camera?.startsWith("Canon") ? styles.canonBand : styles.sonyBand}><strong>{kind === "scene" ? "연출" : kind === "group" ? "단체" : kind === "profile" ? "프로필" : kind === "interior" ? "인테리어" : "영상"}</strong><p>{setupSummary(setup)}</p></article>)}</div></section>

    <section className={styles.card}><Heading icon={<PackageCheck size={18} />} number="4" title="챙길 장비 체크" /><div className={styles.packingList}>{packing.map((item) => <label key={item.name}><input type="checkbox" checked={Boolean(checked[item.name])} onChange={() => toggleEquipment(item.name)} /><span><Check size={13} /></span><strong>{item.name}{item.quantity > 1 ? ` × ${item.quantity}` : ""}</strong></label>)}</div></section>

    <section className={styles.card}><Heading icon={<CircleAlert size={18} />} number="5" title="헷갈리기 쉬운 것" /><div className={styles.noteList}>{EQUIPMENT_CONFUSION_NOTES.map((note) => <p key={note}>{note}</p>)}</div></section>

    <section className={styles.card}><details><summary><Heading icon={<PackageCheck size={18} />} number="6" title="전체 장비 목록" /><ChevronDown size={18} /></summary>{loadError ? <p className={styles.error} role="alert">{loadError}</p> : <div className={styles.masterList}>{equipmentByCategory.map(([category, items]) => <section key={category}><h3>{CATEGORY_LABEL[category] ?? category}</h3>{items.map((item) => <article key={item.id}><div><strong>{item.name}{item.quantity > 1 ? ` × ${item.quantity}` : ""}</strong>{item.usage ? <span>{item.usage}</span> : null}</div>{item.note ? <p>{item.note}</p> : null}</article>)}</section>)}</div>}</details></section>
  </main>;
}

function Heading({ icon, number, title }: { icon: React.ReactNode; number: string; title: string }) {
  return <div className={styles.heading}><span>{number}</span><i>{icon}</i><h2>{title}</h2></div>;
}
