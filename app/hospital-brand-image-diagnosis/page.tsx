"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { C, R, FS, SP } from "@/lib/theme";
import type {
  ChannelDiagnosisResult, ChannelScores, DiagnosisChannel, DiagnosisProgressStatus,
  DiagnosisSource, HospitalBrandDiagnosisReport, SourceStatus, UploadedAsset, VideoAnalysisSummary, VisualCategory,
} from "@/lib/hospitalBrandDiagnosis/types";
import { HBD_CHANNEL_LABEL, HBD_VISUAL_CATEGORY_LABEL } from "@/lib/hospitalBrandDiagnosis/config";

/* ─────────────────────────── 공통 스타일 토큰 ─────────────────────────── */

const inputStyle: React.CSSProperties = {
  height: 40, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 12px", fontSize: FS.md, width: "100%", fontFamily: "inherit",
};
const textareaStyle: React.CSSProperties = {
  borderRadius: R.sm, border: `1px solid ${C.border}`, padding: 12, fontSize: FS.md, width: "100%", fontFamily: "inherit", resize: "vertical",
};
const labelStyle: React.CSSProperties = { fontSize: FS.sm, fontWeight: 800, color: C.muted };
const cardStyle: React.CSSProperties = { background: C.white, borderRadius: R.lg, border: `1px solid ${C.border}`, padding: 22 };
const primaryBtn: React.CSSProperties = {
  height: 44, padding: "0 22px", borderRadius: R.md, border: "none", background: C.teal, color: "#fff",
  fontWeight: 800, fontSize: FS.md, cursor: "pointer",
};
const secondaryBtn: React.CSSProperties = {
  height: 44, padding: "0 22px", borderRadius: R.md, border: `1px solid ${C.border}`, background: C.white, color: C.muted,
  fontWeight: 800, fontSize: FS.md, cursor: "pointer",
};

/* ─────────────────────────── 채널 정의 ─────────────────────────── */

const CHANNEL_LIST: DiagnosisChannel[] = ["website", "naver_place", "naver_blog", "instagram", "youtube", "other"];

const STEP_LABELS = ["기본 정보", "브랜드 목표", "채널 선택", "자료 수집", "콘텐츠 분석", "통합 진단", "결과"];

const DESIRED_IMAGE_PRESETS = [
  "전문적인 병원", "신뢰할 수 있는 병원", "친절하고 편안한 병원", "정직하게 설명하는 병원", "프리미엄한 병원",
  "세련되고 현대적인 병원", "따뜻하고 인간적인 병원", "체계적인 병원", "오랜 경험이 느껴지는 병원",
];
const CORE_STRENGTH_PRESETS = [
  "의료진의 전문성", "상담과 설명", "주요 진료의 차별성", "장비와 시설", "병원 공간", "편리한 접근성",
  "환자 관리", "진료 경험", "오랜 경력",
];
const CURRENT_CONCERN_PRESETS = [
  "병원의 정체성이 잘 보이지 않음", "홈페이지가 오래되어 보임", "사진과 영상의 분위기가 제각각임",
  "주요 진료가 명확하게 보이지 않음", "의료진의 전문성이 충분히 전달되지 않음", "실제 병원의 모습이 부족함",
  "채널마다 다른 병원처럼 보임", "콘텐츠가 지나치게 광고처럼 보임", "어떤 문제가 있는지 잘 모르겠음",
];

const VIDEO_STATUS_LABEL: Record<string, string> = {
  not_requested: "분석 대기", metadata_only: "기본 정보만", thumbnail_only: "썸네일만",
  keyframes: "주요 프레임 분석", full_analysis: "정밀 분석", unsupported: "참고 자료만", failed: "분석 실패",
};

const SOURCE_STATUS_LABEL: Record<SourceStatus, string> = {
  pending: "대기", collecting: "수집 중", complete: "정밀 분석 완료", partial: "일부 정보 수집",
  failed: "수집 실패", manual_required: "자동 분석 제한",
};
const SOURCE_STATUS_COLOR: Record<SourceStatus, string> = {
  pending: C.hint, collecting: C.gold, complete: C.success, partial: C.gold, failed: C.danger, manual_required: C.orange,
};

function uuid() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

// 서버(Vercel)에 ffmpeg를 두지 않고, 브라우저의 <video>+<canvas>로 주요 프레임을 직접 추출한다.
// 시작 / 25% / 50% / 75% / 종료 직전 지점을 기준으로 하되, 영상이 짧으면 프레임 수를 줄인다(섹션 4-3).
async function extractVideoKeyframes(file: File): Promise<{ frames: Blob[]; duration: number; width: number; height: number }> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    video.src = url;
    const cleanup = () => URL.revokeObjectURL(url);

    video.onerror = () => { cleanup(); resolve({ frames: [], duration: 0, width: 0, height: 0 }); };

    video.onloadedmetadata = async () => {
      const duration = video.duration || 0;
      const width = video.videoWidth || 0;
      const height = video.videoHeight || 0;
      if (!duration || !Number.isFinite(duration)) { cleanup(); resolve({ frames: [], duration: 0, width, height }); return; }

      const fractions = duration < 3 ? [0.5] : duration < 10 ? [0, 0.5, 0.95] : [0, 0.25, 0.5, 0.75, 0.95];
      const canvas = document.createElement("canvas");
      canvas.width = width || 640;
      canvas.height = height || 360;
      const ctx = canvas.getContext("2d");
      if (!ctx) { cleanup(); resolve({ frames: [], duration, width, height }); return; }

      const seekTo = (t: number) => new Promise<void>((res) => {
        const onSeeked = () => { video.removeEventListener("seeked", onSeeked); res(); };
        video.addEventListener("seeked", onSeeked);
        video.currentTime = Math.min(Math.max(t, 0), Math.max(duration - 0.05, 0));
      });

      const frames: Blob[] = [];
      try {
        for (const frac of fractions) {
          await seekTo(duration * frac);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", 0.85));
          if (blob) frames.push(blob);
        }
      } catch {
        // 일부 프레임 추출에 실패해도 이미 확보한 프레임까지는 그대로 사용한다.
      }
      cleanup();
      resolve({ frames, duration, width, height });
    };
  });
}

/* ─────────────────────────── 재사용 소형 컴포넌트 ─────────────────────────── */

function StepIndicator({ current, maxReached, isMobile }: { current: number; maxReached: number; isMobile: boolean }) {
  if (isMobile) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 2px 14px" }}>
        <span style={{
          flexShrink: 0, padding: "6px 12px", borderRadius: R.full, background: C.teal, color: "#fff",
          fontSize: FS.xs, fontWeight: 800, whiteSpace: "nowrap",
        }}>STEP {current} / {STEP_LABELS.length}</span>
        <span style={{ fontSize: FS.sm, fontWeight: 800, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {STEP_LABELS[current - 1]}
        </span>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", overflowX: "auto", gap: 6, padding: "4px 2px 14px", WebkitOverflowScrolling: "touch" }}>
      {STEP_LABELS.map((label, i) => {
        const stepNum = i + 1;
        const active = stepNum === current;
        const done = stepNum < current || stepNum <= maxReached;
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: R.full,
              background: active ? C.teal : done ? C.mint : "transparent",
              color: active ? "#fff" : done ? C.teal : C.hint,
              fontSize: FS.xs, fontWeight: 800, border: `1px solid ${active ? C.teal : done ? C.mint : C.border}`,
              whiteSpace: "nowrap",
            }}>
              <span>{stepNum}</span><span>{label}</span>
            </div>
            {i < STEP_LABELS.length - 1 && <div style={{ width: 14, height: 1, background: C.border, flexShrink: 0 }} />}
          </div>
        );
      })}
    </div>
  );
}

function ChipMultiSelect({ presets, value, onChange, placeholder }: {
  presets: string[]; value: string[]; onChange: (next: string[]) => void; placeholder: string;
}) {
  const [customText, setCustomText] = useState("");
  const toggle = (item: string) => {
    onChange(value.includes(item) ? value.filter((v) => v !== item) : [...value, item]);
  };
  const addCustom = () => {
    const trimmed = customText.trim();
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed]);
    setCustomText("");
  };
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {presets.map((item) => (
          <button key={item} type="button" onClick={() => toggle(item)} style={{
            height: 34, padding: "0 14px", borderRadius: R.full, fontSize: FS.sm, fontWeight: 700, cursor: "pointer",
            border: `1px solid ${value.includes(item) ? C.teal : C.border}`,
            background: value.includes(item) ? C.teal : C.white,
            color: value.includes(item) ? "#fff" : C.ink,
          }}>{item}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={customText} onChange={(e) => setCustomText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
          placeholder={placeholder} style={{ ...inputStyle, flex: 1 }} />
        <button type="button" onClick={addCustom} style={{ ...secondaryBtn, height: 40, padding: "0 16px" }}>추가</button>
      </div>
      {value.filter((v) => !presets.includes(v)).length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {value.filter((v) => !presets.includes(v)).map((item) => (
            <span key={item} style={{
              display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 10px 0 12px",
              borderRadius: R.full, background: C.mint, color: C.teal, fontSize: FS.xs, fontWeight: 700,
            }}>
              {item}
              <button type="button" onClick={() => onChange(value.filter((v) => v !== item))}
                style={{ border: "none", background: "transparent", color: C.teal, cursor: "pointer", fontSize: 13, lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

type LocalAsset = UploadedAsset & { previewUrl?: string; analysisJson?: any };

function AssetUploadZone({ diagnosisId, channel, consent, assets, onUploaded, onDeleted }: {
  diagnosisId: string; channel: DiagnosisChannel; consent: boolean;
  assets: LocalAsset[]; onUploaded: (asset: LocalAsset) => void; onDeleted: (assetId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const uploadOne = async (file: File): Promise<LocalAsset> => {
    const form = new FormData();
    form.set("file", file);
    form.set("diagnosisId", diagnosisId);
    form.set("channel", channel);
    form.set("consent", "true");
    const res = await fetch("/api/hospital-brand-diagnosis/upload", { method: "POST", body: form });
    const body = await res.json();
    if (!res.ok || !body.ok) throw new Error(body.error || "업로드 실패");
    return { ...body.asset, previewUrl: URL.createObjectURL(file) };
  };

  // 영상은 원본 파일 업로드 후, 브라우저에서 주요 프레임을 추출해 이미지로 추가 업로드하고
  // 그 결과(VideoAnalysisSummary)를 영상 자산 자체에 기록한다(섹션 4).
  const handleVideoKeyframes = async (file: File, videoAssetId: string) => {
    let summary: VideoAnalysisSummary;
    try {
      const { frames, duration, width, height } = await extractVideoKeyframes(file);
      if (frames.length === 0) {
        summary = {
          status: duration > 0 ? "metadata_only" : "unsupported",
          duration: duration || undefined, width: width || undefined, height: height || undefined,
          thumbnailAnalyzed: false, subtitleAnalyzed: false, titleAnalyzed: true,
          limitations: ["이 브라우저에서는 영상 프레임을 추출하지 못해 제목 등 최소한의 정보만 확인했습니다."],
        };
      } else {
        let analyzedCount = 0;
        for (let i = 0; i < frames.length; i++) {
          try {
            const frameFile = new File([frames[i]], `${file.name.replace(/\.[^.]+$/, "")}_frame${i + 1}.jpg`, { type: "image/jpeg" });
            const frameAsset = await uploadOne(frameFile);
            analyzedCount += 1;
            onUploaded(frameAsset);
          } catch {
            // 프레임 하나가 실패해도 나머지 프레임은 계속 업로드한다.
          }
        }
        summary = {
          status: analyzedCount > 0 ? "keyframes" : "unsupported",
          duration: duration || undefined, width: width || undefined, height: height || undefined,
          frameCount: frames.length, analyzedFrameCount: analyzedCount,
          thumbnailAnalyzed: analyzedCount > 0, subtitleAnalyzed: false, titleAnalyzed: true,
          limitations: [
            "영상은 현재 제목, 썸네일, 첫 장면과 주요 프레임을 중심으로 분석합니다.",
            "영상 전체의 대화와 모든 장면을 정밀하게 분석하는 기능은 지원 준비 중입니다.",
          ],
        };
      }
    } catch {
      summary = {
        status: "unsupported", thumbnailAnalyzed: false, subtitleAnalyzed: false, titleAnalyzed: true,
        limitations: ["영상 분석 준비 중 오류가 발생해 참고 자료로만 저장되었습니다."],
      };
    }
    await fetch("/api/hospital-brand-diagnosis/upload", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId: videoAssetId, videoAnalysisSummary: summary }),
    }).catch(() => {});
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!consent) { setError("업로드 동의 체크박스를 먼저 선택해주세요."); return; }
    setUploading(true);
    setError("");
    for (const file of Array.from(files)) {
      try {
        const asset = await uploadOne(file);
        onUploaded(asset);
        if (file.type.startsWith("video/")) {
          await handleVideoKeyframes(file, asset.id);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "업로드 실패");
      }
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeAsset = async (assetId: string) => {
    onDeleted(assetId);
    await fetch(`/api/hospital-brand-diagnosis/upload?assetId=${encodeURIComponent(assetId)}`, { method: "DELETE" }).catch(() => {});
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
        style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
      <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} style={{
        ...secondaryBtn, height: 40, padding: "0 16px", opacity: uploading || !consent ? 0.6 : 1,
      }}>{uploading ? "업로드 중…" : "화면 캡처·사진·영상 추가"}</button>
      <p style={{ margin: 0, fontSize: FS.xs, color: C.hint, lineHeight: 1.6 }}>
        영상은 현재 제목, 썸네일, 첫 장면과 주요 프레임을 중심으로 분석합니다.<br />
        영상 전체의 대화와 모든 장면을 정밀하게 분석하는 기능은 지원 준비 중입니다.
      </p>
      {error && <p style={{ color: C.danger, fontSize: FS.xs, margin: 0 }}>{error}</p>}
      {assets.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8 }}>
          {assets.map((asset) => {
            const videoSummary = asset.mimeType.startsWith("video/") ? (asset.analysisJson as VideoAnalysisSummary | undefined) : undefined;
            return (
            <div key={asset.id} style={{ position: "relative", borderRadius: R.sm, overflow: "hidden", border: `1px solid ${C.border}`, aspectRatio: "1", background: C.bg }}>
              {asset.previewUrl && asset.mimeType.startsWith("image/") ? (
                <img src={asset.previewUrl} alt={asset.fileName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ display: "grid", placeItems: "center", height: "100%", fontSize: FS.xs, color: C.muted, padding: 6, textAlign: "center" }}>{asset.fileName}</div>
              )}
              {videoSummary && (
                <span style={{
                  position: "absolute", left: 4, bottom: 4, fontSize: 9, fontWeight: 800, color: "#fff",
                  background: videoSummary.status === "keyframes" ? "rgba(21,88,85,.85)" : "rgba(90,116,112,.85)",
                  borderRadius: R.full, padding: "2px 6px",
                }}>
                  {VIDEO_STATUS_LABEL[videoSummary.status]}
                </span>
              )}
              <button type="button" onClick={() => removeAsset(asset.id)} style={{
                position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%", border: "none",
                background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 12, cursor: "pointer", lineHeight: 1,
              }}>×</button>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── 메인 위저드 ─────────────────────────── */

type ClientLookup = { id: string; hospital_name: string; specialty?: string; address?: string; website_url?: string; naver_place_url?: string; instagram_url?: string; contact_name?: string };

type HistoryItem = { id: string; hospital_name: string; specialty: string; status: DiagnosisProgressStatus; created_at: string; updated_at: string };

export default function HospitalBrandImageDiagnosisPage() {
  const [screen, setScreen] = useState<"landing" | "wizard">("landing");
  const [step, setStep] = useState(1);
  const [maxReached, setMaxReached] = useState(1);
  const [diagnosisId, setDiagnosisId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [saving, setSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // STEP1
  const [hospitalName, setHospitalName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [region, setRegion] = useState("");
  const [primaryTreatments, setPrimaryTreatments] = useState<string[]>([]);
  const [targetPatients, setTargetPatients] = useState<string[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientMode, setClientMode] = useState<"choose" | "pcrm" | "manual">("choose");
  const [clientQuery, setClientQuery] = useState("");
  const [clientResults, setClientResults] = useState<ClientLookup[]>([]);
  const [prefillUrls, setPrefillUrls] = useState<Partial<Record<DiagnosisChannel, string>>>({});

  // STEP2
  const [desiredImages, setDesiredImages] = useState<string[]>([]);
  const [coreStrengths, setCoreStrengths] = useState<string[]>([]);
  const [currentConcerns, setCurrentConcerns] = useState<string[]>([]);

  // STEP3
  const [selectedChannels, setSelectedChannels] = useState<Record<DiagnosisChannel, boolean>>({
    website: false, naver_place: false, naver_blog: false, instagram: false, youtube: false, other: false,
  });
  const [channelUrls, setChannelUrls] = useState<Partial<Record<DiagnosisChannel, string>>>({});

  // STEP4/5 shared
  const [sources, setSources] = useState<DiagnosisSource[]>([]);
  const [assets, setAssets] = useState<LocalAsset[]>([]);
  const [consent, setConsent] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [analyzingVisual, setAnalyzingVisual] = useState(false);

  // STEP6/7
  const [channelResults, setChannelResults] = useState<ChannelDiagnosisResult[]>([]);
  const [compiling, setCompiling] = useState(false);
  const [report, setReport] = useState<HospitalBrandDiagnosisReport | null>(null);

  const activeChannels = useMemo(() => CHANNEL_LIST.filter((c) => selectedChannels[c]), [selectedChannels]);

  const loadHistory = () => {
    setLoadingHistory(true);
    fetch("/api/hospital-brand-diagnosis/create", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => setHistory(json?.ok ? json.diagnoses : []))
      .catch(() => setHistory([]))
      .finally(() => setLoadingHistory(false));
  };

  useEffect(() => { if (screen === "landing") loadHistory(); }, [screen]);

  useEffect(() => {
    if (clientMode !== "pcrm" || clientQuery.trim().length < 1) { setClientResults([]); return; }
    const timer = setTimeout(() => {
      fetch(`/api/clients?q=${encodeURIComponent(clientQuery.trim())}`)
        .then((r) => r.json())
        .then((json) => setClientResults(json?.ok ? (json.clients ?? []).slice(0, 8) : []))
        .catch(() => setClientResults([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [clientQuery, clientMode]);

  const pickClient = (c: ClientLookup) => {
    setClientId(c.id);
    setHospitalName(c.hospital_name || "");
    setSpecialty(c.specialty || "");
    setRegion(c.address || "");
    setPrefillUrls({
      website: c.website_url || undefined,
      naver_place: c.naver_place_url || undefined,
      instagram: c.instagram_url || undefined,
    });
    setClientResults([]);
    setClientQuery(c.hospital_name || "");
  };

  const startWizard = (existingId?: string) => {
    setGlobalError("");
    if (existingId) {
      resumeDiagnosis(existingId);
    } else {
      setScreen("wizard");
      setStep(1);
      setMaxReached(1);
    }
  };

  const resumeDiagnosis = async (id: string) => {
    try {
      const res = await fetch(`/api/hospital-brand-diagnosis/${id}`);
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "불러오기 실패");
      const d = body.diagnosis;
      const profile = d.profile_json || {};
      setDiagnosisId(id);
      setHospitalName(profile.hospitalName || d.hospital_name || "");
      setSpecialty(profile.specialty || d.specialty || "");
      setRegion(profile.region || d.region || "");
      setPrimaryTreatments(profile.primaryTreatments || []);
      setTargetPatients(profile.targetPatients || []);
      setDesiredImages(profile.desiredImages || []);
      setCoreStrengths(profile.coreStrengths || []);
      setCurrentConcerns(profile.currentConcerns || []);
      setClientId(d.client_id || null);

      const nextSelected: Record<DiagnosisChannel, boolean> = {
        website: false, naver_place: false, naver_blog: false, instagram: false, youtube: false, other: false,
      };
      const nextUrls: Partial<Record<DiagnosisChannel, string>> = {};
      for (const s of body.sources || []) {
        nextSelected[s.channel as DiagnosisChannel] = true;
        if (s.url) nextUrls[s.channel as DiagnosisChannel] = s.url;
      }
      setSelectedChannels(nextSelected);
      setChannelUrls(nextUrls);
      setSources((body.sources || []).map((s: any) => ({
        id: s.id, channel: s.channel, url: s.url, collectionMethod: s.collection_method,
        status: s.status, evidenceCount: s.evidence_count, collectedAt: s.collected_at, limitations: s.limitations_json || [],
      })));
      setAssets((body.assets || []).map((a: any) => ({
        id: a.id, channel: a.channel, category: a.category, fileName: a.file_name, storagePath: a.storage_path,
        mimeType: a.mime_type, fileSize: a.file_size, consent: a.consent, analysisJson: a.analysis_json,
      })));
      setChannelResults((body.channelResults || []).map((r: any) => ({
        channel: r.channel, summary: r.summary, scores: r.scores_json, strengths: r.strengths_json,
        missingInformation: r.missing_information_json, immediateActions: r.immediate_actions_json,
        reusableAssets: r.reusable_assets_json, unavailableChecks: r.unavailable_checks_json, evidenceIds: [],
      })));
      if (d.report_json) setReport(d.report_json);

      const statusStepMap: Record<DiagnosisProgressStatus, number> = {
        draft: 3, collecting: 4, waiting_manual_upload: 4, analyzing: 6, completed: 7, failed: 4,
      };
      const targetStep = d.report_json ? 7 : (statusStepMap[d.status as DiagnosisProgressStatus] ?? 1);
      setScreen("wizard");
      setStep(targetStep);
      setMaxReached(targetStep);
    } catch (e) {
      setGlobalError(e instanceof Error ? e.message : "불러오기 실패");
    }
  };

  const goToStep = (n: number) => {
    setStep(n);
    setMaxReached((m) => Math.max(m, n));
  };

  /* STEP1 → STEP2: 진단 세션 생성 */
  const submitStep1 = async () => {
    if (!hospitalName.trim() || !specialty.trim()) { setGlobalError("병원명과 진료과를 입력해주세요."); return; }
    setSaving(true); setGlobalError("");
    try {
      const res = await fetch("/api/hospital-brand-diagnosis/create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hospitalName, specialty, region, primaryTreatments, targetPatients, desiredImages: [], coreStrengths: [], currentConcerns: [], clientId }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "진단 생성 실패");
      setDiagnosisId(body.id);
      if (prefillUrls.website || prefillUrls.naver_place || prefillUrls.instagram) {
        setSelectedChannels((prev) => ({
          ...prev,
          website: prev.website || Boolean(prefillUrls.website),
          naver_place: prev.naver_place || Boolean(prefillUrls.naver_place),
          instagram: prev.instagram || Boolean(prefillUrls.instagram),
        }));
        setChannelUrls((prev) => ({ ...prev, ...prefillUrls }));
      }
      goToStep(2);
    } catch (e) {
      setGlobalError(e instanceof Error ? e.message : "진단 생성 실패");
    } finally {
      setSaving(false);
    }
  };

  /* STEP2 → STEP3: 브랜드 목표 저장 */
  const submitStep2 = async () => {
    if (!diagnosisId) return;
    setSaving(true); setGlobalError("");
    try {
      const res = await fetch(`/api/hospital-brand-diagnosis/${diagnosisId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profilePatch: { desiredImages, coreStrengths, currentConcerns } }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "저장 실패");
      goToStep(3);
    } catch (e) {
      setGlobalError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  /* STEP3 → STEP4: 채널 선택 저장 + 자동 수집 시작 */
  const submitStep3 = async () => {
    if (!diagnosisId) return;
    if (activeChannels.length === 0) { setGlobalError("최소 한 개 이상의 채널을 선택해주세요."); return; }
    setSaving(true); setGlobalError("");
    try {
      const channels = activeChannels.map((channel) => ({ channel, url: channelUrls[channel] || "" }));
      const res = await fetch(`/api/hospital-brand-diagnosis/${diagnosisId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels, status: "collecting" }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "채널 저장 실패");
      setSources(channels.map((c) => ({ id: uuid(), channel: c.channel, url: c.url || undefined, collectionMethod: c.url ? "html" : "uploaded_image", status: "pending", evidenceCount: 0, limitations: [] })));
      goToStep(4);
      void runCollect(diagnosisId);
    } catch (e) {
      setGlobalError(e instanceof Error ? e.message : "채널 저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const runCollect = async (id: string) => {
    setCollecting(true); setGlobalError("");
    try {
      const res = await fetch("/api/hospital-brand-diagnosis/collect", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ diagnosisId: id }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "자료 수집 실패");
      const refreshed = await fetch(`/api/hospital-brand-diagnosis/${id}`).then((r) => r.json());
      if (refreshed?.ok) {
        setSources((refreshed.sources || []).map((s: any) => ({
          id: s.id, channel: s.channel, url: s.url, collectionMethod: s.collection_method,
          status: s.status, evidenceCount: s.evidence_count, collectedAt: s.collected_at, limitations: s.limitations_json || [],
        })));
      }
    } catch (e) {
      setGlobalError(e instanceof Error ? e.message : "자료 수집 실패");
    } finally {
      setCollecting(false);
    }
  };

  const runAnalyzeVisual = async () => {
    if (!diagnosisId) return;
    setAnalyzingVisual(true); setGlobalError("");
    try {
      const res = await fetch("/api/hospital-brand-diagnosis/analyze-visual", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ diagnosisId }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "이미지 분석 실패");
      const refreshed = await fetch(`/api/hospital-brand-diagnosis/${diagnosisId}`).then((r) => r.json());
      if (refreshed?.ok) {
        setAssets((prev) => {
          const previewByPath = new Map(prev.map((a) => [a.storagePath, a.previewUrl]));
          return (refreshed.assets || []).map((a: any) => ({
            id: a.id, channel: a.channel, category: a.category, fileName: a.file_name, storagePath: a.storage_path,
            mimeType: a.mime_type, fileSize: a.file_size, consent: a.consent, analysisJson: a.analysis_json,
            previewUrl: previewByPath.get(a.storage_path),
          }));
        });
      }
      goToStep(6);
    } catch (e) {
      setGlobalError(e instanceof Error ? e.message : "이미지 분석 실패");
    } finally {
      setAnalyzingVisual(false);
    }
  };

  const runCompile = async () => {
    if (!diagnosisId) return;
    setCompiling(true); setGlobalError("");
    try {
      // 채널 하나가 실패해도 즉시 중단하지 않고 나머지 채널은 계속 시도한다(섹션 9-2/조건13).
      // 실패한 채널은 analyze-channel API가 이미 "분석 오류" 상태로 DB에 남기므로,
      // 여기서는 실패 목록만 모아뒀다가 통합 진단 이후 사용자에게 명확히 안내한다.
      const failedLabels: string[] = [];
      for (const channel of activeChannels) {
        try {
          const res = await fetch("/api/hospital-brand-diagnosis/analyze-channel", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ diagnosisId, channel }),
          });
          const body = await res.json();
          if (!res.ok || !body.ok) throw new Error(body.error || `${HBD_CHANNEL_LABEL[channel]} 분석 실패`);
          if (body.hasErrors) failedLabels.push(HBD_CHANNEL_LABEL[channel]);
        } catch (channelError) {
          console.error(`[HospitalBrandDiagnosis] ${channel} 채널 분석 실패`, channelError);
          failedLabels.push(HBD_CHANNEL_LABEL[channel]);
        }
      }
      if (failedLabels.length > 0) {
        setGlobalError(`${failedLabels.join(", ")} 채널은 분석 중 오류가 발생했습니다. 나머지 채널 결과로 통합 진단을 계속 진행합니다 — 실패한 채널은 STEP4에서 다시 시도할 수 있습니다.`);
      }
      const refreshedResults = await fetch(`/api/hospital-brand-diagnosis/${diagnosisId}`).then((r) => r.json());
      if (refreshedResults?.ok) {
        setChannelResults((refreshedResults.channelResults || []).map((r: any) => ({
          channel: r.channel, summary: r.summary, scores: r.scores_json, strengths: r.strengths_json,
          missingInformation: r.missing_information_json, immediateActions: r.immediate_actions_json,
          reusableAssets: r.reusable_assets_json, unavailableChecks: r.unavailable_checks_json, evidenceIds: [],
        })));
      }
      const compileRes = await fetch("/api/hospital-brand-diagnosis/compile", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ diagnosisId }),
      });
      const compileBody = await compileRes.json();
      if (!compileRes.ok || !compileBody.ok) throw new Error(compileBody.error || "통합 리포트 생성 실패");
      setReport(compileBody.report);
      goToStep(7);
    } catch (e) {
      setGlobalError(e instanceof Error ? e.message : "통합 진단 실패");
    } finally {
      setCompiling(false);
    }
  };

  const resetWizard = () => {
    setScreen("landing"); setStep(1); setMaxReached(1); setDiagnosisId(null);
    setHospitalName(""); setSpecialty(""); setRegion(""); setPrimaryTreatments([]); setTargetPatients([]);
    setClientId(null); setClientMode("choose"); setClientQuery(""); setClientResults([]); setPrefillUrls({});
    setDesiredImages([]); setCoreStrengths([]); setCurrentConcerns([]);
    setSelectedChannels({ website: false, naver_place: false, naver_blog: false, instagram: false, youtube: false, other: false });
    setChannelUrls({}); setSources([]); setAssets([]); setConsent(false); setChannelResults([]); setReport(null);
    setGlobalError("");
  };

  /* ─────────────────────────── 렌더 ─────────────────────────── */

  if (screen === "landing") {
    return (
      <main style={{ minHeight: "100vh", background: "var(--mesh-bg)" }}>
        <PageHeader title="병원브랜드이미지 진단" />
        <div className="oa-page" style={{ maxWidth: 720, margin: "0 auto", padding: `60px 20px 80px`, textAlign: "center" }}>
          <h1 style={{ fontSize: FS.xxl, fontWeight: 900, color: C.ink, margin: "0 0 14px" }}>병원브랜드이미지 진단</h1>
          <p style={{ fontSize: FS.lg, color: C.ink, lineHeight: 1.7, margin: "0 0 6px" }}>
            사진만 평가하지 않습니다.<br />
            홈페이지, 플레이스, 블로그, 인스타그램에서 환자에게 어떤 병원으로 보이고 있는지를 함께 분석합니다.
          </p>
          <p style={{ fontSize: FS.sm, color: C.muted, lineHeight: 1.7, margin: "12px 0 32px" }}>
            새로운 촬영이나 제작을 권하지 않습니다.<br />
            현재 보유한 채널과 콘텐츠를 더 효과적으로 활용할 수 있는 정보를 제공합니다.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            <button onClick={() => startWizard()} style={primaryBtn}>진단 시작하기</button>
          </div>

          {globalError && <p style={{ color: C.danger, marginTop: 20 }}>{globalError}</p>}

          <div style={{ marginTop: 48, textAlign: "left" }}>
            <h2 style={{ fontSize: FS.lg, fontWeight: 900, color: C.ink, marginBottom: 12 }}>이전 진단 불러오기</h2>
            {loadingHistory ? (
              <p style={{ color: C.muted, textAlign: "center" }}>불러오는 중…</p>
            ) : history.length === 0 ? (
              <div style={{ ...cardStyle, textAlign: "center", color: C.muted }}>아직 진행한 진단이 없어요.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {history.map((h) => (
                  <button key={h.id} onClick={() => startWizard(h.id)} style={{
                    ...cardStyle, padding: 14, textAlign: "left", cursor: "pointer", display: "flex",
                    alignItems: "center", justifyContent: "space-between", gap: 10,
                  }}>
                    <div>
                      <strong style={{ fontSize: FS.md, color: C.ink }}>{h.hospital_name || "병원명 미입력"}</strong>
                      <div style={{ fontSize: FS.xs, color: C.muted, marginTop: 2 }}>{h.specialty} · {new Date(h.updated_at).toLocaleDateString("ko-KR")}</div>
                    </div>
                    <span style={{
                      fontSize: FS.xs, fontWeight: 800, padding: "4px 10px", borderRadius: R.full,
                      background: h.status === "completed" ? C.mint : C.bg,
                      color: h.status === "completed" ? C.teal : C.muted,
                    }}>
                      {h.status === "completed" ? "결과 보기" : "이어서 진행"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--mesh-bg)" }}>
      <PageHeader title="병원브랜드이미지 진단" />
      <div className="oa-page" style={{ maxWidth: 820, margin: "0 auto", padding: `${SP.lg}px 20px 80px` }}>
        <StepIndicator current={step} maxReached={maxReached} isMobile={isMobile} />
        {globalError && (
          <div style={{ background: "#FFF0F0", border: `1px solid ${C.danger}`, borderRadius: R.md, padding: 12, marginBottom: 16, color: C.danger, fontSize: FS.sm }}>
            {globalError}
          </div>
        )}

        {step === 1 && (
          <div style={{ ...cardStyle, display: "grid", gap: 16 }}>
            <h2 style={{ margin: 0, fontSize: FS.xl, fontWeight: 900, color: C.ink }}>STEP 1. 병원 기본 정보</h2>

            {clientMode === "choose" && (
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setClientMode("pcrm")} style={{ ...secondaryBtn, flex: 1 }}>PCRM 고객 불러오기</button>
                <button onClick={() => setClientMode("manual")} style={{ ...primaryBtn, flex: 1 }}>새 병원 직접 입력</button>
              </div>
            )}

            {clientMode === "pcrm" && (
              <div style={{ display: "grid", gap: 8 }}>
                <input value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} placeholder="병원명으로 검색" style={inputStyle} />
                {clientResults.length > 0 && (
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: R.sm, overflow: "hidden" }}>
                    {clientResults.map((c) => (
                      <button key={c.id} onClick={() => pickClient(c)} style={{
                        display: "block", width: "100%", textAlign: "left", padding: "10px 14px", border: "none",
                        borderBottom: `1px solid ${C.border}`, background: C.white, cursor: "pointer", fontSize: FS.sm, color: C.ink,
                      }}>{c.hospital_name}</button>
                    ))}
                  </div>
                )}
                <button onClick={() => setClientMode("choose")} style={{ ...secondaryBtn, height: 34, fontSize: FS.xs, width: "fit-content" }}>다른 방법으로 입력</button>
              </div>
            )}

            {(clientMode === "manual" || hospitalName) && (
              <div style={{ display: "grid", gap: 12 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={labelStyle}>병원명 *</span>
                  <input value={hospitalName} onChange={(e) => setHospitalName(e.target.value)} style={inputStyle} />
                </label>
                <div className="hbd-two-col-grid">
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={labelStyle}>진료과 *</span>
                    <input value={specialty} onChange={(e) => setSpecialty(e.target.value)} style={inputStyle} />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={labelStyle}>지역</span>
                    <input value={region} onChange={(e) => setRegion(e.target.value)} style={inputStyle} />
                  </label>
                </div>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={labelStyle}>주요 진료 분야</span>
                  <ChipMultiSelect presets={[]} value={primaryTreatments} onChange={setPrimaryTreatments} placeholder="예: 임플란트, 관절 (Enter로 추가)" />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={labelStyle}>주요 환자층 (선택)</span>
                  <ChipMultiSelect presets={[]} value={targetPatients} onChange={setTargetPatients} placeholder="예: 40대 이상 여성 (Enter로 추가)" />
                </label>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={submitStep1} disabled={saving || !hospitalName || !specialty} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>
                {saving ? "저장 중…" : "다음"}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ ...cardStyle, display: "grid", gap: 22 }}>
            <h2 style={{ margin: 0, fontSize: FS.xl, fontWeight: 900, color: C.ink }}>STEP 2. 브랜드 이미지 목표</h2>
            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ ...labelStyle, fontSize: FS.md, color: C.ink }}>환자에게 어떤 병원으로 기억되고 싶나요?</span>
              <ChipMultiSelect presets={DESIRED_IMAGE_PRESETS} value={desiredImages} onChange={setDesiredImages} placeholder="기타 직접 입력" />
            </label>
            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ ...labelStyle, fontSize: FS.md, color: C.ink }}>우리 병원의 가장 중요한 강점은 무엇인가요?</span>
              <ChipMultiSelect presets={CORE_STRENGTH_PRESETS} value={coreStrengths} onChange={setCoreStrengths} placeholder="기타 직접 입력" />
            </label>
            <label style={{ display: "grid", gap: 8 }}>
              <span style={{ ...labelStyle, fontSize: FS.md, color: C.ink }}>현재 온라인 채널에서 가장 고민되는 점은 무엇인가요?</span>
              <ChipMultiSelect presets={CURRENT_CONCERN_PRESETS} value={currentConcerns} onChange={setCurrentConcerns} placeholder="기타 직접 입력" />
            </label>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <button onClick={() => goToStep(1)} style={secondaryBtn}>이전</button>
              <button onClick={submitStep2} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>{saving ? "저장 중…" : "다음"}</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ ...cardStyle, display: "grid", gap: 16 }}>
            <h2 style={{ margin: 0, fontSize: FS.xl, fontWeight: 900, color: C.ink }}>STEP 3. 운영 채널 선택</h2>
            <p style={{ margin: 0, fontSize: FS.sm, color: C.muted }}>분석할 채널을 선택하고 URL을 입력해주세요. 최소 1개 이상 선택해야 합니다.</p>
            <div style={{ display: "grid", gap: 10 }}>
              {CHANNEL_LIST.map((channel) => (
                <div key={channel} style={{ border: `1px solid ${selectedChannels[channel] ? C.teal : C.border}`, borderRadius: R.md, padding: 14 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                    <input type="checkbox" checked={selectedChannels[channel]}
                      onChange={(e) => setSelectedChannels((prev) => ({ ...prev, [channel]: e.target.checked }))} />
                    <span style={{ fontWeight: 800, color: C.ink, fontSize: FS.md }}>{HBD_CHANNEL_LABEL[channel]}</span>
                  </label>
                  {selectedChannels[channel] && (
                    <input value={channelUrls[channel] || ""} onChange={(e) => setChannelUrls((prev) => ({ ...prev, [channel]: e.target.value }))}
                      placeholder={channel === "other" ? "채널 URL (선택)" : "URL을 입력하면 자동 분석을 시도합니다 (없으면 자료 업로드로 진행 가능)"}
                      style={{ ...inputStyle, marginTop: 10 }} />
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <button onClick={() => goToStep(2)} style={secondaryBtn}>이전</button>
              <button onClick={submitStep3} disabled={saving || activeChannels.length === 0} style={{ ...primaryBtn, opacity: saving || activeChannels.length === 0 ? 0.6 : 1 }}>
                {saving ? "저장 중…" : "다음"}
              </button>
            </div>
          </div>
        )}

        {step === 4 && diagnosisId && (
          <div style={{ ...cardStyle, display: "grid", gap: 18 }}>
            <h2 style={{ margin: 0, fontSize: FS.xl, fontWeight: 900, color: C.ink }}>STEP 4. 채널 자료 수집</h2>

            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, background: C.bg, borderRadius: R.md, padding: 12, cursor: "pointer" }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
              <span style={{ fontSize: FS.xs, color: C.muted, lineHeight: 1.6 }}>
                분석을 위해 업로드한 사진과 영상을 일시적으로 저장하고 AI 분석에 사용하는 것에 동의합니다.
                환자 얼굴이나 개인정보가 포함된 자료는 업로드 전 필요한 권리를 확인해주세요. 동의하지 않으면 URL 자동 분석 결과만으로 진행할 수 있습니다.
              </span>
            </label>

            {collecting && <p style={{ color: C.muted, fontSize: FS.sm }}>선택한 채널을 자동으로 수집하는 중입니다…</p>}

            <div style={{ display: "grid", gap: 14 }}>
              {activeChannels.map((channel) => {
                const source = sources.find((s) => s.channel === channel);
                const status = source?.status ?? "pending";
                const needsUpload = status === "manual_required" || status === "partial" || status === "failed" || !channelUrls[channel];
                const channelAssets = assets.filter((a) => a.channel === channel);
                return (
                  <div key={channel} style={{ border: `1px solid ${C.border}`, borderRadius: R.md, padding: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: needsUpload ? 10 : 0 }}>
                      <strong style={{ fontSize: FS.md, color: C.ink }}>{HBD_CHANNEL_LABEL[channel]}</strong>
                      <span style={{ fontSize: FS.xs, fontWeight: 800, color: "#fff", background: SOURCE_STATUS_COLOR[status], borderRadius: R.full, padding: "3px 10px" }}>
                        {SOURCE_STATUS_LABEL[status]}
                      </span>
                    </div>
                    {source?.limitations && source.limitations.length > 0 && (
                      <p style={{ margin: "0 0 10px", fontSize: FS.xs, color: C.muted, lineHeight: 1.6 }}>{source.limitations.join(" ")}</p>
                    )}
                    {needsUpload && (
                      <AssetUploadZone
                        diagnosisId={diagnosisId} channel={channel} consent={consent} assets={channelAssets}
                        onUploaded={(a) => setAssets((prev) => [...prev, a])}
                        onDeleted={(id) => setAssets((prev) => prev.filter((a) => a.id !== id))}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <button onClick={() => goToStep(3)} style={secondaryBtn}>이전</button>
              <button onClick={() => goToStep(5)} disabled={collecting} style={{ ...primaryBtn, opacity: collecting ? 0.6 : 1 }}>다음</button>
            </div>
          </div>
        )}

        {step === 5 && diagnosisId && (
          <div style={{ ...cardStyle, display: "grid", gap: 16 }}>
            <h2 style={{ margin: 0, fontSize: FS.xl, fontWeight: 900, color: C.ink }}>STEP 5. 사진·영상·화면 분석</h2>
            <p style={{ margin: 0, fontSize: FS.sm, color: C.muted }}>업로드한 자료를 AI가 분류하고, 채널 안에서 어떤 정보를 전달하고 있는지 분석합니다.</p>

            {assets.length === 0 ? (
              <div style={{ background: C.bg, borderRadius: R.md, padding: 16, color: C.muted, fontSize: FS.sm, textAlign: "center" }}>
                업로드된 자료가 없습니다. 자동 분석만으로 진행됩니다.
              </div>
            ) : (
              <button onClick={runAnalyzeVisual} disabled={analyzingVisual} style={{ ...primaryBtn, opacity: analyzingVisual ? 0.6 : 1 }}>
                {analyzingVisual ? "분석 중…" : "업로드 자료 분석 시작"}
              </button>
            )}

            {assets.length > 0 && (
              <div style={{ display: "grid", gap: 10 }}>
                {assets.map((asset) => (
                  <div key={asset.id} style={{ display: "flex", gap: 12, border: `1px solid ${C.border}`, borderRadius: R.md, padding: 12 }}>
                    <div style={{ width: 64, height: 64, borderRadius: R.sm, overflow: "hidden", flexShrink: 0, background: C.bg }}>
                      {asset.previewUrl && <img src={asset.previewUrl} alt={asset.fileName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: FS.sm, fontWeight: 700, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{asset.fileName}</span>
                        <select value={asset.category || asset.analysisJson?.category || "other"} onChange={async (e) => {
                          const category = e.target.value as VisualCategory;
                          setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, category } : a)));
                          await fetch("/api/hospital-brand-diagnosis/upload", {
                            method: "PATCH", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ assetId: asset.id, category }),
                          }).catch(() => {});
                        }} style={{ height: 26, fontSize: FS.xs, borderRadius: R.xs, border: `1px solid ${C.border}` }}>
                          {Object.entries(HBD_VISUAL_CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </div>
                      {asset.analysisJson?.analysisNote && (
                        <p style={{ margin: "6px 0 0", fontSize: FS.xs, color: C.muted, lineHeight: 1.5 }}>{asset.analysisJson.analysisNote}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <button onClick={() => goToStep(4)} style={secondaryBtn}>이전</button>
              <button onClick={() => goToStep(6)} style={primaryBtn}>다음</button>
            </div>
          </div>
        )}

        {step === 6 && diagnosisId && (
          <div style={{ ...cardStyle, display: "grid", gap: 16 }}>
            <h2 style={{ margin: 0, fontSize: FS.xl, fontWeight: 900, color: C.ink }}>STEP 6. 분석 확인 및 통합 진단</h2>
            <p style={{ margin: 0, fontSize: FS.sm, color: C.muted }}>
              선택한 {activeChannels.length}개 채널({activeChannels.map((c) => HBD_CHANNEL_LABEL[c]).join(", ")})을 각각 진단한 뒤 채널 간 통합 진단을 생성합니다.
            </p>
            <button onClick={runCompile} disabled={compiling} style={{ ...primaryBtn, opacity: compiling ? 0.6 : 1 }}>
              {compiling ? "통합 진단 생성 중… (최대 1분 소요)" : "통합 진단 시작"}
            </button>
            {channelResults.length > 0 && (
              <div style={{ display: "grid", gap: 8 }}>
                {channelResults.map((r) => (
                  <div key={r.channel} style={{ fontSize: FS.sm, color: C.ink, background: C.bg, borderRadius: R.sm, padding: 10 }}>
                    <strong>{HBD_CHANNEL_LABEL[r.channel]}</strong> — {r.summary}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <button onClick={() => goToStep(5)} style={secondaryBtn}>이전</button>
              {report && <button onClick={() => goToStep(7)} style={primaryBtn}>결과 보기</button>}
            </div>
          </div>
        )}

        {step === 7 && report && (
          <ReportView report={report} onRestart={resetWizard} onBackToStep={goToStep} diagnosisId={diagnosisId} />
        )}
      </div>
    </main>
  );
}

/* ─────────────────────────── STEP 7: 결과 리포트 ─────────────────────────── */

const SCORE_LABEL: Record<keyof ChannelScores, string> = {
  informationClarity: "정보 전달력", visualUtilization: "비주얼 활용도", brandConsistency: "브랜드 일관성",
  channelSuitability: "채널 적합성", technicalReadiness: "기술 준비도",
};

const ANALYSIS_METHOD_LABEL: Record<SourceStatus, string> = {
  pending: "확인 불가", collecting: "확인 불가", complete: "정밀 분석",
  partial: "부분 분석", failed: "확인 불가", manual_required: "업로드 자료 기반 분석",
};
const ANALYSIS_METHOD_DESC: Record<SourceStatus, string> = {
  pending: "이 채널은 아직 자료를 수집하지 않았습니다.",
  collecting: "이 채널은 아직 자료를 수집하지 않았습니다.",
  complete: "페이지 본문, 제목, 이미지, ALT 텍스트 및 구조 정보를 확인했습니다.",
  partial: "자동 수집된 정보가 제한적이라 일부만 확인했습니다.",
  failed: "자동 수집과 업로드 자료가 모두 없어 분석하지 못했습니다.",
  manual_required: "자동 수집이 제한되어 업로드한 화면·이미지를 기준으로 분석했습니다.",
};
const ANALYSIS_METHOD_COLOR: Record<SourceStatus, string> = {
  pending: C.hint, collecting: C.hint, complete: C.success, partial: C.gold, failed: C.hint, manual_required: C.orange,
};

const CONFIDENCE_LABEL: Record<string, string> = { high: "신뢰도 높음", medium: "신뢰도 보통", low: "제한된 자료 기반" };
const CONFIDENCE_COLOR: Record<string, string> = { high: C.success, medium: C.gold, low: C.hint };
const SOURCE_TYPE_LABEL: Record<string, string> = {
  html: "페이지 HTML", api: "API 데이터", browser: "브라우저 수집", screenshot: "화면 캡처",
  uploaded_image: "업로드 이미지", uploaded_video: "업로드 영상",
};

function EvidencePanel({ channel, evidence, diagnosisId, onClose }: {
  channel: DiagnosisChannel; evidence: import("@/lib/hospitalBrandDiagnosis/types").EvidenceItem[];
  diagnosisId: string | null; onClose: () => void;
}) {
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!diagnosisId) return;
    const imageIds = evidence
      .filter((e) => (e.sourceType === "uploaded_image" || e.sourceType === "screenshot") && e.sourceId)
      .map((e) => e.sourceId!);
    if (imageIds.length === 0) return;
    fetch("/api/hospital-brand-diagnosis/asset-url", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diagnosisId, assetIds: imageIds }),
    })
      .then((r) => r.json())
      .then((body) => { if (body.ok) setSignedUrls(body.urls || {}); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagnosisId, channel]);

  return (
    <div className="hbd-print-hide" style={{ position: "fixed", inset: 0, zIndex: 200, display: "grid", placeItems: "center", background: "rgba(13,37,35,.5)", padding: 20 }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ width: "min(640px, 100%)", maxHeight: "calc(100vh - 48px)", overflowY: "auto", borderRadius: R.lg, background: C.white, padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: FS.lg, fontWeight: 900, color: C.ink }}>{HBD_CHANNEL_LABEL[channel]} — 근거 자료</h3>
          <button onClick={onClose} style={{ width: 32, height: 32, border: `1px solid ${C.border}`, borderRadius: R.sm, background: "#fff", color: C.muted, fontSize: 18, cursor: "pointer" }}>×</button>
        </div>
        {evidence.length === 0 ? (
          <p style={{ color: C.muted, fontSize: FS.sm }}>이 채널에 연결된 근거 자료가 없습니다.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {evidence.map((e) => (
              <div key={e.id} style={{ border: `1px solid ${C.border}`, borderRadius: R.md, padding: 12, display: "grid", gap: 8 }}>
                <p style={{ margin: 0, fontSize: FS.sm, color: C.ink, lineHeight: 1.6 }}>{e.statement}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: FS.xs, fontWeight: 800, color: "#fff", background: C.teal, borderRadius: R.full, padding: "2px 9px" }}>
                    {SOURCE_TYPE_LABEL[e.sourceType] || e.sourceType}
                  </span>
                  <span style={{ fontSize: FS.xs, fontWeight: 800, color: "#fff", background: CONFIDENCE_COLOR[e.confidence], borderRadius: R.full, padding: "2px 9px" }}>
                    {CONFIDENCE_LABEL[e.confidence] || e.confidence}
                  </span>
                  {e.reference && (
                    <a href={e.reference} target="_blank" rel="noreferrer" style={{ fontSize: FS.xs, color: C.teal, fontWeight: 700, wordBreak: "break-all" }}>
                      {e.reference}
                    </a>
                  )}
                </div>
                {e.sourceId && signedUrls[e.sourceId] && (
                  <img src={signedUrls[e.sourceId]} alt="근거 이미지" style={{ maxWidth: "100%", maxHeight: 220, objectFit: "contain", borderRadius: R.sm, border: `1px solid ${C.border}` }} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReportView({ report, onRestart, onBackToStep, diagnosisId }: {
  report: HospitalBrandDiagnosisReport; onRestart: () => void; onBackToStep: (n: number) => void; diagnosisId: string | null;
}) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [pdfSuccess, setPdfSuccess] = useState(false);
  const [evidenceChannel, setEvidenceChannel] = useState<DiagnosisChannel | null>(null);

  const downloadPdf = async () => {
    if (!reportRef.current || downloading) return;
    setDownloading(true);
    setPdfError("");
    setPdfSuccess(false);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
      const canvas = await html2canvas(reportRef.current, { scale: 1.5, backgroundColor: "#ffffff", useCORS: true, logging: false });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      const pageWidth = 210, pageHeight = 297;
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight, position = 0;
      const image = canvas.toDataURL("image/png");
      pdf.addImage(image, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(image, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      pdf.save(`${report.profile.hospitalName || "병원"}_브랜드이미지진단_${new Date().toISOString().slice(0, 10)}.pdf`);
      setPdfSuccess(true);
      window.setTimeout(() => setPdfSuccess(false), 3000);
    } catch (error) {
      console.error("[HospitalBrandDiagnosis] PDF generation failed", error);
      setPdfError("PDF 생성에 실패했습니다. 잠시 후 다시 시도하거나 브라우저 인쇄 기능을 사용해 주세요.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="hbd-print-hide" style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={downloadPdf} disabled={downloading} style={{ ...secondaryBtn, opacity: downloading ? 0.6 : 1 }}>{downloading ? "PDF 생성 중…" : "PDF 다운로드"}</button>
        <button onClick={() => window.print()} style={secondaryBtn}>브라우저 인쇄로 저장</button>
        <button onClick={() => onBackToStep(4)} style={secondaryBtn}>분석 자료 다시 확인</button>
        <button onClick={() => onBackToStep(3)} style={secondaryBtn}>다른 채널 추가 분석</button>
        <button onClick={onRestart} style={primaryBtn}>재진단 시작</button>
      </div>

      {pdfError && (
        <div className="hbd-print-hide" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "#FFF0F0", border: `1px solid ${C.danger}`, borderRadius: R.md, padding: 12 }}>
          <span style={{ color: C.danger, fontSize: FS.sm }}>{pdfError}</span>
          <button onClick={downloadPdf} style={{ ...secondaryBtn, height: 34, padding: "0 14px", fontSize: FS.xs, flexShrink: 0 }}>다시 시도</button>
        </div>
      )}
      {pdfSuccess && (
        <div className="hbd-print-hide" style={{ background: C.mint, border: `1px solid ${C.success}`, borderRadius: R.md, padding: 12, color: C.success, fontSize: FS.sm, fontWeight: 700 }}>
          PDF 리포트가 생성되었습니다.
        </div>
      )}

      <div ref={reportRef} className="hbd-print-area" style={{ background: C.white, padding: 8, display: "grid", gap: 22 }}>
        {/* 1. 종합 요약 */}
        <section style={cardStyle}>
          <h2 style={{ margin: "0 0 10px", fontSize: FS.xl, fontWeight: 900, color: C.ink }}>{report.profile.hospitalName} 브랜드이미지 진단 결과</h2>
          <p style={{ margin: 0, fontSize: FS.md, color: C.ink, lineHeight: 1.7 }}>{report.overallSummary}</p>
        </section>

        {/* 2. 의도 vs 실제 */}
        <section style={cardStyle}>
          <h3 style={{ margin: "0 0 12px", fontSize: FS.lg, fontWeight: 900, color: C.ink }}>병원이 의도한 이미지와 실제 이미지</h3>
          <div className="hbd-two-col-grid">
            <div>
              <div style={{ fontSize: FS.xs, fontWeight: 800, color: C.teal, marginBottom: 6 }}>의도한 이미지</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: FS.sm, color: C.ink, lineHeight: 1.7 }}>
                {report.crossChannel.desiredVsActual.desiredImage.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
            <div>
              <div style={{ fontSize: FS.xs, fontWeight: 800, color: C.orange, marginBottom: 6 }}>실제 전달 이미지</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: FS.sm, color: C.ink, lineHeight: 1.7 }}>
                {report.crossChannel.desiredVsActual.actualImage.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          </div>
          {report.crossChannel.desiredVsActual.gaps.length > 0 && (
            <div style={{ marginTop: 12, background: C.bg, borderRadius: R.sm, padding: 10 }}>
              <div style={{ fontSize: FS.xs, fontWeight: 800, color: C.muted, marginBottom: 4 }}>차이가 있는 요소</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: FS.sm, color: C.ink, lineHeight: 1.6 }}>
                {report.crossChannel.desiredVsActual.gaps.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
        </section>

        {/* 3. 채널별 점수 */}
        <section style={cardStyle}>
          <h3 style={{ margin: "0 0 6px", fontSize: FS.lg, fontWeight: 900, color: C.ink }}>채널별 점수</h3>
          <p style={{ margin: "0 0 12px", fontSize: FS.xs, color: C.muted }}>점수는 절대 평가나 경쟁 병원 순위가 아니며, 동일 병원의 개선 전후를 비교하기 위한 내부 지표입니다.</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS.sm, minWidth: 480 }}>
              <thead>
                <tr style={{ background: C.bg, color: C.muted, textAlign: "left" }}>
                  <th style={{ padding: "8px 10px" }}>채널</th>
                  {(Object.keys(SCORE_LABEL) as (keyof ChannelScores)[]).map((k) => (
                    <th key={k} style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{SCORE_LABEL[k]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.channelResults.map((r) => (
                  <tr key={r.channel} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: "8px 10px", fontWeight: 800, color: C.ink }}>{HBD_CHANNEL_LABEL[r.channel]}</td>
                    {(Object.keys(SCORE_LABEL) as (keyof ChannelScores)[]).map((k) => (
                      <td key={k} style={{ padding: "8px 10px", color: C.ink }}>
                        {(r.scores as any)?.[k]?.value ?? <span style={{ color: C.hint }}>확인 불가</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 4. 잘하고 있는 점 */}
        <section style={cardStyle}>
          <h3 style={{ margin: "0 0 10px", fontSize: FS.lg, fontWeight: 900, color: C.success }}>잘하고 있는 점</h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: FS.sm, color: C.ink, lineHeight: 1.8 }}>
            {report.strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </section>

        {/* 5. 현재 놓치고 있는 정보 */}
        <section style={cardStyle}>
          <h3 style={{ margin: "0 0 10px", fontSize: FS.lg, fontWeight: 900, color: C.ink }}>현재 놓치고 있는 정보</h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: FS.sm, color: C.ink, lineHeight: 1.8 }}>
            {report.missingInformation.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </section>

        {/* 6. 바로 수정할 수 있는 항목 */}
        <section style={cardStyle}>
          <h3 style={{ margin: "0 0 10px", fontSize: FS.lg, fontWeight: 900, color: C.orange }}>바로 수정할 수 있는 항목</h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: FS.sm, color: C.ink, lineHeight: 1.8 }}>
            {report.immediateActions.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </section>

        {/* 7. 콘텐츠 재활용 지도 */}
        {report.reuseMap.length > 0 && (
          <section style={cardStyle}>
            <h3 style={{ margin: "0 0 10px", fontSize: FS.lg, fontWeight: 900, color: C.ink }}>콘텐츠 재활용 지도</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {report.reuseMap.map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: FS.sm, background: C.bg, borderRadius: R.sm, padding: 10 }}>
                  <span style={{ fontWeight: 800, color: C.ink }}>{item.assetDescription}</span>
                  <span style={{ color: C.hint }}>→</span>
                  <span style={{ color: C.teal, fontWeight: 700 }}>{item.recommendedChannels.map((c) => HBD_CHANNEL_LABEL[c]).join(", ")}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 8. 채널별 상세 */}
        <section style={cardStyle}>
          <h3 style={{ margin: "0 0 12px", fontSize: FS.lg, fontWeight: 900, color: C.ink }}>채널별 상세 결과</h3>
          <div style={{ display: "grid", gap: 14 }}>
            {report.channelResults.map((r) => {
              const source = report.sources.find((s) => s.channel === r.channel);
              const methodStatus = source?.status ?? "failed";
              return (
              <div key={r.channel} style={{ border: `1px solid ${C.border}`, borderRadius: R.md, padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <strong style={{ fontSize: FS.md, color: C.ink }}>{HBD_CHANNEL_LABEL[r.channel]}</strong>
                  <span
                    title={ANALYSIS_METHOD_DESC[methodStatus]}
                    style={{
                      fontSize: FS.xs, fontWeight: 800, color: "#fff", background: ANALYSIS_METHOD_COLOR[methodStatus],
                      borderRadius: R.full, padding: "2px 9px", cursor: "help",
                    }}
                  >{ANALYSIS_METHOD_LABEL[methodStatus]}</span>
                  <button
                    onClick={() => setEvidenceChannel(r.channel)}
                    style={{ marginLeft: "auto", height: 26, padding: "0 10px", borderRadius: R.full, border: `1px solid ${C.border}`, background: "#fff", color: C.teal, fontSize: FS.xs, fontWeight: 800, cursor: "pointer" }}
                  >근거 보기</button>
                </div>
                <p style={{ margin: "6px 0 10px", fontSize: FS.sm, color: C.ink, lineHeight: 1.6 }}>{r.summary}</p>
                {r.strengths.length > 0 && <p style={{ margin: "4px 0", fontSize: FS.xs, color: C.success }}>강점: {r.strengths.join(" · ")}</p>}
                {r.missingInformation.length > 0 && <p style={{ margin: "4px 0", fontSize: FS.xs, color: C.muted }}>부족한 정보: {r.missingInformation.join(" · ")}</p>}
                {r.immediateActions.length > 0 && <p style={{ margin: "4px 0", fontSize: FS.xs, color: C.orange }}>즉시 수정: {r.immediateActions.join(" · ")}</p>}
                {r.unavailableChecks.length > 0 && <p style={{ margin: "4px 0", fontSize: FS.xs, color: C.hint }}>확인 불가: {r.unavailableChecks.join(" · ")}</p>}
              </div>
              );
            })}
          </div>
        </section>

        {/* 9. 분석 범위와 한계 */}
        <section style={cardStyle}>
          <h3 style={{ margin: "0 0 10px", fontSize: FS.lg, fontWeight: 900, color: C.muted }}>분석 범위와 한계</h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: FS.xs, color: C.muted, lineHeight: 1.8 }}>
            {report.limitations.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </section>
      </div>

      {evidenceChannel && (
        <EvidencePanel
          channel={evidenceChannel}
          evidence={report.evidence.filter((e) => e.channel === evidenceChannel)}
          diagnosisId={diagnosisId}
          onClose={() => setEvidenceChannel(null)}
        />
      )}
    </div>
  );
}
