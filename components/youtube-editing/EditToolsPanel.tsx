"use client";

import { useState } from "react";
import { Calendar, FileImage, FileText, Grid2X2, Image as ImageIcon, LayoutTemplate, Sparkles, Sticker, Video } from "lucide-react";
import { C, R } from "@/lib/theme";
import { DRAW_COLORS, SOUND_EFFECT_OPTIONS, TRANSITION_OPTIONS } from "@/lib/youtube-editing/constants";
import type { CanvasObject, CanvasObjectType, Segment, SoundEffectOption, TransitionOption } from "@/lib/youtube-editing/types";

const QUICK_ADD_ITEMS: { type: CanvasObjectType; label: string; icon: React.ReactNode }[] = [
  { type: "image_thumb", label: "이미지 자료", icon: <ImageIcon size={16} /> },
  { type: "diagram_thumb", label: "모식도", icon: <FileImage size={16} /> },
  { type: "infographic_thumb", label: "인포그래픽", icon: <Grid2X2 size={16} /> },
  { type: "template_thumb", label: "템플릿", icon: <LayoutTemplate size={16} /> },
  { type: "broll_thumb", label: "영상 B-roll", icon: <Video size={16} /> },
  { type: "hospital_thumb", label: "병원 현장", icon: <FileText size={16} /> },
  { type: "icon_thumb", label: "아이콘", icon: <Sticker size={16} /> },
  { type: "calendar_thumb", label: "캘린더", icon: <Calendar size={16} /> },
];

function QuickAddButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 5, minHeight: 56,
        borderRadius: R.md, border: `1px solid ${C.border}`, background: "#fff", color: C.teal, cursor: "pointer", padding: 6,
      }}
    >
      {icon}
      <span style={{ fontSize: 9.5, fontWeight: 700, color: C.muted }}>{label}</span>
    </button>
  );
}

export default function EditToolsPanel({
  segment,
  onUpdate,
  onAddCanvasObject,
  selectedObject,
  onUpdateObject,
  onDeleteObject,
  onGeneratePrompt,
  generatingPrompt,
}: {
  segment: Segment;
  onUpdate: (patch: Partial<Segment>) => void;
  onAddCanvasObject: (type: CanvasObjectType, label: string) => void;
  selectedObject: CanvasObject | null;
  onUpdateObject: (id: string, patch: Partial<CanvasObject>) => void;
  onDeleteObject: (id: string) => void;
  onGeneratePrompt: () => void;
  generatingPrompt: boolean;
}) {
  const [tab, setTab] = useState<"tools" | "properties">("tools");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 12, flexShrink: 0 }}>
        {(["tools", "properties"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            style={{
              flex: 1, height: 34, borderRadius: R.sm, border: `1px solid ${tab === key ? C.teal : C.border}`,
              background: tab === key ? C.mint : "#fff", color: tab === key ? C.teal : C.muted, fontSize: 12, fontWeight: 800, cursor: "pointer",
            }}
          >
            {key === "tools" ? "편집 도구" : "속성"}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {tab === "tools" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, marginBottom: 8 }}>빠른 추가</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
                {QUICK_ADD_ITEMS.map((item) => (
                  <QuickAddButton key={item.type} icon={item.icon} label={item.label} onClick={() => onAddCanvasObject(item.type, item.label)} />
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, marginBottom: 8 }}>효과음</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
                {SOUND_EFFECT_OPTIONS.map((option: SoundEffectOption) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onUpdate({ soundEffect: option })}
                    style={{
                      height: 32, borderRadius: R.sm, border: `1px solid ${segment.soundEffect === option ? C.teal : C.border}`,
                      background: segment.soundEffect === option ? C.mint : "#fff", color: segment.soundEffect === option ? C.teal : C.ink,
                      fontSize: 11, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, marginBottom: 8 }}>전환 효과</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
                {TRANSITION_OPTIONS.map((option: TransitionOption) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onUpdate({ transition: option })}
                    style={{
                      height: 32, borderRadius: R.sm, border: `1px solid ${segment.transition === option ? C.teal : C.border}`,
                      background: segment.transition === option ? C.mint : "#fff", color: segment.transition === option ? C.teal : C.ink,
                      fontSize: 11, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : selectedObject ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, display: "block", marginBottom: 4 }}>라벨</label>
              <input
                value={selectedObject.label}
                onChange={(e) => onUpdateObject(selectedObject.id, { label: e.target.value })}
                style={{ width: "100%", boxSizing: "border-box", height: 32, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 10px", fontSize: 12 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, display: "block", marginBottom: 4 }}>배경색</label>
              <div style={{ display: "flex", gap: 6 }}>
                {[...DRAW_COLORS, "#EAF4F2", "#FDECEA"].map((color) => (
                  <button key={color} type="button" onClick={() => onUpdateObject(selectedObject.id, { color })} aria-label={color}
                    style={{ width: 22, height: 22, borderRadius: "50%", background: color, cursor: "pointer", padding: 0,
                      border: selectedObject.color === color ? `2px solid ${C.teal}` : "1px solid rgba(0,0,0,.12)" }} />
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, display: "block", marginBottom: 4 }}>너비</label>
                <input type="range" min={0.08} max={0.9} step={0.01} value={selectedObject.width}
                  onChange={(e) => onUpdateObject(selectedObject.id, { width: Number(e.target.value) })} style={{ width: "100%" }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, display: "block", marginBottom: 4 }}>높이</label>
                <input type="range" min={0.06} max={0.9} step={0.01} value={selectedObject.height}
                  onChange={(e) => onUpdateObject(selectedObject.id, { height: Number(e.target.value) })} style={{ width: "100%" }} />
              </div>
            </div>
            <button
              type="button"
              onClick={() => onDeleteObject(selectedObject.id)}
              style={{ height: 34, borderRadius: R.sm, border: `1px solid ${C.border}`, background: "#fff", color: C.danger, fontSize: 12, fontWeight: 800, cursor: "pointer" }}
            >
              삭제
            </button>
          </div>
        ) : (
          <p style={{ fontSize: 12, color: C.hint }}>캔버스에서 요소를 선택하면 속성을 편집할 수 있습니다.</p>
        )}
      </div>

      <div style={{ flexShrink: 0, marginTop: 12 }}>
        <button
          type="button"
          disabled={!segment.visual.description.trim() || generatingPrompt}
          onClick={onGeneratePrompt}
          style={{
            width: "100%", height: 44, borderRadius: R.md, border: `1px solid ${C.teal}`, background: C.mint, color: C.teal,
            fontSize: 12.5, fontWeight: 800, cursor: !segment.visual.description.trim() || generatingPrompt ? "not-allowed" : "pointer",
            opacity: !segment.visual.description.trim() || generatingPrompt ? 0.55 : 1,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
          }}
        >
          <span><Sparkles size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{generatingPrompt ? "생성 중..." : "이미지 프롬프트 생성"}</span>
          <span style={{ fontSize: 9.5, fontWeight: 600, opacity: 0.75 }}>선택한 자료 항목의 프롬프트를 만듭니다.</span>
        </button>
      </div>
    </div>
  );
}
