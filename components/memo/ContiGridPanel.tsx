"use client";

import { useRef } from "react";
import DrawingCanvas from "@/components/DrawingCanvas";
import MemoTextArea from "@/components/memo/MemoTextArea";

type Props = {
  columns: number;
  rows: number;
  captions: string[];
  onChange: (captions: string[]) => void;
  drawings: string[];
  onDrawingsChange: (drawings: string[]) => void;
};

export default function ContiGridPanel({ columns, rows, captions, onChange, drawings, onDrawingsChange }: Props) {
  const count = columns * rows;
  const values = Array.from({ length: count }, (_, index) => captions[index] ?? "");
  const fields = useRef(new Map<number, HTMLTextAreaElement>());
  const update = (index: number, value: string) => {
    const next = [...values];
    next[index] = value;
    onChange(next);
  };
  const updateDrawing = (index: number, value: string) => {
    const next = Array.from({ length: count }, (_, currentIndex) => drawings[currentIndex] ?? "");
    next[index] = value;
    onDrawingsChange(next);
  };
  const move = (index: number, direction: 1 | -1) => {
    const next = index + direction;
    if (next < 0 || next >= count) return;
    requestAnimationFrame(() => fields.current.get(next)?.focus());
  };
  const moveByGrid = (index: number, direction: "left" | "right" | "up" | "down") => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const candidate = direction === "left" ? index - 1
      : direction === "right" ? index + 1
        : direction === "up" ? index - columns
          : index + columns;
    if ((direction === "left" && column === 0) || (direction === "right" && column === columns - 1)
      || (direction === "up" && row === 0) || (direction === "down" && row === rows - 1)) return;
    requestAnimationFrame(() => fields.current.get(candidate)?.focus());
  };

  return (
    <section className="memo-conti-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} aria-label="콘티 프레임">
      {values.map((caption, index) => (
        <article className="memo-conti-cell" key={index} onClick={() => fields.current.get(index)?.focus()}>
          <span className="memo-conti-frame-number">{String(index + 1).padStart(2, "0")}</span>
          <div className="memo-conti-drawing" aria-label={`${index + 1}번 프레임 그림 영역`}>
            <DrawingCanvas
              penType="ballpoint"
              penSize={3}
              penColor="#155855"
              isEraser={false}
              eraserSize={24}
              initialImage={drawings[index] || undefined}
              onStrokeEnd={(dataUrl) => updateDrawing(index, dataUrl)}
              style={{ width: "100%", height: "100%" }}
            />
          </div>
          <MemoTextArea
            ref={(node) => {
              if (node) fields.current.set(index, node);
              else fields.current.delete(index);
            }}
            aria-label={`${index + 1}번 프레임 설명`}
            value={caption}
            onChange={(value) => update(index, value)}
            onTabNavigate={(direction) => move(index, direction)}
            onKeyDown={(event) => {
              if (!event.metaKey) return;
              const keys: Record<string, "left" | "right" | "up" | "down"> = {
                ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
              };
              const direction = keys[event.key];
              if (!direction) return;
              event.preventDefault();
              moveByGrid(index, direction);
            }}
            placeholder="장면 설명"
            rows={2}
          />
        </article>
      ))}
    </section>
  );
}
