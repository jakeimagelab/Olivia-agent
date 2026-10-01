"use client";

import { Clapperboard, Sparkles } from "lucide-react";
import type { VideoModelCapability } from "@/lib/higgsfield/types";
import { activeRoles, ROLE_LABEL } from "./types";
import styles from "./VideoProductionWorkspace.module.css";

type Props = {
  models: VideoModelCapability[];
  modelId: string;
  inputMode?: string;
  onModelChange: (modelId: string) => void;
  onInputModeChange: (inputMode?: string) => void;
};

export function VideoModelSelector({ models, modelId, inputMode, onModelChange, onInputModeChange }: Props) {
  const model = models.find((item) => item.id === modelId);
  const roles = activeRoles(model, inputMode);
  const roleSummary = Object.entries(roles)
    .filter(([, count]) => Boolean(count))
    .map(([role, count]) => `${ROLE_LABEL[role as keyof typeof ROLE_LABEL]} ${count}`)
    .join(" · ");

  return (
    <section className={styles.formSection}>
      <div className={styles.sectionKicker}><Clapperboard size={15} /> 모델 선택</div>
      <select className={styles.select} value={modelId} onChange={(event) => onModelChange(event.target.value)} aria-label="Higgsfield 모델 선택">
        {models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      {model ? (
        <div className={styles.modelDetail}>
          <div><Sparkles size={15} /><strong>{model.label}</strong></div>
          <p>{model.requirePrompt ? "프롬프트가 필요한 영상 모델" : "입력 미디어 또는 프롬프트로 생성 가능한 영상 모델"}</p>
          {roleSummary ? <span>지원 입력: {roleSummary}</span> : <span>지원 입력: 텍스트 프롬프트</span>}
        </div>
      ) : null}
      {model?.mediaModes?.length ? (
        <div className={styles.modeChoices} role="group" aria-label="생성 방식">
          {model.mediaModes.map((mode) => (
            <button key={mode.id} type="button" className={inputMode === mode.id ? styles.choiceActive : styles.choice} onClick={() => onInputModeChange(mode.id)}>
              {mode.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
