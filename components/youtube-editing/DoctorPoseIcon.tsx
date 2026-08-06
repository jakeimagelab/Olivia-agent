"use client";

import type { DoctorPoseKey } from "@/lib/youtube-editing/types";

// 원장 포즈는 실사 이미지가 아니라 콘티용 흑백 선화(손그림 느낌)로 표현한다. 얼굴/가운은
// 공통이고 팔 자세만 포즈별로 달라지는 단순한 픽토그램 수준의 아이콘이다.
const HEAD_AND_COAT = (
  <>
    {/* 안경 */}
    <circle cx="41" cy="27" r="6.5" />
    <circle cx="59" cy="27" r="6.5" />
    <line x1="47.5" y1="27" x2="52.5" y2="27" />
    {/* 머리 */}
    <circle cx="50" cy="27" r="16" />
    <path d="M35 20 Q50 6 65 20" />
    {/* 목 */}
    <line x1="50" y1="43" x2="50" y2="50" />
    {/* 가운 */}
    <path d="M32 135 L38 55 Q50 48 62 55 L68 135" />
    <line x1="50" y1="52" x2="46" y2="90" />
    <line x1="50" y1="52" x2="44" y2="66" />
  </>
);

function Arms({ poseKey }: { poseKey: DoctorPoseKey }) {
  switch (poseKey) {
    case "front_basic":
      return (
        <>
          <path d="M38 56 L30 100" />
          <path d="M62 56 L70 100" />
        </>
      );
    case "front_explain_both_hands":
      return (
        <>
          <path d="M38 58 Q18 70 12 90" />
          <circle cx="11" cy="92" r="3.5" />
          <path d="M62 58 Q82 70 88 90" />
          <circle cx="89" cy="92" r="3.5" />
        </>
      );
    case "front_one_finger":
      return (
        <>
          <path d="M62 56 Q78 40 76 18" />
          <line x1="76" y1="18" x2="76" y2="4" />
          <path d="M38 56 L32 98" />
        </>
      );
    case "front_x":
      return (
        <>
          <path d="M36 58 Q58 78 74 62" />
          <path d="M64 58 Q42 78 26 62" />
        </>
      );
    case "left_45":
      return (
        <>
          <path d="M40 58 Q24 66 16 86" />
          <circle cx="15" cy="88" r="3.5" />
          <path d="M60 56 L66 100" />
        </>
      );
    case "right_45":
      return (
        <>
          <path d="M60 58 Q76 66 84 86" />
          <circle cx="85" cy="88" r="3.5" />
          <path d="M40 56 L34 100" />
        </>
      );
    default:
      return null;
  }
}

export default function DoctorPoseIcon({ poseKey, size = 56 }: { poseKey: DoctorPoseKey; size?: number }) {
  const rotate = poseKey === "left_45" ? -10 : poseKey === "right_45" ? 10 : 0;
  return (
    <svg
      width={size}
      height={size * 1.4}
      viewBox="0 0 100 140"
      fill="none"
      stroke="#1C2B28"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g transform={rotate ? `rotate(${rotate} 50 90)` : undefined}>
        {HEAD_AND_COAT}
        <Arms poseKey={poseKey} />
      </g>
    </svg>
  );
}
