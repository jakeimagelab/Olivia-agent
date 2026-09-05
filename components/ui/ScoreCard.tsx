"use client";

import type { ReactNode } from "react";

export type ScoreStatus = "good" | "normal" | "risk";

type ScoreCardProps = {
  label: string;
  score: number;
  maxScore?: number;
  status?: ScoreStatus;
  description?: ReactNode;
};

const STATUS_COLOR: Record<ScoreStatus, string> = {
  good: "var(--score-good)",
  normal: "var(--score-normal)",
  risk: "var(--score-risk)",
};

// 점수만으로 상태를 못 정했을 때의 기본 3단 구간 — 화면마다 다른 기준이 필요하면
// status를 직접 넘기면 된다(이 계산은 최후 수단일 뿐).
function statusFromScore(score: number, maxScore: number): ScoreStatus {
  const ratio = score / maxScore;
  if (ratio >= 0.75) return "good";
  if (ratio >= 0.45) return "normal";
  return "risk";
}

// OLIVIA OS Desktop UI 제안서 유형 C + 3단계 — "지금 7개 분석 화면이 서로 다른 초록·빨강을
// 쓰고 있다"는 문제를 막기 위한 단일 컴포넌트. 색은 반드시 이 세 값 중 하나만 쓴다:
// 좋음 #4C9A5C / 보통 #E9A227 / 주의 #C0473F. 아직 어느 분석 화면에도 연결하지 않았다 —
// 유형 C(6단계, 13개 화면)에서 실제로 갈아끼운다.
export default function ScoreCard({ label, score, maxScore = 100, status, description }: ScoreCardProps) {
  const resolvedStatus = status ?? statusFromScore(score, maxScore);
  const color = STATUS_COLOR[resolvedStatus];

  return (
    <div style={{
      border: ".5px solid var(--line)", borderRadius: 12, padding: 16,
      background: "#fff", display: "flex", flexDirection: "column", gap: 6, minWidth: 0,
    }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <strong style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1 }}>{score}</strong>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>/ {maxScore}</span>
      </div>
      <div style={{ height: 4, borderRadius: 99, background: "var(--panel-bg)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(100, (score / maxScore) * 100)}%`, background: color, borderRadius: "inherit" }} />
      </div>
      {description ? <p style={{ margin: 0, fontSize: 11, color: "var(--muted)", lineHeight: 1.5 }}>{description}</p> : null}
    </div>
  );
}
