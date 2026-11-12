"use client";

import type { ReactNode } from "react";
import {
  STUDIO_LIGHTING_SENSITIVITY,
  type LightingSensitivity,
  type StudioGroupSortMode,
  type StudioSubMode,
} from "@/lib/photo-classifier/studioGrouping";
import { C, Card } from "./PhotoSortingUi";

type StudioFileMode = "copy" | "move";

export function StudioClassificationSettings({
  subMode,
  onSubModeChange,
  groupSortMode,
  onGroupSortModeChange,
  gapMinutes,
  onGapMinutesChange,
  sourceControl,
  lightingSensitivity,
  onLightingSensitivityChange,
  fileMode,
  onFileModeChange,
}: {
  subMode: StudioSubMode;
  onSubModeChange: (value: StudioSubMode) => void;
  groupSortMode: StudioGroupSortMode;
  onGroupSortModeChange: (value: StudioGroupSortMode) => void;
  gapMinutes: number;
  onGapMinutesChange: (value: number) => void;
  sourceControl: ReactNode;
  lightingSensitivity: LightingSensitivity;
  onLightingSensitivityChange: (value: LightingSensitivity) => void;
  fileMode: StudioFileMode;
  onFileModeChange: (value: StudioFileMode) => void;
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
            color: C.purple,
          }}
        >
          촬영 구성
        </div>
        <div
          className="pc-mobile-form-grid"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}
        >
          {([
            ["concept", "한 명 · 여러 컨셉", "의상·포즈 기준 분류 (기존 모드)"],
            ["group", "여러 명 · 같은 컨셉", "얼굴 분석으로 인물별 분류 (신규)"],
          ] as const).map(([value, title, description]) => {
            const selected = subMode === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => onSubModeChange(value)}
                aria-pressed={selected}
                style={{
                  padding: "16px 20px",
                  textAlign: "left",
                  border: "none",
                  borderRight: value === "concept" ? `1px solid ${C.border}` : "none",
                  background: selected ? "#F5F0FF" : "transparent",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: selected ? C.purple : C.muted,
                    marginBottom: 4,
                  }}
                >
                  {title}
                  {selected && " ✓"}
                </div>
                <div style={{ fontSize: 11, color: C.hint, lineHeight: 1.6 }}>
                  {description}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <div
        style={{
          padding: 14,
          background: "#F5F0FF",
          borderRadius: 12,
          fontSize: 11,
          color: "#4C1D95",
          border: "1px solid #DDD6FE",
          lineHeight: 1.8,
        }}
      >
        {subMode === "group" ? (
          <>
            <strong>여러 명 · 같은 컨셉 모드</strong>: 촬영 시간차 또는 AI 얼굴 분석으로 인물별 자동 분류.
            <br />
            폴더명(예: 01_인물1)은 분류 후 수정 가능. 조명 불량 컷은 <strong>00_ETC_조명불량</strong>으로 분리됩니다.
          </>
        ) : (
          <>
            <strong>한 명 · 여러 컨셉 모드</strong>: 의상 변화와 포즈 변화를 기준으로 분류합니다.
            <br />
            포즈는 Standing / Sitting 두 가지로만 나눕니다. 조명 불량 컷은 <strong>00_ETC_조명불량</strong> 폴더로 분리합니다.
          </>
        )}
      </div>

      {subMode === "group" ? (
        <Card>
          <div
            style={{
              padding: "14px 20px",
              borderBottom: `1px solid ${C.border}`,
              fontSize: 12,
              fontWeight: 600,
              color: C.purple,
            }}
          >
            인물 구분 방식
          </div>
          <div
            style={{
              padding: "14px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {([
              ["gap", "⏱ 시간차로만", "촬영 간격이 설정 시간 이상이면 다음 인물로 구분. AI 없이 즉시 처리."],
              ["gap_ai", "⏱+🤖 시간차 + AI", "시간차로 인물을 나눈 후, AI가 조명 불량 컷을 필터링. (권장)"],
              ["ai", "🤖 AI 얼굴 분석만", "AI가 얼굴 특징(성별·나이·헤어·안경·수염)으로 인물 매칭. 느리지만 정확."],
            ] as const).map(([value, title, description]) => {
              const selected = groupSortMode === value;
              return (
                <label
                  key={value}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    cursor: "pointer",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: `1.5px solid ${selected ? C.purple : C.border}`,
                    background: selected ? "rgba(151,123,220,.14)" : "transparent",
                  }}
                >
                  <input
                    type="radio"
                    name="groupSortMode"
                    value={value}
                    checked={selected}
                    onChange={() => onGroupSortModeChange(value)}
                    style={{ marginTop: 2, accentColor: C.purple }}
                  />
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: selected ? C.purple : C.txt,
                        marginBottom: 2,
                      }}
                    >
                      {title}
                      {value === "gap_ai" ? (
                        <span
                          style={{
                            fontSize: 10,
                            background: C.purple,
                            color: "rgba(255,255,255,.92)",
                            borderRadius: 4,
                            padding: "1px 5px",
                            marginLeft: 6,
                          }}
                        >
                          권장
                        </span>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 11, color: C.hint, lineHeight: 1.5 }}>
                      {description}
                    </div>
                  </div>
                </label>
              );
            })}

            {groupSortMode !== "ai" ? (
              <div
                style={{
                  padding: "10px 12px",
                  background: C.bg,
                  borderRadius: 8,
                  border: `1px solid ${C.border}`,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 500, color: C.muted, marginBottom: 8 }}>
                  인물 전환 기준 시간차
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[1, 2, 3, 5, 7, 10].map((value) => {
                    const selected = gapMinutes === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => onGapMinutesChange(value)}
                        aria-pressed={selected}
                        style={{
                          padding: "5px 12px",
                          borderRadius: 6,
                          border: `1.5px solid ${selected ? C.purple : C.border}`,
                          background: selected ? C.purple : "transparent",
                          color: selected ? "rgba(255,255,255,.92)" : C.muted,
                          fontSize: 11,
                          fontWeight: 500,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        {value}분
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: 10, color: C.hint, marginTop: 6 }}>
                  {gapMinutes}분 이상 촬영 간격 → 다음 인물로 전환
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card>
        <div
          style={{
            padding: "14px 20px",
            borderBottom: `1px solid ${C.border}`,
            fontSize: 12,
            fontWeight: 600,
            color: C.purple,
          }}
        >
          폴더 선택
        </div>
        <div
          style={{
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {sourceControl}
          <div>
            <div style={{ fontSize: 11, fontWeight: 500, color: C.muted, marginBottom: 6 }}>
              조명 불량 ETC 기준
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {(Object.keys(STUDIO_LIGHTING_SENSITIVITY) as LightingSensitivity[]).map((value) => (
                <label
                  key={value}
                  style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11, cursor: "pointer" }}
                >
                  <input
                    type="radio"
                    name="lighting"
                    value={value}
                    checked={lightingSensitivity === value}
                    onChange={() => onLightingSensitivityChange(value)}
                    style={{ marginTop: 1 }}
                  />
                  <span
                    style={{
                      color: lightingSensitivity === value ? C.purple : C.muted,
                      fontWeight: lightingSensitivity === value ? 600 : 500,
                    }}
                  >
                    {STUDIO_LIGHTING_SENSITIVITY[value]}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 500, color: C.muted, marginBottom: 6 }}>
              파일 처리 방식
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {([
                ["copy", "복사 — 원본을 남기고 분류 폴더에 복사"],
                ["move", "이동 — 원본을 분류 폴더로 이동"],
              ] as const).map(([value, label]) => (
                <label
                  key={value}
                  style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11, cursor: "pointer" }}
                >
                  <input
                    type="radio"
                    name="studioFileMode"
                    value={value}
                    checked={fileMode === value}
                    onChange={() => onFileModeChange(value)}
                    style={{ marginTop: 1 }}
                  />
                  <span
                    style={{
                      color: fileMode === value ? C.purple : C.muted,
                      fontWeight: fileMode === value ? 600 : 500,
                    }}
                  >
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}
