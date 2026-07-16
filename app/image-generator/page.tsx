"use client";

import { useState, useRef } from "react";
import {
  Camera,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Download,
  FileImage,
  ImagePlus,
  Loader2,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { PageHeading } from "@/components/PageHeading";
import Link from "next/link";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
type Mode = "real" | "variation" | "conti";
type Stage =
  | "idle"
  | "building-prompt"
  | "generating"
  | "selecting"
  | "refining"
  | "checklist"
  | "done";

interface RefSlots {
  space?: string;
  person?: string;
  style?: string;
  original?: string;
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const SCENE_TYPES = [
  "상담 장면",
  "시술 장면",
  "수술 장면",
  "병실 장면",
  "접수 / 대기 장면",
  "복도 / 공간",
  "의료진 프로필",
  "검사 장면",
  "재활 장면",
  "소아 진료",
];

const DEPARTMENTS = [
  "피부과",
  "성형외과",
  "내과",
  "소아청소년과",
  "정형외과",
  "안과",
  "치과",
  "산부인과",
  "정신건강의학과",
  "응급의학과",
  "신경과",
  "외과",
];

const PEOPLE_TYPES = [
  "원장 단독",
  "원장 + 환자",
  "원장 + 간호사",
  "의료진 팀",
  "환자 단독",
  "가족 (보호자 + 아이)",
  "시니어 환자",
  "소아 환자",
];

const AGE_GROUPS = ["영유아 (0-5세)", "소아 (6-12세)", "청소년 (13-19세)", "2030대", "4050대", "시니어 (60+)"];

const MOOD_OPTIONS = [
  "따뜻한",
  "신뢰감 있는",
  "밝고 화사한",
  "차분한",
  "전문적인",
  "편안한",
  "희망적인",
  "프리미엄한",
];

const LIGHTING_OPTIONS = ["자연광 (창가)", "소프트박스", "역광 / 림라이트", "실내 간접 조명", "골든 아워", "형광등 느낌 금지"];

const COMPOSITION_OPTIONS = [
  "3분할 구도",
  "인물 중심",
  "환경 인물 (공간 함께)",
  "클로즈업",
  "로우앵글",
  "하이앵글",
  "시선 유도",
  "여백 많음",
];

const USAGE_OPTIONS = [
  "인스타그램 피드",
  "릴스 썸네일",
  "스토리",
  "홈페이지 배너",
  "블로그 썸네일",
  "네이버 플레이스",
  "제안서",
  "콘티",
];

const REFINEMENT_QUICK = [
  "표정 더 자연스럽게",
  "조명 더 밝게",
  "AI 느낌 줄이기",
  "배경 더 깔끔하게",
  "손 더 자연스럽게",
  "피부 더 자연스럽게",
  "공간감 더 넓게",
  "색감 더 따뜻하게",
];

const CHECKLIST_ITEMS = [
  { key: "expression", label: "인물 표정이 자연스러운가?" },
  { key: "hands", label: "손/팔/의료 소품이 어색하지 않은가?" },
  { key: "space", label: "병원 공간처럼 보이는가?" },
  { key: "lighting", label: "조명이 자연스러운가?" },
  { key: "ai_feel", label: "AI/CG 느낌이 강하지 않은가?" },
  { key: "comfort", label: "의료적으로 불편한 장면은 없는가?" },
  { key: "usable", label: "제안서나 콘티에 사용할 수 있는가?" },
];

// 소아 병실 프리셋
const PRESETS: Record<string, Partial<{
  sceneType: string;
  department: string;
  peopleType: string;
  ageGroup: string;
  moods: string[];
  lighting: string;
  composition: string;
  usage: string;
  extraRequest: string;
}>> = {
  "소아 병실 장면": {
    sceneType: "병실 장면",
    department: "소아청소년과",
    peopleType: "가족 (보호자 + 아이)",
    ageGroup: "소아 (6-12세)",
    moods: ["따뜻한", "편안한", "희망적인"],
    lighting: "자연광 (창가)",
    composition: "환경 인물 (공간 함께)",
    usage: "홈페이지 배너",
    extraRequest: "아이와 보호자가 함께하는 따뜻한 병실 장면, 의료진이 친절하게 케어하는 모습",
  },
  "원장 상담컷": {
    sceneType: "상담 장면",
    department: "피부과",
    peopleType: "원장 + 환자",
    ageGroup: "2030대",
    moods: ["전문적인", "신뢰감 있는", "따뜻한"],
    lighting: "역광 / 림라이트",
    composition: "3분할 구도",
    usage: "인스타그램 피드",
    extraRequest: "창가 역광, 머리결 림라이트, 자연스러운 상담 분위기",
  },
  "의료진 팀샷": {
    sceneType: "의료진 프로필",
    department: "내과",
    peopleType: "의료진 팀",
    ageGroup: "2030대",
    moods: ["전문적인", "신뢰감 있는", "프리미엄한"],
    lighting: "소프트박스",
    composition: "인물 중심",
    usage: "홈페이지 배너",
    extraRequest: "화이트 가운, 정돈된 병원 로비 배경, 자신감 있는 표정",
  },
};

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────
export default function ImageDirectorPage() {
  // Form state
  const [mode, setMode] = useState<Mode>("real");
  const [sceneType, setSceneType] = useState("");
  const [department, setDepartment] = useState("");
  const [peopleType, setPeopleType] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [moods, setMoods] = useState<string[]>([]);
  const [lighting, setLighting] = useState("");
  const [composition, setComposition] = useState("");
  const [usage, setUsage] = useState("");
  const [extraRequest, setExtraRequest] = useState("");
  const [refs, setRefs] = useState<RefSlots>({});

  // Generation state
  const [stage, setStage] = useState<Stage>("idle");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [refinedImages, setRefinedImages] = useState<string[]>([]);
  const [refinementReq, setRefinementReq] = useState("");
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [checklistStatus, setChecklistStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  // Ref file inputs
  const spaceRef = useRef<HTMLInputElement>(null);
  const personRef = useRef<HTMLInputElement>(null);
  const styleRef = useRef<HTMLInputElement>(null);
  const originalRef = useRef<HTMLInputElement>(null);

  // ── Helpers ─────────────────────────────────────────────
  function toggleMood(m: string) {
    setMoods((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  function applyPreset(name: string) {
    const p = PRESETS[name];
    if (!p) return;
    if (p.sceneType) setSceneType(p.sceneType);
    if (p.department) setDepartment(p.department);
    if (p.peopleType) setPeopleType(p.peopleType);
    if (p.ageGroup) setAgeGroup(p.ageGroup);
    if (p.moods) setMoods(p.moods);
    if (p.lighting) setLighting(p.lighting);
    if (p.composition) setComposition(p.composition);
    if (p.usage) setUsage(p.usage);
    if (p.extraRequest) setExtraRequest(p.extraRequest);
  }

  function handleRefImage(slot: keyof RefSlots, file: File | null) {
    if (!file) {
      setRefs((prev) => ({ ...prev, [slot]: undefined }));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setRefs((prev) => ({ ...prev, [slot]: e.target?.result as string }));
    };
    reader.readAsDataURL(file);
  }

  async function downloadImage(url: string, index: number) {
    const a = document.createElement("a");
    a.href = url;
    a.download = `photoclinic-director-${index + 1}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ── Generate ─────────────────────────────────────────────
  async function handleGenerate() {
    setError("");
    setStage("building-prompt");
    setProgress("올리비아가 촬영 디렉팅 중...");
    setImages([]);
    setSelectedImage(null);
    setRefinedImages([]);
    setChecklist({});
    setChecklistStatus("pending");
    setGeneratedPrompt("");

    try {
      setProgress("1차 시안 4장 생성 중...");
      setStage("generating");

      const res = await fetch("/api/image-director", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          sceneType,
          department,
          peopleType,
          ageGroup,
          mood: moods.join(", "),
          lighting,
          composition,
          usage,
          extraRequest,
        }),
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "이미지 생성 실패");

      setGeneratedPrompt(data.prompt || "");
      setImages(data.images || []);
      setStage("selecting");
      setProgress("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "생성 실패";
      setError(msg);
      setStage("idle");
      setProgress("");
    }
  }

  // ── Refine ───────────────────────────────────────────────
  async function handleRefine() {
    if (!selectedImage) return;
    setError("");
    setStage("refining");
    setProgress("선택 이미지 정교화 중...");

    try {
      const res = await fetch("/api/image-director", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          sceneType,
          department,
          peopleType,
          ageGroup,
          mood: moods.join(", "),
          lighting,
          composition,
          usage,
          extraRequest,
          step: "refine",
          selectedImageUrl: selectedImage,
          refinementRequest: refinementReq,
        }),
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "정교화 생성 실패");

      setRefinedImages(data.images || []);
      setStage("checklist");
      setProgress("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "정교화 실패";
      setError(msg);
      setStage("selecting");
      setProgress("");
    }
  }

  const isGenerating = stage === "building-prompt" || stage === "generating" || stage === "refining";
  const allChecked = CHECKLIST_ITEMS.every((item) => checklist[item.key]);

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────
  return (
    <main className="admin-shell">
      <PageHeader title="리얼 이미지 디렉터" />

      {/* Hero */}
      <div style={{ padding: "32px 32px 0" }}>
        <p className="admin-kicker">PHOTOCLINIC REAL IMAGE DIRECTOR</p>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--deep-green)", marginBottom: 8 }}>
          포토클리닉 리얼 이미지 디렉터
        </h1>
        <p style={{ color: "#555", marginBottom: 24, fontSize: "0.95rem" }}>
          올리비아가 병원 촬영 디렉터처럼 프롬프트를 설계하고, OpenAI gpt-image-1로 실사 품질 병원 이미지 4장을 생성합니다.
        </p>
      </div>

      {/* Mode Tabs */}
      <div style={{ padding: "0 32px 24px" }}>
        <div className="ops-filter-bar" style={{ flexWrap: "wrap", gap: 8 }}>
          {(
            [
              { key: "real", icon: <ImagePlus size={15} />, label: "리얼 병원 이미지 생성" },
              { key: "variation", icon: <Camera size={15} />, label: "실사진 기반 베리에이션" },
              { key: "conti", icon: <FileImage size={15} />, label: "촬영 콘티 시안 생성" },
            ] as { key: Mode; icon: React.ReactNode; label: string }[]
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setMode(tab.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 16px",
                borderRadius: 8,
                border: "2px solid",
                borderColor: mode === tab.key ? "var(--deep-green)" : "#ddd",
                background: mode === tab.key ? "var(--deep-green)" : "#fff",
                color: mode === tab.key ? "#fff" : "#555",
                fontWeight: mode === tab.key ? 700 : 400,
                cursor: "pointer",
                fontSize: "0.88rem",
                transition: "all 0.15s",
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
        {mode === "conti" && (
          <p style={{ fontSize: "0.82rem", color: "var(--orange)", marginTop: 8 }}>
            콘티 모드: 스토리보드 스타일의 일러스트레이션 느낌 이미지를 생성합니다.
          </p>
        )}
        {mode === "variation" && (
          <p style={{ fontSize: "0.82rem", color: "var(--orange)", marginTop: 8 }}>
            베리에이션 모드: 아래 레퍼런스 슬롯에 원본 사진을 업로드하면 OpenAI edits API로 변형합니다.
          </p>
        )}
      </div>

      {/* Main 2-column layout */}
      <div
        className="pc-mobile-stack"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 440px",
          gap: 24,
          padding: "0 32px 48px",
          alignItems: "start",
        }}
      >
        {/* ──── LEFT: Form ──── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Presets */}
          <div className="ops-panel">
            <h3 style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--orange)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              빠른 프리셋
            </h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.keys(PRESETS).map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => applyPreset(name)}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 20,
                    border: "1.5px solid var(--deep-green)",
                    background: "#fff",
                    color: "var(--deep-green)",
                    fontSize: "0.83rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* Scene Type */}
          <div className="ops-panel">
            <h3 style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--orange)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              장면 유형
            </h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {SCENE_TYPES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSceneType(s)}
                  style={{
                    padding: "6px 13px",
                    borderRadius: 16,
                    border: "1.5px solid",
                    borderColor: sceneType === s ? "var(--deep-green)" : "#ddd",
                    background: sceneType === s ? "var(--deep-green)" : "#faf9f7",
                    color: sceneType === s ? "#fff" : "#444",
                    fontSize: "0.83rem",
                    cursor: "pointer",
                    fontWeight: sceneType === s ? 600 : 400,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Department + People + Age */}
          <div className="ops-panel">
            <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "#555", display: "block", marginBottom: 8 }}>
                  진료과
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {DEPARTMENTS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDepartment(d)}
                      style={{
                        padding: "5px 11px",
                        borderRadius: 14,
                        border: "1.5px solid",
                        borderColor: department === d ? "var(--deep-green)" : "#ddd",
                        background: department === d ? "var(--deep-green)" : "#faf9f7",
                        color: department === d ? "#fff" : "#444",
                        fontSize: "0.8rem",
                        cursor: "pointer",
                        fontWeight: department === d ? 600 : 400,
                      }}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "#555", display: "block", marginBottom: 8 }}>
                  인물 구성
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {PEOPLE_TYPES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPeopleType(p)}
                      style={{
                        padding: "5px 11px",
                        borderRadius: 14,
                        border: "1.5px solid",
                        borderColor: peopleType === p ? "var(--deep-green)" : "#ddd",
                        background: peopleType === p ? "var(--deep-green)" : "#faf9f7",
                        color: peopleType === p ? "#fff" : "#444",
                        fontSize: "0.8rem",
                        cursor: "pointer",
                        fontWeight: peopleType === p ? 600 : 400,
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "#555", display: "block", marginBottom: 8, marginTop: 16 }}>
                  연령대
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {AGE_GROUPS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAgeGroup(a)}
                      style={{
                        padding: "5px 11px",
                        borderRadius: 14,
                        border: "1.5px solid",
                        borderColor: ageGroup === a ? "var(--deep-green)" : "#ddd",
                        background: ageGroup === a ? "var(--deep-green)" : "#faf9f7",
                        color: ageGroup === a ? "#fff" : "#444",
                        fontSize: "0.8rem",
                        cursor: "pointer",
                        fontWeight: ageGroup === a ? 600 : 400,
                      }}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Mood (multi), Lighting, Composition */}
          <div className="ops-panel">
            <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "#555", display: "block", marginBottom: 8 }}>
                  분위기 (복수선택)
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {MOOD_OPTIONS.map((m) => (
                    <label
                      key={m}
                      style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: "0.83rem" }}
                    >
                      <input
                        type="checkbox"
                        checked={moods.includes(m)}
                        onChange={() => toggleMood(m)}
                        style={{ accentColor: "var(--deep-green)", width: 15, height: 15 }}
                      />
                      {m}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "#555", display: "block", marginBottom: 8 }}>
                  조명
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {LIGHTING_OPTIONS.map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLighting(l)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 8,
                        border: "1.5px solid",
                        borderColor: lighting === l ? "var(--deep-green)" : "#ddd",
                        background: lighting === l ? "var(--deep-green)" : "#faf9f7",
                        color: lighting === l ? "#fff" : "#444",
                        fontSize: "0.8rem",
                        cursor: "pointer",
                        textAlign: "left",
                        fontWeight: lighting === l ? 600 : 400,
                      }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "#555", display: "block", marginBottom: 8 }}>
                  구도
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {COMPOSITION_OPTIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setComposition(c)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 8,
                        border: "1.5px solid",
                        borderColor: composition === c ? "var(--deep-green)" : "#ddd",
                        background: composition === c ? "var(--deep-green)" : "#faf9f7",
                        color: composition === c ? "#fff" : "#444",
                        fontSize: "0.8rem",
                        cursor: "pointer",
                        textAlign: "left",
                        fontWeight: composition === c ? 600 : 400,
                      }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Usage */}
          <div className="ops-panel">
            <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "#555", display: "block", marginBottom: 10 }}>
              활용 목적 (사이즈 자동 결정)
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {USAGE_OPTIONS.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUsage(u)}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 18,
                    border: "1.5px solid",
                    borderColor: usage === u ? "var(--orange)" : "#ddd",
                    background: usage === u ? "var(--orange)" : "#faf9f7",
                    color: usage === u ? "#fff" : "#444",
                    fontSize: "0.83rem",
                    cursor: "pointer",
                    fontWeight: usage === u ? 600 : 400,
                  }}
                >
                  {u}
                </button>
              ))}
            </div>
            {usage && (
              <p style={{ fontSize: "0.78rem", color: "#888", marginTop: 8 }}>
                사이즈:{" "}
                {{
                  "인스타그램 피드": "1024×1024",
                  "릴스 썸네일": "1024×1536",
                  "스토리": "1024×1536",
                  "홈페이지 배너": "1536×1024",
                  "블로그 썸네일": "1536×1024",
                  "네이버 플레이스": "1024×1024",
                  "제안서": "1536×1024",
                  "콘티": "1536×1024",
                }[usage] || "1024×1024"}
              </p>
            )}
          </div>

          {/* Reference Image Slots */}
          <div className="ops-panel">
            <h3 style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--orange)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              레퍼런스 이미지 (선택)
            </h3>
            <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {(
                [
                  { key: "space", label: "공간 레퍼런스", ref: spaceRef },
                  { key: "person", label: "인물 무드", ref: personRef },
                  { key: "style", label: "포토클리닉 스타일", ref: styleRef },
                  { key: "original", label: "원본 사진 (베리에이션용)", ref: originalRef },
                ] as { key: keyof RefSlots; label: string; ref: React.RefObject<HTMLInputElement | null> }[]
              ).map(({ key, label, ref }) => (
                <div
                  key={key}
                  style={{
                    border: "2px dashed #ddd",
                    borderRadius: 12,
                    overflow: "hidden",
                    position: "relative",
                    aspectRatio: "4/3",
                    background: "#faf9f7",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  onClick={() => ref.current?.click()}
                >
                  <input
                    ref={ref}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => handleRefImage(key, e.target.files?.[0] || null)}
                  />
                  {refs[key] ? (
                    <>
                      <img
                        src={refs[key]}
                        alt={label}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRefs((prev) => ({ ...prev, [key]: undefined }));
                          if (ref.current) ref.current.value = "";
                        }}
                        style={{
                          position: "absolute",
                          top: 6,
                          right: 6,
                          background: "rgba(0,0,0,0.6)",
                          color: "#fff",
                          border: "none",
                          borderRadius: "50%",
                          width: 24,
                          height: 24,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                        }}
                      >
                        <X size={13} />
                      </button>
                    </>
                  ) : (
                    <div style={{ textAlign: "center", color: "#aaa" }}>
                      <Upload size={20} style={{ marginBottom: 4 }} />
                      <p style={{ fontSize: "0.75rem", margin: 0 }}>{label}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Extra Request */}
          <div className="ops-panel">
            <label style={{ fontSize: "0.82rem", fontWeight: 700, color: "#555", display: "block", marginBottom: 8 }}>
              추가 요청 (자유 입력)
            </label>
            <textarea
              value={extraRequest}
              onChange={(e) => setExtraRequest(e.target.value)}
              placeholder="피하고 싶은 표현, 원하는 구도, 의상, 소품, 배경 등 자유롭게 입력하세요."
              rows={3}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1.5px solid #ddd",
                fontSize: "0.88rem",
                resize: "vertical",
                outline: "none",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                padding: "12px 16px",
                background: "#fff0ed",
                border: "1.5px solid var(--orange)",
                borderRadius: 8,
                color: "var(--orange)",
                fontSize: "0.88rem",
              }}
            >
              {error}
            </div>
          )}

          {/* Generate Button */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="admin-primary-button"
            style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", padding: "14px 24px", fontSize: "1rem" }}
          >
            {isGenerating ? <Loader2 size={18} className="spin-icon" /> : <Sparkles size={18} />}
            {isGenerating ? progress : "AI 이미지 4장 생성하기"}
          </button>
        </div>

        {/* ──── RIGHT: Result Panel ──── */}
        <aside style={{ position: "sticky", top: 80, display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Prompt Preview */}
          {(generatedPrompt || stage !== "idle") && (
            <div className="ops-panel" style={{ background: "#f5f9f8" }}>
              <p className="admin-kicker">PROMPT PREVIEW</p>
              <p style={{ fontSize: "0.8rem", color: "#555", lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: 160, overflowY: "auto" }}>
                {generatedPrompt || (isGenerating ? "프롬프트 생성 중..." : "")}
              </p>
            </div>
          )}

          {/* Loading */}
          {isGenerating && (
            <div
              style={{
                padding: 32,
                background: "#fff",
                border: "1.5px solid #e8e8e8",
                borderRadius: 16,
                textAlign: "center",
                color: "var(--deep-green)",
              }}
            >
              <Loader2 size={32} className="spin-icon" style={{ marginBottom: 12 }} />
              <p style={{ fontWeight: 600, marginBottom: 4 }}>{progress}</p>
              <p style={{ fontSize: "0.82rem", color: "#888" }}>gpt-image-1으로 실사 이미지 생성 중...</p>
            </div>
          )}

          {/* 1st: Generated Images Grid */}
          {images.length > 0 && (stage === "selecting" || stage === "checklist" || stage === "done") && (
            <div className="ops-panel">
              <p className="admin-kicker">1차 시안 ({images.length}장)</p>
              <p style={{ fontSize: "0.8rem", color: "#666", marginBottom: 12 }}>이미지를 클릭하면 선택됩니다.</p>
              <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {images.map((img, i) => (
                  <div
                    key={i}
                    onClick={() => {
                      setSelectedImage(img);
                      if (stage === "selecting") setStage("selecting");
                    }}
                    style={{
                      position: "relative",
                      borderRadius: 10,
                      overflow: "hidden",
                      cursor: "pointer",
                      border: selectedImage === img ? "3px solid var(--orange)" : "2px solid transparent",
                      boxShadow: selectedImage === img ? "0 0 0 2px var(--orange)" : "none",
                      transition: "all 0.15s",
                      aspectRatio: "1",
                    }}
                  >
                    <img src={img} alt={`시안 ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    {selectedImage === img && (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          background: "rgba(229,93,44,0.12)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <span style={{ background: "var(--orange)", color: "#fff", padding: "4px 10px", borderRadius: 20, fontSize: "0.75rem", fontWeight: 700 }}>
                          선택됨
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); downloadImage(img, i); }}
                      style={{
                        position: "absolute",
                        bottom: 6,
                        right: 6,
                        background: "rgba(0,0,0,0.55)",
                        border: "none",
                        borderRadius: 6,
                        color: "#fff",
                        padding: "4px 6px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 3,
                        fontSize: "0.72rem",
                      }}
                    >
                      <Download size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2nd: Refinement Panel */}
          {selectedImage && stage === "selecting" && (
            <div className="ops-panel" style={{ borderLeft: "4px solid var(--orange)" }}>
              <p className="admin-kicker">2차 정교화</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {REFINEMENT_QUICK.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setRefinementReq((prev) => prev ? `${prev}, ${q}` : q)}
                    style={{
                      padding: "5px 10px",
                      borderRadius: 14,
                      border: "1.5px solid var(--deep-green)",
                      background: "#fff",
                      color: "var(--deep-green)",
                      fontSize: "0.78rem",
                      cursor: "pointer",
                      fontWeight: 500,
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
              <textarea
                value={refinementReq}
                onChange={(e) => setRefinementReq(e.target.value)}
                placeholder="정교화 요청을 자유롭게 입력하세요."
                rows={2}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1.5px solid #ddd",
                  fontSize: "0.85rem",
                  resize: "none",
                  marginBottom: 10,
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
              <button
                type="button"
                onClick={handleRefine}
                disabled={isGenerating}
                style={{
                  width: "100%",
                  padding: "10px 16px",
                  background: "var(--orange)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  justifyContent: "center",
                }}
              >
                {isGenerating ? <Loader2 size={16} className="spin-icon" /> : <Sparkles size={16} />}
                정교화 생성 (2장)
              </button>
            </div>
          )}

          {/* Refined Images */}
          {refinedImages.length > 0 && stage === "checklist" && (
            <div className="ops-panel">
              <p className="admin-kicker">2차 정교화 결과</p>
              <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                {refinedImages.map((img, i) => (
                  <div
                    key={i}
                    style={{ borderRadius: 10, overflow: "hidden", position: "relative", aspectRatio: "1" }}
                  >
                    <img src={img} alt={`정교화 ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <button
                      type="button"
                      onClick={() => downloadImage(img, i)}
                      style={{
                        position: "absolute",
                        bottom: 6,
                        right: 6,
                        background: "rgba(0,0,0,0.55)",
                        border: "none",
                        borderRadius: 6,
                        color: "#fff",
                        padding: "4px 6px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 3,
                        fontSize: "0.72rem",
                      }}
                    >
                      <Download size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Checklist */}
          {stage === "checklist" && (
            <div className="ops-panel" style={{ borderLeft: "4px solid var(--deep-green)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <CheckSquare size={18} color="var(--deep-green)" />
                <p className="admin-kicker" style={{ margin: 0 }}>검수 체크리스트</p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                {CHECKLIST_ITEMS.map((item) => (
                  <label
                    key={item.key}
                    style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", fontSize: "0.87rem" }}
                  >
                    <input
                      type="checkbox"
                      checked={!!checklist[item.key]}
                      onChange={(e) =>
                        setChecklist((prev) => ({ ...prev, [item.key]: e.target.checked }))
                      }
                      style={{ accentColor: "var(--deep-green)", width: 16, height: 16 }}
                    />
                    <span style={{ color: checklist[item.key] ? "var(--deep-green)" : "#555", fontWeight: checklist[item.key] ? 600 : 400 }}>
                      {item.label}
                    </span>
                  </label>
                ))}
              </div>

              {checklistStatus === "pending" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => { setChecklistStatus("approved"); setStage("done"); }}
                    disabled={!allChecked}
                    style={{
                      flex: 1,
                      padding: "9px 12px",
                      background: allChecked ? "var(--deep-green)" : "#ddd",
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      cursor: allChecked ? "pointer" : "not-allowed",
                    }}
                  >
                    통과
                  </button>
                  <button
                    type="button"
                    onClick={() => { setStage("selecting"); setRefinedImages([]); }}
                    style={{
                      flex: 1,
                      padding: "9px 12px",
                      background: "#fff",
                      color: "var(--orange)",
                      border: "1.5px solid var(--orange)",
                      borderRadius: 8,
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    다시 정교화
                  </button>
                  <button
                    type="button"
                    onClick={() => { setChecklistStatus("rejected"); setStage("idle"); setImages([]); setRefinedImages([]); setSelectedImage(null); }}
                    style={{
                      padding: "9px 12px",
                      background: "#fff",
                      color: "#999",
                      border: "1.5px solid #ddd",
                      borderRadius: 8,
                      fontSize: "0.85rem",
                      cursor: "pointer",
                    }}
                  >
                    폐기
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Done — save/connect buttons */}
          {stage === "done" && (
            <div className="ops-panel" style={{ background: "#f0f9f7", border: "1.5px solid var(--deep-green)" }}>
              <p style={{ fontWeight: 700, color: "var(--deep-green)", marginBottom: 12 }}>검수 완료! 이미지를 저장하거나 연결하세요.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {refinedImages[0] && (
                  <button
                    type="button"
                    onClick={() => downloadImage(refinedImages[0], 0)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "10px 14px",
                      background: "var(--deep-green)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontSize: "0.88rem",
                    }}
                  >
                    <Download size={15} />
                    이미지 다운로드
                  </button>
                )}
                <Link
                  href="/conti"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 14px",
                    background: "#fff",
                    color: "var(--deep-green)",
                    border: "1.5px solid var(--deep-green)",
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: "0.88rem",
                    textDecoration: "none",
                  }}
                >
                  <ChevronRight size={15} />
                  콘티에 연결
                </Link>
                <Link
                  href="/sns-manager"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 14px",
                    background: "#fff",
                    color: "var(--orange)",
                    border: "1.5px solid var(--orange)",
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: "0.88rem",
                    textDecoration: "none",
                  }}
                >
                  <ChevronDown size={15} />
                  SNS에 연결
                </Link>
              </div>
            </div>
          )}

          {/* Idle placeholder */}
          {stage === "idle" && images.length === 0 && (
            <div
              style={{
                padding: 40,
                background: "#faf9f7",
                border: "2px dashed #ddd",
                borderRadius: 16,
                textAlign: "center",
                color: "#bbb",
              }}
            >
              <Sparkles size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
              <p style={{ fontSize: "0.9rem", margin: 0 }}>
                왼쪽 폼을 작성하고<br />생성하기 버튼을 누르세요
              </p>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
