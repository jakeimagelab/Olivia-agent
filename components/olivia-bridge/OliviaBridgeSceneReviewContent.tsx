"use client";

import { memo } from "react";
import { Check, CircleAlert, LoaderCircle, RefreshCw, ScanSearch } from "lucide-react";

import { BridgeThumbnail } from "@/components/olivia-bridge/OliviaBridgeMedia";
import type { BridgeJpgFile, BridgeScene, BridgeSceneAnalysis } from "@/lib/photo-bridge/bridgeFiles";
import {
  PHOTO_DEPARTMENT_SOURCE_DISPLAY,
  type PhotoDepartmentResolution,
} from "@/lib/photo-classifier/departmentResolver";
import {
  DEPARTMENT_DESCRIPTION,
  DEPARTMENT_DISPLAY,
  type MedicalDepartment,
} from "@/lib/photo-classifier/types";
import styles from "./OliviaBridgeWorkspace.module.css";

export type OliviaBridgeSceneState = {
  status: "idle" | "running" | "complete" | "error";
  stage: string;
  completed: number;
  total: number;
  scenes: BridgeScene[];
  analysis: BridgeSceneAnalysis | null;
  error?: string;
};

type OliviaBridgeSceneReviewContentProps = {
  sceneState: OliviaBridgeSceneState;
  adobeSelectionLoading: boolean;
  departmentLoading: boolean;
  departmentError: string;
  departmentPickerOpen: boolean;
  departmentResolution: PhotoDepartmentResolution;
  selectedScenes: readonly BridgeScene[];
  scenePhotoByName: ReadonlyMap<string, BridgeJpgFile>;
  selectedFileCount: number;
  boundaryReviewCount: number;
  selectedSceneAnalysisReady: boolean;
  scenePlanReady: boolean;
  onRetry: () => void;
  onOpenDepartmentPicker: () => void;
  onChooseDepartment: (department: MedicalDepartment) => void;
  onApplyScenePlan: () => void;
};

export const OliviaBridgeSceneReviewContent = memo(function OliviaBridgeSceneReviewContent({
  sceneState,
  adobeSelectionLoading,
  departmentLoading,
  departmentError,
  departmentPickerOpen,
  departmentResolution,
  selectedScenes,
  scenePhotoByName,
  selectedFileCount,
  boundaryReviewCount,
  selectedSceneAnalysisReady,
  scenePlanReady,
  onRetry,
  onOpenDepartmentPicker,
  onChooseDepartment,
  onApplyScenePlan,
}: OliviaBridgeSceneReviewContentProps) {
  return <>
    <div className={styles.sceneBody}>
      {sceneState.status === "running" ? (
        <div className={styles.sceneProgress}>
          <span style={{ width: `${sceneState.total ? Math.min(100, sceneState.completed / sceneState.total * 100) : 4}%` }} />
        </div>
      ) : null}
      {sceneState.error ? (
        <div className={styles.sceneError}>
          <CircleAlert size={17} />
          <span>{sceneState.error}</span>
          <button type="button" onClick={onRetry}><RefreshCw size={14} /> 다시 시도</button>
        </div>
      ) : null}
      <section className={styles.departmentContext} aria-label="사진 분류 진료과">
        {departmentLoading ? (
          <div className={styles.departmentStatus}>
            <LoaderCircle className={styles.spin} size={14} />
            <span>등록 고객과 폴더에서 진료과 확인 중...</span>
          </div>
        ) : null}
        {!departmentLoading && departmentResolution.status === "resolved" && !departmentPickerOpen ? (
          <div className={styles.departmentStatus}>
            <Check size={14} />
            <span><strong>{DEPARTMENT_DISPLAY[departmentResolution.department]} 적용됨</strong> · {PHOTO_DEPARTMENT_SOURCE_DISPLAY[departmentResolution.source]}</span>
            {departmentResolution.department === "orthopedics_neurosurgery" && departmentResolution.rawValue !== "orthopedics_neurosurgery" ? (
              <small>{departmentResolution.rawValue} → 근골격·통증계 규칙</small>
            ) : null}
            <button type="button" onClick={onOpenDepartmentPicker}>변경</button>
          </div>
        ) : null}
        {!departmentLoading && (departmentPickerOpen || departmentResolution.status !== "resolved") ? (
          <div className={styles.departmentPicker}>
            <span>{departmentError || (departmentResolution.status === "conflict" ? "등록 고객과 폴더명의 진료과가 다릅니다. 적용할 진료과를 확인해 주세요." : "등록 고객과 폴더명에서 진료과를 찾지 못했습니다.")}</span>
            <label>
              <span>진료과</span>
              <select
                aria-label="사진 분류 진료과 선택"
                value={departmentResolution.status === "resolved" ? departmentResolution.department : ""}
                onChange={(event) => event.target.value && onChooseDepartment(event.target.value as MedicalDepartment)}
              >
                <option value="">진료과를 선택해 주세요</option>
                {(Object.entries(DEPARTMENT_DISPLAY) as Array<[MedicalDepartment, string]>).map(([value, label]) => (
                  <option key={value} value={value}>{label}{DEPARTMENT_DESCRIPTION[value] ? ` (${DEPARTMENT_DESCRIPTION[value]})` : ""}</option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </section>
      <div className={styles.sceneGrid}>
        {selectedScenes.map((scene) => {
          const photo = scenePhotoByName.get(scene.representativeFileName);
          return (
            <article key={scene.id}>
              {photo ? <BridgeThumbnail photo={photo} alt={`${scene.label} 대표 사진`} eager /> : null}
              <div><strong>{scene.label}</strong><span>{scene.fileCount}장</span></div>
              <small>{scene.firstFileName} – {scene.lastFileName}</small>
              {scene.needsReview ? <i>경계 확인 필요</i> : null}
            </article>
          );
        })}
        {sceneState.status === "complete" && !selectedScenes.length ? <p>Olivia 또는 Adobe Bridge에서 분류할 JPG를 선택해 주세요.</p> : null}
      </div>
    </div>
    <footer>
      <div className={styles.sceneApprovalSummary}>
        <strong>Scene {selectedScenes.length.toLocaleString("ko-KR")}개 · 선택 JPG {selectedFileCount.toLocaleString("ko-KR")}장 · 경계 확인 {boundaryReviewCount.toLocaleString("ko-KR")}곳</strong>
        <p>{adobeSelectionLoading ? "Adobe Bridge의 XMP 별점을 확인하고 있습니다." : scenePlanReady ? "Olivia와 Adobe Bridge 선택만 적용합니다. 파일은 아직 이동하지 않습니다." : selectedSceneAnalysisReady && departmentResolution.status !== "resolved" ? "진료과를 확인해야 Scene 계획을 적용할 수 있습니다." : sceneState.status === "complete" ? "Olivia 또는 Adobe Bridge에서 분류할 JPG를 선택해 주세요." : "분석이 끝나면 Scene 계획을 적용할 수 있습니다."}</p>
      </div>
      <button type="button" disabled={!scenePlanReady} onClick={onApplyScenePlan}><ScanSearch size={16} /> 계획 적용하고 Scene 검토</button>
    </footer>
  </>;
});
