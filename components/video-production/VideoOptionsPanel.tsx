"use client";

import { SlidersHorizontal } from "lucide-react";
import type { PublicSettingField, VideoModelCapability } from "@/lib/higgsfield/types";
import styles from "./VideoProductionWorkspace.module.css";

type Props = { model?: VideoModelCapability; settings: Record<string, unknown>; onChange: (key: string, value: unknown) => void };

function titleFor(key: string): string {
  return ({
    aspectRatio: "영상 비율",
    resolution: "해상도",
    duration: "길이 (초)",
    generateAudio: "영상 음성 생성",
    sound: "영상 음성 생성",
    bitrateMode: "화질 모드",
    seed: "Seed",
    motion: "움직임",
    quality: "품질",
    strength: "강도",
    cfgScale: "프롬프트 반영도",
    multiShots: "멀티 샷",
  } as Record<string, string>)[key] ?? key;
}

function optionLabel(option: string): string {
  return ({ standard: "표준", high: "고화질" } as Record<string, string>)[option] ?? option;
}

function SettingControl({ field, fieldKey, value, onChange }: { field: PublicSettingField; fieldKey: string; value: unknown; onChange: (value: unknown) => void }) {
  if (field.type === "enum") return <select className={styles.optionControl} value={typeof value === "string" ? value : field.default} onChange={(event) => onChange(event.target.value)}>{field.values.map((option) => <option key={option} value={option}>{optionLabel(option)}</option>)}</select>;
  if (field.type === "boolean") return <button type="button" className={value ? styles.toggleOn : styles.toggleOff} onClick={() => onChange(!value)} aria-pressed={Boolean(value)}>{value ? "사용" : "사용 안 함"}</button>;
  const numeric = typeof value === "number" ? value : field.default;
  return <div className={styles.rangeControl}><input type="range" min={field.min} max={field.max} step={field.step ?? 1} value={numeric} onChange={(event) => onChange(Number(event.target.value))} /><output>{fieldKey === "duration" ? `${numeric}초` : numeric}</output></div>;
}

export function VideoOptionsPanel({ model, settings, onChange }: Props) {
  const entries = model ? Object.entries(model.settings) : [];
  if (!entries.length) return null;
  return (
    <section className={styles.formSection}>
      <div className={styles.sectionKicker}><SlidersHorizontal size={15} /> 영상 옵션</div>
      <div className={styles.optionsGrid}>
        {entries.map(([key, field]) => <label className={styles.optionField} key={key}><span>{titleFor(key)}</span><SettingControl field={field} fieldKey={key} value={settings[key]} onChange={(value) => onChange(key, value)} /></label>)}
      </div>
    </section>
  );
}
