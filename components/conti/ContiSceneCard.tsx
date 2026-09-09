import type { ReactNode } from "react";

export type ContiSceneCardColor = { bg: string; text: string };

export type ContiSceneCardProps = {
  index: number;
  category: string;
  duration?: string;
  keyword?: string;
  description?: string;
  location?: string;
  cameraAngle?: string;
  personnel?: string;
  color: ContiSceneCardColor;
  completed?: boolean;
  /** 드래그 핸들 등 헤더 왼쪽(번호 배지 앞)에 끼워 넣는 슬롯 — 없으면 순수 읽기 전용 카드. */
  headerLeft?: ReactNode;
  /** 편집 화면 전용 컨트롤(완료 체크박스 등)을 헤더 오른쪽에 끼워 넣는 슬롯 — 없으면 순수 읽기 전용 카드. */
  headerRight?: ReactNode;
};

// ContiBuilder.tsx(필드뷰)와 app/conti/view/[token]/page.tsx(공유뷰)가 함께 쓰는 순수 표시용
// 카드. 드래그/완료토글 같은 동작은 이 컴포넌트가 모르고, 호출부가 바깥 wrapper에서 처리한다.
export default function ContiSceneCard({
  index, category, duration, keyword, description,
  location, cameraAngle, personnel, color, completed, headerLeft, headerRight,
}: ContiSceneCardProps) {
  const bodyColor = completed ? "#166534" : color.text;
  const headerBg = completed ? "#DCFCE7" : color.bg;

  return (
    <div style={{
      background: completed ? "#F6FBF8" : "#fff",
      borderRadius: 14,
      border: "1px solid #C8DDD9",
      overflow: "hidden",
      boxShadow: "0 3px 16px rgba(21,88,85,0.07)",
      opacity: completed ? 0.72 : 1,
      transition: "opacity 200ms",
    }}>
      <div style={{
        background: headerBg, padding: "12px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        borderBottom: `1px solid ${completed ? "rgba(22,101,52,0.15)" : "rgba(0,0,0,0.06)"}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          {headerLeft}
          <span style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
            background: "rgba(0,0,0,0.14)", color: bodyColor,
            fontSize: 11.5, fontWeight: 900,
          }}>{index}</span>
          <span style={{ color: bodyColor, fontWeight: 900, fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{category}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {duration ? (
            <span style={{ background: "rgba(0,0,0,0.09)", color: bodyColor, fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 99, whiteSpace: "nowrap" }}>⏱ {duration}</span>
          ) : null}
          {headerRight}
        </div>
      </div>

      <div style={{ padding: "16px", display: "grid", gap: 12 }}>
        {keyword ? (
          <div style={{
            color: completed ? "#6B7280" : "#E85D2C", fontWeight: 900, fontSize: 15,
            textDecoration: completed ? "line-through" : "none",
          }}>{keyword}</div>
        ) : null}
        {description ? (
          <p style={{ color: completed ? "#6B7280" : "#3A5450", fontSize: 13, lineHeight: 1.75, margin: 0, whiteSpace: "pre-line" }}>
            {description}
          </p>
        ) : null}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <ContiSceneMiniField icon="📍" label="장소" value={location} />
          <ContiSceneMiniField icon="📷" label="구도" value={cameraAngle} />
          <ContiSceneMiniField icon="👥" label="필요인원" value={personnel} span2 />
        </div>
      </div>
    </div>
  );
}

function ContiSceneMiniField({ icon, label, value, span2 }: { icon: string; label: string; value?: string; span2?: boolean }) {
  return (
    <div style={{ background: "#EDF5F3", borderRadius: 10, padding: "9px 12px", gridColumn: span2 ? "1/-1" : undefined }}>
      <div style={{ color: "#7A9E9B", fontSize: 11, fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
        <span aria-hidden="true">{icon}</span>{label}
      </div>
      <div style={{ color: "#1C2B28", fontSize: 13, fontWeight: 700, lineHeight: 1.5 }}>{value || "—"}</div>
    </div>
  );
}
