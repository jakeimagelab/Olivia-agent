"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Images,
  Lightbulb,
  ListChecks,
  PackageCheck,
  RotateCcw,
} from "lucide-react";
import {
  EQUIPMENT_CATEGORY_ORDER,
  EQUIPMENT_CONFUSION_NOTES,
  getCameraRoles,
  getPackingList,
  getSetupEquipmentCategory,
  getSetups,
  SETUP_CATEGORY_LABEL,
  SHOOT_SETUP_LABEL,
  STAFF_TASKS,
  type ProfileStyle,
  type SetupEquipment,
  type ShootSetup,
  type ShootSetupInput,
  type ShootSetupKind,
  type ShootType,
} from "@/lib/shootSetup/rules";
import styles from "./StaffGuide.module.css";

export type StaffGuideEquipment = {
  name: string;
  category: string;
  quantity: number;
  usage: string | null;
  note: string | null;
};

const STORAGE_KEY = "pc-staff-guide-v1";
const TYPE_OPTIONS: ShootType[] = ["scene", "group", "profile", "interior"];
const SETUP_ORDER: ShootSetupKind[] = ["scene", "group", "profile", "interior", "video"];
const PROFILE_LIGHT_NUMBERS = ["①", "②", "③"] as const;
const EQUIPMENT_GUIDE_IMAGES = [
  { label: "카메라", src: "/assets/staff-guide/equipment/01-camera.png", alt: "Sony R5, Sony M4, Canon 5DMK4 카메라 장비 안내" },
  { label: "렌즈", src: "/assets/staff-guide/equipment/02-lens.png", alt: "Canon과 Sony 렌즈 장비 안내" },
  { label: "조명", src: "/assets/staff-guide/equipment/03-light.png", alt: "Profoto와 Rimelight 조명 장비 안내" },
  { label: "A스탠드", src: "/assets/staff-guide/equipment/04-stand.png", alt: "Silver Stand와 Black Aurora 스탠드 장비 안내" },
  { label: "삼각대·슬라이더", src: "/assets/staff-guide/equipment/05-tripod-slider.png", alt: "Sirui 삼각대와 E700 슬라이더 장비 안내" },
  { label: "짐벌", src: "/assets/staff-guide/equipment/06-gimbal.png", alt: "Ronin 4 Mini 짐벌 장비 안내" },
  { label: "배경세트", src: "/assets/staff-guide/equipment/07-background.png", alt: "인물과 제품 촬영용 배경세트 장비 안내" },
  { label: "동조기", src: "/assets/staff-guide/equipment/08-trigger.png", alt: "Profoto Connect 동조기 장비 안내" },
  { label: "배터리", src: "/assets/staff-guide/equipment/09-battery.png", alt: "Sony, Canon, Profoto 배터리 장비 안내" },
  { label: "저장장치·기타", src: "/assets/staff-guide/equipment/10-storage-etc.png", alt: "메모리 카드와 아이패드 장비 안내" },
] as const;

export default function StaffGuide({ equipment }: { equipment: StaffGuideEquipment[] }) {
  const [input, setInput] = useState<ShootSetupInput>({
    shootTypes: ["scene", "group", "profile"],
    hasVideo: false,
    profileStyle: "studio",
  });
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [equipmentImageIndex, setEquipmentImageIndex] = useState(0);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      setChecked(saved ? JSON.parse(saved) : {});
    } catch {
      setChecked({});
    }
  }, []);

  const roles = useMemo(() => getCameraRoles(input), [input]);
  const setups = useMemo(() => getSetups(input), [input]);
  const packing = useMemo(() => getPackingList(input), [input]);
  const equipmentByName = useMemo(() => new Map(equipment.map((item) => [item.name, item])), [equipment]);
  const packingGroups = useMemo(() => EQUIPMENT_CATEGORY_ORDER.flatMap((category) => {
    const items = packing.filter((item) => getSetupEquipmentCategory(item.name) === category);
    return items.length ? [{ category, items }] : [];
  }), [packing]);
  const equipmentGuideImage = EQUIPMENT_GUIDE_IMAGES[equipmentImageIndex];

  const toggleType = (value: ShootType) => {
    setInput((current) => ({
      ...current,
      shootTypes: current.shootTypes.includes(value)
        ? current.shootTypes.filter((entry) => entry !== value)
        : [...current.shootTypes, value],
    }));
  };

  const saveChecked = (next: Record<string, boolean>) => {
    setChecked(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 현장 가이드는 저장소가 막혀도 현재 탭에서는 계속 체크할 수 있다.
    }
  };

  const resetChecked = () => {
    setChecked({});
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 저장소가 막힌 환경에서는 현재 상태만 초기화한다.
    }
  };

  return (
    <main className={styles.shell}>
      <header className={styles.hero}>
        <div><span>OLIVIA FIELD GUIDE</span><h1>촬영 스텝 가이드</h1><p>오늘 세팅과 장비를 한 화면에서 확인합니다.</p></div>
        <ClipboardCheck size={30} aria-hidden="true" />
      </header>

      <section className={`${styles.card} ${styles.selectorCard}`} aria-labelledby="staff-guide-options">
        <Heading icon={<ListChecks size={18} />} number="1" title="오늘 촬영 선택" id="staff-guide-options" />
        <OptionGroup label="촬영 종류">
          {TYPE_OPTIONS.map((value) => <ChoiceChip key={value} pressed={input.shootTypes.includes(value)} onClick={() => toggleType(value)}>{SHOOT_SETUP_LABEL[value]}</ChoiceChip>)}
        </OptionGroup>
        <OptionGroup label="영상">
          <ChoiceChip pressed={!input.hasVideo} onClick={() => setInput((current) => ({ ...current, hasVideo: false }))}>사진만</ChoiceChip>
          <ChoiceChip pressed={input.hasVideo} onClick={() => setInput((current) => ({ ...current, hasVideo: true }))}>사진 + 영상</ChoiceChip>
        </OptionGroup>
        <OptionGroup label="프로필 형태">
          <ChoiceChip disabled={!input.shootTypes.includes("profile")} pressed={input.profileStyle === "studio"} onClick={() => setInput((current) => ({ ...current, profileStyle: "studio" as ProfileStyle }))}>스튜디오</ChoiceChip>
          <ChoiceChip disabled={!input.shootTypes.includes("profile")} pressed={input.profileStyle === "basic"} onClick={() => setInput((current) => ({ ...current, profileStyle: "basic" as ProfileStyle }))}>기본</ChoiceChip>
        </OptionGroup>
      </section>

      <section className={styles.card}>
        <Heading icon={<ListChecks size={18} />} number="2" title="스텝이 하는 일" />
        <div className={styles.taskList}>{STAFF_TASKS.map((task) => <div key={task} className={task.startsWith("메모리") ? styles.warningTask : undefined}><Check size={15} aria-hidden="true" />{task}</div>)}</div>
      </section>

      <section className={styles.card}>
        <Heading icon={<Camera size={18} />} number="3" title="카메라 3대" />
        <div className={styles.cameraList}>{roles.map((camera) => <article key={camera.name} className={camera.name.startsWith("Canon") ? styles.canonBand : styles.sonyBand} data-used={camera.used}><div><strong>{camera.name}</strong><span>{camera.role}</span></div><small>파일명 접두어 {camera.prefix}</small></article>)}</div>
      </section>

      <section className={styles.card}>
        <Heading icon={<Lightbulb size={18} />} number="4" title="촬영 종류별 세팅" />
        <div className={styles.setupList}>{SETUP_ORDER.flatMap((kind) => {
          const setup = setups[kind];
          return setup ? [<SetupCard key={kind} kind={kind} setup={setup} equipmentByName={equipmentByName} />] : [];
        })}</div>
      </section>

      <section className={`${styles.card} ${styles.equipmentImageCard}`}>
        <Heading icon={<Images size={18} />} number="5" title="장비 사진" />
        <div className={styles.equipmentImageChoices} role="group" aria-label="장비 사진 종류">
          {EQUIPMENT_GUIDE_IMAGES.map((item, index) => (
            <button
              key={item.src}
              type="button"
              aria-pressed={equipmentImageIndex === index}
              onClick={() => setEquipmentImageIndex(index)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <figure className={styles.equipmentImageFigure}>
          <Image
            key={equipmentGuideImage.src}
            src={equipmentGuideImage.src}
            alt={equipmentGuideImage.alt}
            width={941}
            height={1672}
            sizes="(max-width: 560px) calc(100vw - 48px), 500px"
            loading="lazy"
          />
        </figure>
        <div className={styles.equipmentImageNavigation}>
          <button
            type="button"
            aria-label="이전 장비 사진"
            onClick={() => setEquipmentImageIndex((current) => (current - 1 + EQUIPMENT_GUIDE_IMAGES.length) % EQUIPMENT_GUIDE_IMAGES.length)}
          >
            <ChevronLeft size={16} aria-hidden="true" />이전
          </button>
          <span aria-live="polite">{equipmentImageIndex + 1} / {EQUIPMENT_GUIDE_IMAGES.length}</span>
          <button
            type="button"
            aria-label="다음 장비 사진"
            onClick={() => setEquipmentImageIndex((current) => (current + 1) % EQUIPMENT_GUIDE_IMAGES.length)}
          >
            다음<ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </section>

      <section className={styles.card}>
        <Heading icon={<PackageCheck size={18} />} number="6" title="챙길 장비" />
        <div className={styles.packingGroups}>{packingGroups.map(({ category, items }) => <section key={category}><h3>{SETUP_CATEGORY_LABEL[category]}</h3><div>{items.map((item) => {
          const detail = equipmentByName.get(item.name);
          return <label key={item.name} className={styles.packingItem}><input type="checkbox" checked={Boolean(checked[item.name])} onChange={() => saveChecked({ ...checked, [item.name]: !checked[item.name] })} /><span className={styles.checkCircle}><Check size={13} aria-hidden="true" /></span><span className={styles.packingCopy}><strong>{item.name}{item.quantity > 1 ? ` × ${item.quantity}` : ""}</strong>{detail?.usage || detail?.note ? <small>{[detail.usage, detail.note].filter(Boolean).join(" · ")}</small> : null}</span></label>;
        })}</div></section>)}</div>
        <button type="button" className={styles.resetButton} onClick={resetChecked}><RotateCcw size={15} aria-hidden="true" />체크 초기화</button>
      </section>

      <section className={styles.card}>
        <Heading icon={<CircleAlert size={18} />} number="7" title="헷갈리기 쉬운 것" />
        <div className={styles.noteList}>{EQUIPMENT_CONFUSION_NOTES.map((note) => <p key={note}>{note}</p>)}</div>
      </section>

      <section className={styles.card}>
        <details>
          <summary><Heading icon={<PackageCheck size={18} />} number="8" title="전체 장비 목록" /><ChevronDown size={18} aria-hidden="true" /></summary>
          {equipment.length ? <div className={styles.tableWrap}><table><thead><tr><th>구분</th><th>장비</th><th>수량</th><th>용도</th><th>비고</th></tr></thead><tbody>{equipment.map((item) => <tr key={`${item.category}:${item.name}`}><td data-label="구분">{SETUP_CATEGORY_LABEL[item.category as keyof typeof SETUP_CATEGORY_LABEL] ?? item.category}</td><td data-label="장비">{item.name}</td><td data-label="수량">{item.quantity}</td><td data-label="용도">{item.usage || "—"}</td><td data-label="비고">{item.note || "—"}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>등록된 장비가 없습니다.</p>}
        </details>
      </section>
    </main>
  );
}

function SetupCard({ kind, setup, equipmentByName }: { kind: ShootSetupKind; setup: ShootSetup; equipmentByName: Map<string, StaffGuideEquipment> }) {
  const profileLights = kind === "profile" ? expandEquipment(setup.lights) : [];
  return <article className={`${styles.setupCard} ${kind === "video" ? styles.videoBand : setup.camera?.startsWith("Canon") ? styles.canonBand : styles.sonyBand}`}>
    <h3>{SHOOT_SETUP_LABEL[kind]}</h3>
    <SetupLine label="카메라" value={setup.camera} />
    <SetupLine label="렌즈" value={formatEquipment(setup.lenses)} />
    {kind === "profile" ? <div className={styles.profileLights}><span className={styles.setupLabel}>조명</span><div>{PROFILE_LIGHT_NUMBERS.map((number, index) => {
      const light = profileLights[index];
      const detail = light ? equipmentByName.get(light.name) : undefined;
      return <div className={styles.profileLightRow} key={number}><b>{number}</b><div><strong>{light?.name ?? "—"}</strong><small><span>액세서리</span>{detail?.note || "—"}</small><small><span>역할</span>{detail?.usage || "—"}</small></div></div>;
    })}</div></div> : <SetupLine label="조명" value={formatEquipment(setup.lights)} />}
    <SetupLine label="스탠드" value={formatEquipment(setup.stands)} />
    {setup.gimbals.length ? <SetupLine label="짐벌" value={formatEquipment(setup.gimbals)} /> : null}
    <SetupLine label="동조기" value={formatEquipment(setup.trigger)} />
  </article>;
}

function expandEquipment(items: SetupEquipment[]) {
  return items.flatMap((item) => Array.from({ length: item.quantity }, () => ({ ...item, quantity: 1 })));
}

function formatEquipment(items: SetupEquipment | SetupEquipment[] | null) {
  if (!items) return "";
  const list = Array.isArray(items) ? items : [items];
  return list.map((item) => `${item.name}${item.quantity > 1 ? ` ×${item.quantity}` : ""}${item.note ? ` · ${item.note}` : ""}`).join(" / ");
}

function SetupLine({ label, value }: { label: string; value: string | null }) {
  return <div className={styles.setupRow}><span className={styles.setupLabel}>{label}</span><p>{value || "—"}</p></div>;
}

function OptionGroup({ label, children }: { label: string; children: ReactNode }) {
  return <div className={styles.optionGroup}><strong>{label}</strong><div>{children}</div></div>;
}

function ChoiceChip({ pressed, disabled, onClick, children }: { pressed: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-pressed={pressed} disabled={disabled} onClick={onClick}>{children}</button>;
}

function Heading({ icon, number, title, id }: { icon: ReactNode; number: string; title: string; id?: string }) {
  return <div className={styles.heading}><span>{number}</span><i>{icon}</i><h2 id={id}>{title}</h2></div>;
}
