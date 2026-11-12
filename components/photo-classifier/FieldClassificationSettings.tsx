"use client";

import { C, Card, Toggle } from "./PhotoSortingUi";

const GAP_OPTIONS = [3, 3.5, 5, 7, 10] as const;

export function FieldClassificationSettings({
  gapMinutes,
  onGapMinutesChange,
  fastAnalyzeMode,
  onFastAnalyzeModeChange,
  departmentLogicEnabled,
  onDepartmentLogicEnabledChange,
  aiNamingEnabled,
  onAiNamingEnabledChange,
  qualityAnalysisEnabled,
  onQualityAnalysisEnabledChange,
  profileClassificationEnabled,
  onProfileClassificationEnabledChange,
}: {
  gapMinutes: number;
  onGapMinutesChange: (value: number) => void;
  fastAnalyzeMode: boolean;
  onFastAnalyzeModeChange: (value: boolean) => void;
  departmentLogicEnabled: boolean;
  onDepartmentLogicEnabledChange: (value: boolean) => void;
  aiNamingEnabled: boolean;
  onAiNamingEnabledChange: (value: boolean) => void;
  qualityAnalysisEnabled: boolean;
  onQualityAnalysisEnabledChange: (value: boolean) => void;
  profileClassificationEnabled: boolean;
  onProfileClassificationEnabledChange: (value: boolean) => void;
}) {
  return (
    <>
      <Card>
        <div
          style={{
            padding: "14px 20px",
            borderBottom: `1px solid ${C.border}`,
            fontSize: 12,
            fontWeight: 600,
            color: C.teal,
          }}
        >
          강제 Scene 경계 시간
        </div>
        <div style={{ padding: "14px 20px" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {GAP_OPTIONS.map((value) => {
              const selected = gapMinutes === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onGapMinutesChange(value)}
                  aria-pressed={selected}
                  style={{
                    flex: 1,
                    padding: "10px 0",
                    borderRadius: 8,
                    border: `1.5px solid ${selected ? C.teal : C.border}`,
                    background: selected ? C.light : C.surface,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    color: selected ? C.teal : C.muted,
                    fontFamily: "inherit",
                  }}
                >
                  {value === 3.5 ? "3분30초" : `${value}분`}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: C.hint }}>
            설정 시간을 넘으면 강제 분리합니다. 그 이내에서도 사람·장비·장소가 바뀌면 새 Scene으로 분리합니다.
          </div>
        </div>
      </Card>

      <Card>
        <div
          style={{
            padding: "14px 20px",
            borderBottom: `1px solid ${C.border}`,
            fontSize: 12,
            fontWeight: 600,
            color: C.teal,
          }}
        >
          분류 모드
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
          {([
            ["fast", "⚡ 빠른 분석", "파일을 이동하지 않고 Scene 계획만 생성합니다.\nRAW는 원본 위치 유지. EXIF 생략. 10~30초 목표."],
            ["precise", "🔍 정밀 분류", "EXIF + 사람·장비·장소 변화 분석.\n검토·승인 전에는 파일을 이동하지 않습니다."],
          ] as const).map(([value, title, description]) => {
            const selected = fastAnalyzeMode === (value === "fast");
            return (
              <button
                key={value}
                type="button"
                onClick={() => onFastAnalyzeModeChange(value === "fast")}
                aria-pressed={selected}
                style={{
                  padding: "14px 18px",
                  textAlign: "left",
                  border: "none",
                  borderRight: value === "fast" ? `1px solid ${C.border}` : "none",
                  background: selected ? C.light : "transparent",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: selected ? C.teal : C.muted,
                    marginBottom: 4,
                  }}
                >
                  {title}
                  {selected && " ✓"}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: C.hint,
                    lineHeight: 1.6,
                    whiteSpace: "pre-line",
                  }}
                >
                  {description}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <div
          style={{
            padding: "14px 20px",
            borderBottom: `1px solid ${C.border}`,
            fontSize: 12,
            fontWeight: 600,
            color: C.teal,
          }}
        >
          분류 옵션
        </div>
        <div
          style={{
            padding: "14px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <Toggle
            label="진료과 로직 사용"
            desc="선택한 진료과에 맞는 장면 분류 기준을 적용합니다."
            value={departmentLogicEnabled}
            onChange={onDepartmentLogicEnabledChange}
          />
          <Toggle
            label="AI 씬 이름 추천"
            desc="대표 이미지를 분석해 진료과에 맞는 폴더명을 추천합니다. 자동 변경 없이 검토 화면에서 확인 후 적용합니다."
            value={aiNamingEnabled}
            onChange={onAiNamingEnabledChange}
          />
          <Toggle
            label="품질 분석"
            desc="흔들림, 조명불량 등 불량컷을 00_QUALITY_EXCLUDED/ 폴더로 분리합니다."
            value={qualityAnalysisEnabled}
            onChange={onQualityAnalysisEnabledChange}
          />
          <Toggle
            label="프로필 자동 분류 (엄격 모드)"
            desc="1인 단독·정면 응시·의도된 정지 포즈일 때만 PROFILE/ 폴더로 분류합니다. 상담/시술 장면은 제외됩니다."
            value={profileClassificationEnabled}
            onChange={onProfileClassificationEnabledChange}
          />
        </div>
      </Card>
    </>
  );
}
