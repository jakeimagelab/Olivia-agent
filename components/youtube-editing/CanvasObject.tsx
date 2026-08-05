"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import type { CanvasObject as CanvasObjectData } from "@/lib/youtube-editing/types";

const LABEL_BY_TYPE: Record<string, string> = {
  sketch_placeholder: "원장 스케치",
  image_thumb: "이미지 자료",
  diagram_thumb: "의료 모식도",
  infographic_thumb: "인포그래픽",
  template_thumb: "디자인 템플릿",
  broll_thumb: "영상 B-roll",
  hospital_thumb: "병원 현장",
  icon_thumb: "아이콘",
  calendar_thumb: "캘린더",
  text: "텍스트",
  memo: "메모",
};

// 캔버스 위에 얹는 이동/삭제 가능한 DOM 오버레이 요소. 손글씨 획(canvas 픽셀)과는 별개 레이어라
// 드래그·삭제 구현이 단순해진다. 위치/크기는 0~1 비율(퍼센트)로 저장해 컨테이너 크기와 무관하게 맞는다.
export default function CanvasObject({
  object,
  containerRef,
  onMove,
  onDelete,
  onSelect,
  selected,
}: {
  object: CanvasObjectData;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onMove: (id: string, x: number, y: number) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
  selected: boolean;
}) {
  const [live, setLive] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ pointerId: number; startClientX: number; startClientY: number; startX: number; startY: number } | null>(null);

  const pos = live ?? { x: object.x, y: object.y };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    onSelect(object.id);
    (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startClientX: event.clientX, startClientY: event.clientY, startX: object.x, startY: object.y };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const container = containerRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !container) return;
    const rect = container.getBoundingClientRect();
    const dx = (event.clientX - drag.startClientX) / rect.width;
    const dy = (event.clientY - drag.startClientY) / rect.height;
    const nextX = Math.max(0, Math.min(1 - object.width, drag.startX + dx));
    const nextY = Math.max(0, Math.min(1 - object.height, drag.startY + dy));
    setLive({ x: nextX, y: nextY });
  };

  const finishDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (live) onMove(object.id, live.x, live.y);
    setLive(null);
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      style={{
        position: "absolute",
        left: `${pos.x * 100}%`,
        top: `${pos.y * 100}%`,
        width: `${object.width * 100}%`,
        height: `${object.height * 100}%`,
        background: object.color,
        border: `1.5px ${selected ? "solid #2563EB" : "dashed rgba(21,88,85,.35)"}`,
        borderRadius: 8,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "grab", touchAction: "none", userSelect: "none",
        fontSize: 11, fontWeight: 700, color: "#155855", textAlign: "center", padding: 4, boxSizing: "border-box",
      }}
    >
      {object.label || LABEL_BY_TYPE[object.type] || object.type}
      {selected ? (
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); onDelete(object.id); }}
          aria-label="요소 삭제"
          style={{
            position: "absolute", top: -8, right: -8, width: 20, height: 20, borderRadius: "50%",
            background: "#fff", border: "1px solid rgba(21,88,85,.2)", color: "#DC2626",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}
        >
          <X size={11} />
        </button>
      ) : null}
    </div>
  );
}
