"use client";

import { Camera, Captions, Film, ImageIcon, Music2, LayoutTemplate } from "lucide-react";
import { C, R } from "@/lib/theme";
import {
  CAMERA_OPTIONS, CAPTION_APPEARS, CAPTION_COLORS, CAPTION_POSITIONS, CAPTION_TYPES,
  SOUND_EFFECT_OPTIONS, TEMPLATE_OPTIONS, TRANSITION_OPTIONS, VISUAL_LAYOUTS, VISUAL_STYLES, VISUAL_TYPES,
} from "@/lib/youtube-editing/constants";
import type {
  CameraOption, CaptionAppear, CaptionPosition, CaptionType,
  Segment, SoundEffectOption, TemplateOption, TransitionOption,
  VisualLayout, VisualStyle, VisualType,
} from "@/lib/youtube-editing/types";

function CategoryCard({ icon, title, badge, children }: { icon: React.ReactNode; title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: R.md, padding: 10, background: "#fff", minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.muted, fontSize: 11, fontWeight: 800 }}>
        {icon}{title}
        {badge ? <span style={{ marginLeft: "auto", fontSize: 9, color: "#2563EB", background: "#EEF3FF", borderRadius: R.full, padding: "1px 6px", fontWeight: 800 }}>AI</span> : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{children}</div>
    </div>
  );
}

function OptionButton({ active, onClick, inline, children }: { active: boolean; onClick: () => void; inline?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left", width: inline ? "auto" : "100%", minHeight: 28, padding: "5px 8px", borderRadius: 7,
        border: `1px solid ${active ? "#2563EB" : C.border}`, background: active ? "#EEF3FF" : "#fff",
        color: active ? "#2563EB" : C.ink, fontSize: 11, fontWeight: active ? 800 : 600, cursor: "pointer", whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

export default function QuickOptionCards({
  segment,
  onUpdate,
  onGeneratePrompt,
  generatingPrompt,
}: {
  segment: Segment;
  onUpdate: (patch: Partial<Segment>) => void;
  onGeneratePrompt: () => void;
  generatingPrompt: boolean;
}) {
  const toggleCamera = (option: CameraOption) => {
    const has = segment.camera.includes(option);
    onUpdate({ camera: has ? segment.camera.filter((c) => c !== option) : [...segment.camera, option] });
  };
  const setCaptionType = (type: CaptionType) => onUpdate({ caption: { ...segment.caption, type } });
  const setCaptionField = <K extends keyof Segment["caption"]>(key: K, value: Segment["caption"][K]) =>
    onUpdate({ caption: { ...segment.caption, [key]: value } });
  const setVisualType = (type: VisualType) => onUpdate({ visual: { ...segment.visual, enabled: type !== "자료 없음", type } });
  const setVisualField = <K extends keyof Segment["visual"]>(key: K, value: Segment["visual"][K]) =>
    onUpdate({ visual: { ...segment.visual, [key]: value } });

  const showCaptionDetail = segment.caption.type === "효과 자막" || segment.caption.type === "키워드 강조";
  const showVisualDetail = segment.visual.enabled;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
        <CategoryCard icon={<Camera size={13} />} title="카메라">
          {CAMERA_OPTIONS.map((option) => (
            <OptionButton key={option} active={segment.camera.includes(option)} onClick={() => toggleCamera(option)}>{option}</OptionButton>
          ))}
        </CategoryCard>

        <CategoryCard icon={<Captions size={13} />} title="자막">
          {CAPTION_TYPES.map((type) => (
            <OptionButton key={type} active={segment.caption.type === type} onClick={() => setCaptionType(type)}>{type}</OptionButton>
          ))}
        </CategoryCard>

        <CategoryCard icon={<ImageIcon size={13} />} title="자료 / 화면">
          {VISUAL_TYPES.map((type) => (
            <OptionButton key={type} active={segment.visual.type === type} onClick={() => setVisualType(type)}>{type}</OptionButton>
          ))}
        </CategoryCard>

        <CategoryCard icon={<Music2 size={13} />} title="효과음">
          {SOUND_EFFECT_OPTIONS.map((option: SoundEffectOption) => (
            <OptionButton key={option} active={segment.soundEffect === option} onClick={() => onUpdate({ soundEffect: option })}>{option}</OptionButton>
          ))}
        </CategoryCard>

        <CategoryCard icon={<Film size={13} />} title="전환 효과">
          {TRANSITION_OPTIONS.map((option: TransitionOption) => (
            <OptionButton key={option} active={segment.transition === option} onClick={() => onUpdate({ transition: option })}>{option}</OptionButton>
          ))}
        </CategoryCard>

        <CategoryCard icon={<LayoutTemplate size={13} />} title="디자인 템플릿">
          {TEMPLATE_OPTIONS.map((option: TemplateOption) => (
            <OptionButton key={option} active={segment.template === option} onClick={() => onUpdate({ template: option })}>{option}</OptionButton>
          ))}
        </CategoryCard>
      </div>

      {showCaptionDetail ? (
        <div style={{ marginTop: 10, padding: 12, borderRadius: R.md, border: `1px solid ${C.border}`, background: C.bg }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, marginBottom: 8 }}>자막 상세</div>
          <input
            value={segment.caption.text}
            onChange={(e) => setCaptionField("text", e.target.value)}
            placeholder="표시할 문구"
            style={{ width: "100%", boxSizing: "border-box", height: 32, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 10px", fontSize: 12, marginBottom: 8 }}
          />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <FieldGroup label="등장 방식">
              {CAPTION_APPEARS.map((appear: CaptionAppear) => (
                <OptionButton key={appear} active={segment.caption.appear === appear} onClick={() => setCaptionField("appear", appear)}>{appear}</OptionButton>
              ))}
            </FieldGroup>
            <FieldGroup label="위치">
              {CAPTION_POSITIONS.map((position: CaptionPosition) => (
                <OptionButton key={position} active={segment.caption.position === position} onClick={() => setCaptionField("position", position)}>{position}</OptionButton>
              ))}
            </FieldGroup>
            <FieldGroup label="강조 색상">
              <div style={{ display: "flex", gap: 6 }}>
                {CAPTION_COLORS.map((color) => (
                  <button key={color} type="button" onClick={() => setCaptionField("color", color)} aria-label={color}
                    style={{ width: 20, height: 20, borderRadius: "50%", background: color, cursor: "pointer", padding: 0,
                      border: segment.caption.color === color ? `2px solid ${C.teal}` : "1px solid rgba(0,0,0,.12)" }} />
                ))}
              </div>
            </FieldGroup>
          </div>
        </div>
      ) : null}

      {showVisualDetail ? (
        <div style={{ marginTop: 10, padding: 12, borderRadius: R.md, border: `1px solid ${C.border}`, background: C.bg }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: C.muted, marginBottom: 8 }}>자료 / 화면 상세</div>
          <textarea
            value={segment.visual.description}
            onChange={(e) => setVisualField("description", e.target.value)}
            placeholder="자료 설명 (이미지 프롬프트 생성 시 이 내용을 사용합니다)"
            rows={2}
            style={{ width: "100%", boxSizing: "border-box", borderRadius: R.sm, border: `1px solid ${C.border}`, padding: 8, fontSize: 12, marginBottom: 8, resize: "vertical", fontFamily: "inherit" }}
          />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <FieldGroup label="화면 배치">
              {VISUAL_LAYOUTS.map((layout: VisualLayout) => (
                <OptionButton key={layout} active={segment.visual.layout === layout} onClick={() => setVisualField("layout", layout)}>{layout}</OptionButton>
              ))}
            </FieldGroup>
            <FieldGroup label="스타일">
              {VISUAL_STYLES.map((style: VisualStyle) => (
                <OptionButton key={style} active={segment.visual.style === style} onClick={() => setVisualField("style", style)}>{style}</OptionButton>
              ))}
            </FieldGroup>
          </div>
          <button
            type="button"
            disabled={!segment.visual.description.trim() || generatingPrompt}
            onClick={onGeneratePrompt}
            style={{
              width: "100%", height: 36, borderRadius: R.sm, border: 0, background: C.orange, color: "#fff",
              fontSize: 12, fontWeight: 800, cursor: !segment.visual.description.trim() || generatingPrompt ? "not-allowed" : "pointer",
              opacity: !segment.visual.description.trim() || generatingPrompt ? 0.55 : 1,
            }}
          >
            {generatingPrompt ? "생성 중..." : "이미지 프롬프트 생성"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10, color: C.hint, fontWeight: 700 }}>{label}</span>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}
