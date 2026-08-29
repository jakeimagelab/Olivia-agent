"use client";

import { useState } from "react";
import { usePhotoClassificationChatStore } from "@/lib/store/usePhotoClassificationChatStore";
import { usePhotoClassificationHandoffStore } from "@/lib/store/usePhotoClassificationHandoffStore";
import { DEPARTMENT_DISPLAY, type MedicalDepartment } from "@/lib/photo-classifier/types";
import { countJpgFiles } from "@/lib/photo-classifier/countJpgFiles";
import { executeOliviaAction } from "@/lib/olivia/agent/actionRouter";
import { useOliviaConversationStore } from "@/lib/store/useOliviaConversationStore";

// PhotoSortingWorkspace.tsx(components/photo-classifier/, 원래 /photo-sorting 페이지)의 실제
// 설정값과 기본값을 그대로 따른다(PHASE 4, 2026-08-30) — GAP_OPTIONS([3,3.5,5,7,10]분),
// DEPARTMENT_DISPLAY(10개 진료과), 토글 4개(진료과 로직/AI 씬 이름 추천/품질 분석/프로필 자동
// 분류) 라벨/설명 문구까지 실제 페이지와 동일하게 맞췄다 — 가짜 옵션을 만들지 않는다는 스펙
// 원칙(§0, §12, §13) 그대로.
const GAP_OPTIONS = [3, 3.5, 5, 7, 10];
const gapLabel = (g: number) => (g === 3.5 ? "3분30초" : `${g}분`);

const LIGHTING_LABELS: Record<"loose" | "medium" | "strict", string> = {
  loose: "느슨함 — 거의 시꺼먼 컷만 ETC",
  medium: "보통 — 얼굴이 명확히 어두운 컷 ETC (권장)",
  strict: "강함 — 얼굴 밝기가 조금만 낮아도 ETC",
};

const FIELD_OPTIONS: { key: "departmentLogicEnabled" | "aiNamingEnabled" | "qualityAnalysisEnabled" | "profileClassificationEnabled"; label: string; desc: string }[] = [
  { key: "departmentLogicEnabled", label: "진료과 로직 사용", desc: "선택한 진료과에 맞는 장면 분류 기준을 적용합니다." },
  { key: "aiNamingEnabled", label: "AI 씬 이름 추천", desc: "대표 이미지를 분석해 진료과에 맞는 폴더명을 추천합니다." },
  { key: "qualityAnalysisEnabled", label: "품질 분석", desc: "흔들림, 조명불량 등 불량컷을 00_QUALITY_EXCLUDED/ 폴더로 분리합니다." },
  { key: "profileClassificationEnabled", label: "프로필 자동 분류", desc: "1인 단독·정면 응시 컷만 PROFILE/ 폴더로 분류합니다." },
];

export default function PhotoClassificationChatCard({ flowId }: { flowId: string }) {
  const flow = usePhotoClassificationChatStore((s) => s.flows[flowId]);
  const store = usePhotoClassificationChatStore.getState;
  const [folderScanning, setFolderScanning] = useState(false);

  if (!flow) return null;

  const appendAssistantText = (text: string) => {
    useOliviaConversationStore.getState().appendMessage({
      id: crypto.randomUUID(),
      role: "assistant",
      content: text,
      blocks: [{ type: "text", text }],
      createdAt: new Date().toISOString(),
      status: "complete",
    });
  };

  const chooseMode = (mode: "field" | "studio") => {
    store().setPhotoMode(flowId, mode);
    store().setStep(flowId, mode === "field" ? "choose_department" : "picking_folder");
  };

  const chooseDepartment = (department: MedicalDepartment) => {
    store().updateSettings(flowId, { department });
    store().setStep(flowId, "picking_folder");
  };

  const pickFolder = async () => {
    try {
      // showDirectoryPicker는 반드시 클릭 핸들러의 첫 번째 await여야 한다(user gesture) —
      // SelectMatchChatCard.tsx와 동일한 이유·패턴.
      const dir = await (window as any).showDirectoryPicker({ mode: "read" });
      store().setRootDir(flowId, dir, dir.name);
      store().setStep(flowId, "scanning");
      setFolderScanning(true);
      const count = await countJpgFiles(dir);
      store().setFileCount(flowId, count);
      store().setStep(flowId, "folder_ready");
    } catch (e: any) {
      if (e?.name !== "AbortError") store().setError(flowId, "폴더 선택에 실패했어요. 다시 시도해주세요.");
    } finally {
      setFolderScanning(false);
    }
  };

  const afterFolderReady = () => {
    store().setStep(flowId, flow.photoMode === "field" ? "choose_boundary" : "choose_lighting");
  };

  const start = () => {
    if (!flow.rootDir || !flow.photoMode) return;
    usePhotoClassificationHandoffStore.getState().handoff({
      photoMode: flow.photoMode,
      department: flow.settings.department,
      rootDir: flow.rootDir,
      rootDirName: flow.rootDirName,
      gapMinutes: flow.settings.gapMinutes,
      fastAnalyzeMode: flow.settings.fastAnalyzeMode,
      departmentLogicEnabled: flow.settings.departmentLogicEnabled,
      aiNamingEnabled: flow.settings.aiNamingEnabled,
      qualityAnalysisEnabled: flow.settings.qualityAnalysisEnabled,
      profileClassificationEnabled: flow.settings.profileClassificationEnabled,
      lightingSensitivity: flow.settings.lightingSensitivity,
      studioSubMode: flow.settings.studioSubMode,
    });
    executeOliviaAction({ type: "OPEN_WORKSPACE", workspace: "photo-sort" });
    store().setStep(flowId, "done");
    appendAssistantText("사진 분류를 시작할게요. 왼쪽 화면에서 진행 상황을 확인할 수 있어요.");
  };

  return (
    <div className="olivia-select-match-card">
      {flow.step === "choose_mode" && (
        <div className="olivia-select-match-card__section">
          <p>사진 분류를 도와드릴게요. 어떤 촬영인가요?</p>
          <div className="olivia-select-match-card__actions">
            <button type="button" onClick={() => chooseMode("field")}>병원 현장촬영</button>
            <button type="button" className="is-secondary" onClick={() => chooseMode("studio")}>스튜디오 프로필촬영</button>
          </div>
        </div>
      )}

      {flow.step === "choose_department" && (
        <div className="olivia-select-match-card__section">
          <p>진료과를 선택해주세요.</p>
          <div className="olivia-select-match-card__tabs" style={{ flexWrap: "wrap" }}>
            {(Object.entries(DEPARTMENT_DISPLAY) as [MedicalDepartment, string][]).map(([value, label]) => (
              <button key={value} type="button" className={flow.settings.department === value ? "is-active" : ""} onClick={() => chooseDepartment(value)}>{label}</button>
            ))}
          </div>
        </div>
      )}

      {flow.step === "picking_folder" && (
        <div className="olivia-select-match-card__section">
          <p>분류할 데이터 폴더를 선택해주세요.</p>
          <button type="button" disabled={folderScanning} onClick={() => void pickFolder()}>
            {folderScanning ? "확인 중…" : "📂 데이터 폴더 선택 →"}
          </button>
          {flow.errorMessage && <div className="olivia-select-match-card__error">{flow.errorMessage}</div>}
        </div>
      )}

      {flow.step === "scanning" && (
        <div className="olivia-select-match-card__section">
          <div className="olivia-select-match-card__progress-bar"><i /></div>
          <p>폴더 확인 중...</p>
        </div>
      )}

      {flow.step === "folder_ready" && (
        <div className="olivia-select-match-card__section">
          <strong>✓ 데이터 폴더</strong>
          <p>{flow.rootDirName}<br />사진 {flow.fileCount.toLocaleString()}장</p>
          <div className="olivia-select-match-card__actions">
            <button type="button" className="is-secondary" onClick={() => store().setStep(flowId, "picking_folder")}>다시 선택</button>
            <button type="button" onClick={afterFolderReady}>다음 →</button>
          </div>
        </div>
      )}

      {flow.step === "choose_boundary" && (
        <div className="olivia-select-match-card__section">
          <p>씬 경계시간을 선택해주세요.</p>
          <div className="olivia-select-match-card__tabs">
            {GAP_OPTIONS.map((g) => (
              <button key={g} type="button" className={flow.settings.gapMinutes === g ? "is-active" : ""} onClick={() => { store().updateSettings(flowId, { gapMinutes: g }); store().setStep(flowId, "choose_speed"); }}>{gapLabel(g)}</button>
            ))}
          </div>
        </div>
      )}

      {flow.step === "choose_speed" && (
        <div className="olivia-select-match-card__section">
          <p>어떤 방식으로 분류할까요?</p>
          <div className="olivia-select-match-card__actions">
            <button type="button" onClick={() => { store().updateSettings(flowId, { fastAnalyzeMode: false }); store().setStep(flowId, "choose_options"); }}>🔍 정밀 분류</button>
            <button type="button" className="is-secondary" onClick={() => { store().updateSettings(flowId, { fastAnalyzeMode: true }); store().setStep(flowId, "choose_options"); }}>⚡ 빠른 분석</button>
          </div>
        </div>
      )}

      {flow.step === "choose_options" && (
        <div className="olivia-select-match-card__section">
          <p>분류 옵션을 선택해주세요.</p>
          {FIELD_OPTIONS.map((opt) => (
            <label key={opt.key} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 11, color: "#5A7470" }}>
              <input type="checkbox" checked={flow.settings[opt.key]} onChange={(e) => store().updateSettings(flowId, { [opt.key]: e.target.checked })} style={{ marginTop: 2 }} />
              <span><strong style={{ color: "#1C2B28" }}>{opt.label}</strong><br />{opt.desc}</span>
            </label>
          ))}
          <button type="button" onClick={() => store().setStep(flowId, "ready")}>다음 →</button>
        </div>
      )}

      {flow.step === "choose_lighting" && (
        <div className="olivia-select-match-card__section">
          <p>조명 민감도를 선택해주세요.</p>
          {(Object.entries(LIGHTING_LABELS) as ["loose" | "medium" | "strict", string][]).map(([value, label]) => (
            <button key={value} type="button" className={flow.settings.lightingSensitivity === value ? "is-active" : ""} onClick={() => { store().updateSettings(flowId, { lightingSensitivity: value }); store().setStep(flowId, "choose_submode"); }} style={{ textAlign: "left" }}>{label}</button>
          ))}
        </div>
      )}

      {flow.step === "choose_submode" && (
        <div className="olivia-select-match-card__section">
          <p>몇 명이 촬영된 사진인가요?</p>
          <div className="olivia-select-match-card__actions">
            <button type="button" onClick={() => { store().updateSettings(flowId, { studioSubMode: "concept" }); store().setStep(flowId, "ready"); }}>한 명</button>
            <button type="button" className="is-secondary" onClick={() => { store().updateSettings(flowId, { studioSubMode: "group" }); store().setStep(flowId, "ready"); }}>여러 명</button>
          </div>
        </div>
      )}

      {flow.step === "ready" && (
        <div className="olivia-select-match-card__section">
          <strong>사진 분류 준비 완료</strong>
          <div className="olivia-select-match-card__samples">
            <div>촬영 — {flow.photoMode === "field" ? "병원 현장촬영" : "스튜디오 프로필촬영"}</div>
            {flow.photoMode === "field" && <div>진료과 — {DEPARTMENT_DISPLAY[flow.settings.department]}</div>}
            <div>사진 — {flow.fileCount.toLocaleString()}장</div>
            {flow.photoMode === "field" ? (
              <>
                <div>경계시간 — {gapLabel(flow.settings.gapMinutes)}</div>
                <div>분류모드 — {flow.settings.fastAnalyzeMode ? "빠른 분석" : "정밀 분류"}</div>
              </>
            ) : (
              <div>모드 — {flow.settings.studioSubMode === "group" ? "여러 명" : "한 명"}</div>
            )}
          </div>
          <div className="olivia-select-match-card__actions">
            <button type="button" className="is-secondary" onClick={() => store().setStep(flowId, flow.photoMode === "field" ? "choose_boundary" : "choose_lighting")}>설정 수정</button>
            <button type="button" onClick={start}>사진 분류 시작 →</button>
          </div>
        </div>
      )}

      {flow.step === "done" && (
        <div className="olivia-select-match-card__section">
          <p>사진 분류를 시작했어요. 왼쪽 화면을 확인해주세요.</p>
        </div>
      )}

      {flow.step === "error" && (
        <div className="olivia-select-match-card__section">
          <div className="olivia-select-match-card__error">{flow.errorMessage}</div>
          <button type="button" onClick={() => store().resetFlow(flowId)}>다시 시도</button>
        </div>
      )}
    </div>
  );
}
