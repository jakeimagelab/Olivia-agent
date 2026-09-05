"use client";

import { useCallback, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { uploadWorkflowArtifact } from "@/lib/workflowArtifacts";
import { createMailingDraft } from "@/lib/mailingQueue";
import ActiveMissionBar from "@/components/dashboard/ActiveMissionBar";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import { useDesktopWindowMode } from "@/lib/desktopWindowContext";
import { addContiShots as addContiShotsShared, duplicateContiShot as duplicateContiShotShared, removeContiShot as removeContiShotShared, reorderContiShot as reorderContiShotShared, updateContiShot as updateContiShotShared } from "@/lib/conti/contiMutationService";
import DrawingCanvas, { DrawingCanvasHandle, PEN_TYPES, DRAW_COLORS, ERASER_SIZES } from "@/components/DrawingCanvas";
import PortraitConsentPanel from "@/components/conti/PortraitConsentPanel";
import ContiSetupForm from "@/components/conti/ContiSetupForm";
import ContiSceneTable from "@/components/conti/ContiSceneTable";
import ContiChecklist from "@/components/conti/ContiChecklist";
import ContiSchedule from "@/components/conti/ContiSchedule";
import ContiSummaryBar from "@/components/conti/ContiSummaryBar";
import ContiExportActions from "@/components/conti/ContiExportActions";
import { getContiCategoryColor } from "@/components/conti/contiColors";
import type { ChecklistRow, ContiFormState, ContiResult, ContiRow, LocationItem, PatientItem, SavedConti, ScheduleRow, StaffItem } from "@/components/conti/types";
import {
  CheckSquare, ClipboardList, FileSignature, Image as ImageIcon,
  Clock, FileText, Link2, Minus, Pencil, Plus, Trash2
} from "lucide-react";

/* ════════════════════════════════════════
   프리셋
════════════════════════════════════════ */
// ※ 진료과 순서: PDF 콘티 기준 / 실제 촬영 빈도 순
const SPECIALTY_OPTIONS = [
  // 소아·이비인후
  "소아청소년과", "이비인후과(청각치료포함)",
  // 내과·검진
  "검진내과",
  // 근골격·통증계 (C-ARM / 초음파주사 / 통증치료 공통)
  "정형외과", "신경외과", "마취통증의학과", "재활의학과",
  // 미용·외모
  "성형외과", "피부과",
  // 기타 전문과
  "안과", "치과", "산부인과", "비뇨기과", "외과",
  // 정신·한방
  "정신건강의학과", "한방병원(한의원)",
];
const STAFF_ROLE_PRESETS = [
  "간호사", "수간호사", "병동 간호사", "외래 간호사",
  "인포데스크 직원", "상담실장", "수술팀 직원",
  "영양사", "방사선사", "물리치료사", "행정직원"
];
const PATIENT_TYPE_PRESETS = [
  "아이 (유아, 만 1~3세)", "아이 (소아, 만 4~7세)", "아이 (초등, 만 8~13세)",
  "부모 + 아이 그룹", "성인 남성", "성인 여성", "노인 (60대 이상)"
];

function withSceneIds(result: ContiResult): ContiResult {
  return {
    ...result,
    conti: result.conti.map((row) => row.id ? row : { ...row, id: crypto.randomUUID() }),
  };
}

/* ════════════════════════════════════════
   타입
════════════════════════════════════════ */

/* ════════════════════════════════════════
   메인
════════════════════════════════════════ */
export default function ContiBuilder({
  mode = "page",
  clientId: modalClientId,
  workflowRunId: modalWorkflowRunId,
  resourceId,
  onClose,
  onPublished,
  registerRequestClose,
}: {
  mode?: "page" | "modal";
  clientId?: string;
  workflowRunId?: string;
  resourceId?: string;
  startInPreview?: boolean;
  onClose?: () => void;
  onPublished?: () => void;
  registerRequestClose?: (fn: () => void) => void;
} = {}) {
  const isModal = mode === "modal";
  // mode="modal"은 OLIVIA OS 창(ContiBuilderWindowContent)과 ClientsWorkspace.tsx의 기존
  // 툴 모달 둘 다에서 쓴다 — QuoteBuilder.tsx와 같은 이유로 useDesktopWindowMode()로 구분해서
  // 4단계(3단 레이아웃) 변경을 OS 창에만 적용하고 기존 툴 모달은 그대로 둔다.
  const isDesktopWindowMode = useDesktopWindowMode();
  const isDesktopWindow = isModal && isDesktopWindowMode;
  const setOliviaWorkspace = useOliviaContextStore((state) => state.setWorkspace);
  const setOliviaClient = useOliviaContextStore((state) => state.setClient);
  const setOliviaProject = useOliviaContextStore((state) => state.setProject);
  const setOliviaSelection = useOliviaContextStore((state) => state.setSelection);
  const selectedOliviaEntityId = useOliviaContextStore((state) => state.selectedEntityId);
  const setOliviaCurrentDocument = useOliviaContextStore((state) => state.setCurrentDocument);
  const setOliviaPageContext = useOliviaContextStore((state) => state.setPageContext);
  const [form, setForm] = useState<ContiFormState>({
    shootTitle:    "",
    hospitalName:  "",
    specialties:   [] as string[],
    doctors:       "1",
    viceDirectors: "0",
    staffItems:    [{ role: "", count: 1, detail: "" }] as StaffItem[],
    patientItems:  [{ type: "", count: 1, detail: "" }] as PatientItem[],
    locationItems: [{ floor: "", spaces: "", notes: "" }] as LocationItem[],
    purpose: "",
    mainPeople: "",
    requiredScenes: "",
    notes:   ""
  });

  const [loading,          setLoading]          = useState(false);
  const [pageMode,         setPageMode]         = useState<"conti" | "portrait">("conti");
  const [urlClientId,      setUrlClientId]      = useState<string | null>(null);
  const [urlWorkflowRunId, setUrlWorkflowRunId] = useState<string | null>(null);

  useEffect(() => {
    setOliviaWorkspace("conti", resourceId);
    if (modalWorkflowRunId) setOliviaProject(modalWorkflowRunId);
    return () => {
      const current = useOliviaContextStore.getState();
      if (current.activeWorkspace === "conti" && current.activeResourceId === resourceId) {
        current.setWorkspace(undefined, undefined);
      }
    };
  }, [modalWorkflowRunId, resourceId, setOliviaProject, setOliviaWorkspace]);

  // URL 파라미터로 자동 입력 (올리비아·고객관리 연동) — 페이지 모드 전용.
  useEffect(() => {
    if (isModal || typeof window === "undefined") return;
    const params       = new URLSearchParams(window.location.search);
    const hospitalName = params.get("hospitalName");
    const dept         = params.get("dept");
    const spaces       = params.get("spaces");
    const doctors      = params.get("doctors");
    const extras       = params.get("extras");
    const clientId     = params.get("client_id") || params.get("clientId");
    const workspaceTool = params.get("tool");
    if (workspaceTool === "portrait") setPageMode("portrait");
    if (workspaceTool === "shooting") setPageMode("conti");
    setUrlClientId(clientId);
    setUrlWorkflowRunId(params.get("workflowRunId"));

    if (clientId) {
      fetch(`/api/clients/${clientId}`)
        .then(r => r.json())
        .then(d => {
          if (!d.ok || !d.client) return;
          const c = d.client;
          setForm(prev => ({
            ...prev,
            hospitalName: c.name || c.hospital_name || prev.hospitalName,
            specialties:  c.department ? [c.department] : prev.specialties,
          }));
        })
        .catch(() => {});
    } else if (hospitalName || dept) {
      setForm(prev => ({
        ...prev,
        hospitalName: hospitalName || prev.hospitalName,
        specialties:  dept ? [dept] : prev.specialties,
        doctors:      doctors || prev.doctors,
        notes:        extras || prev.notes,
        locationItems: spaces
          ? [{ floor: "", spaces: spaces, notes: "" }]
          : prev.locationItems,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModal]);

  const [result,           setResult]           = useState<ContiResult | null>(null);
  const historyRef = useRef<ContiResult[]>([]);
  const historyIndexRef = useRef(-1);
  const skipHistoryRef = useRef(false);
  const resultSignatureRef = useRef("");
  const lastAutoSavedSignatureRef = useRef("");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sceneImages,      setSceneImages]      = useState<Record<string, string>>({});
  const [generatingImages, setGeneratingImages] = useState(false);
  const [imageError,       setImageError]       = useState("");

  /* ── 씬 이미지 자동 생성 (DALL-E 3) ── */
  const generateSceneImages = async (contiRows: ContiRow[]) => {
    if (!process.env.NEXT_PUBLIC_ENABLE_SCENE_IMAGES && typeof window !== "undefined") {
      // 환경변수로 ON/OFF 가능
    }
    setGeneratingImages(true);
    setImageError("");
    setSceneImages({});
    try {
      const res = await fetch("/api/conti-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: contiRows.slice(0, 10) }),
      });
      const data = await res.json();
      if (data.ok && data.images) {
        setSceneImages(data.images);
      } else {
        setImageError(data.error || "이미지 생성 실패");
      }
    } catch (e: any) {
      setImageError(e.message);
    } finally {
      setGeneratingImages(false);
    }
  };

  const [error,            setError]            = useState("");
  const [tab,              setTab]              = useState<"conti" | "scenes" | "checklist" | "schedule">("conti");
  const [fieldView,        setFieldView]        = useState(false); // 아이패드 현장 뷰
  const [resultTitle,      setResultTitle]      = useState("");
  const [quickSpecialties, setQuickSpecialties] = useState<string[]>([]);
  const [quickLoading,     setQuickLoading]     = useState(false);
  const [quickError,       setQuickError]       = useState("");
  const printRef = useRef<HTMLDivElement>(null);

  // ── PDF 불러오기 ──
  const [pdfLoading,  setPdfLoading]  = useState(false);
  const [pdfError,    setPdfError]    = useState("");
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // ── 현장뷰 URL 공유 ──
  const [shareUrl,     setShareUrl]     = useState("");
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied,  setShareCopied]  = useState(false);

  // ── 현장 뷰 탭 ──
  const [fieldViewTab, setFieldViewTab] = useState<"conti" | "checklist" | "schedule">("conti");
  const [doneConti, setDoneConti] = useState<Set<number>>(new Set());
  const toggleDone = (i: number) =>
    setDoneConti(prev => { const s = new Set(prev); if (s.has(i)) s.delete(i); else s.add(i); return s; });

  // ── 현장 뷰 카드 크기 조절 (바 슬라이더, 아이패드 터치 대응) ──
  const FIELD_CARD_MIN = 220;
  const FIELD_CARD_MAX = 480;
  const [fieldCardSize, setFieldCardSize] = useState(300);
  useEffect(() => {
    const saved = localStorage.getItem("olivia_field_card_size");
    if (saved) {
      const n = parseInt(saved, 10);
      if (!isNaN(n)) setFieldCardSize(Math.min(FIELD_CARD_MAX, Math.max(FIELD_CARD_MIN, n)));
    }
  }, []);
  useEffect(() => {
    localStorage.setItem("olivia_field_card_size", String(fieldCardSize));
  }, [fieldCardSize]);

  // ── 현장 뷰 드로잉 (엔진은 components/DrawingCanvas 공유 컴포넌트) ──
  const [drawMode,      setDrawMode]      = useState(false);
  const [penColor,      setPenColor]      = useState("#E85D2C");
  const [penSize,       setPenSize]       = useState(4);
  const [penType,       setPenType]       = useState<"pen" | "marker" | "highlighter" | "brush">("pen");
  const [isEraser,      setIsEraser]      = useState(false);
  const [eraserSize,    setEraserSize]    = useState(ERASER_SIZES[1]);
  const [drawSaveState, setDrawSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const drawCanvasRef  = useRef<DrawingCanvasHandle>(null);
  const tempDrawingRef = useRef<string | null>(null);

  // ── OLIVIA OS 1차 작업 지시서 4단계 — OS 창 전용 3단 씬 편집 레이아웃(isDesktopWindow) ──
  // 아이패드 현장뷰(fieldView)의 drawMode 토글과는 별개로, 이 레이아웃에서는 캔버스가 항상
  // 보이므로 진입 시 한 번 불러오기만 하면 된다(저장은 기존과 동일하게 수동 "저장" 버튼).
  const [contiRightPanelCollapsed, setContiRightPanelCollapsed] = useState(false);
  const [contiLeftDrawerOpen, setContiLeftDrawerOpen] = useState(false);
  const contiEditorRef = useRef<HTMLDivElement>(null);
  const [contiEditorWidth, setContiEditorWidth] = useState(1200);

  useEffect(() => {
    const el = contiEditorRef.current;
    if (!el || !isDesktopWindow || tab !== "conti") return;
    const update = () => setContiEditorWidth(el.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isDesktopWindow, tab]);

  useEffect(() => {
    if (!isDesktopWindow || tab !== "conti" || !result) return;
    loadDrawing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktopWindow, tab]);

  const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => (await fetch(dataUrl)).blob();

  /* 캔버스 → Supabase Storage 저장 */
  const saveDrawing = async () => {
    const dataUrl = drawCanvasRef.current?.getDataUrl();
    const hospital = form.hospitalName || resultTitle;
    if (!dataUrl || !hospital) return;
    setDrawSaveState("saving");
    try {
      const blob = await dataUrlToBlob(dataUrl);
      const fd = new FormData();
      fd.append("file", blob, "drawing.png");
      fd.append("hospital", hospital);
      const res = await fetch("/api/conti-drawing", { method: "POST", body: fd });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setDrawSaveState("saved");
      setTimeout(() => setDrawSaveState("idle"), 2500);
    } catch {
      setDrawSaveState("error");
      setTimeout(() => setDrawSaveState("idle"), 3000);
    }
  };

  /* Supabase Storage → 캔버스 복원 */
  const loadDrawing = async () => {
    const hospital = form.hospitalName || resultTitle;
    if (!hospital) return;
    try {
      const res  = await fetch(`/api/conti-drawing?hospital=${encodeURIComponent(hospital)}`);
      const data = await res.json();
      if (!data.ok || !data.url) return;
      drawCanvasRef.current?.loadImage(data.url);
    } catch { /* 드로잉 없음 — 무시 */ }
  };

  useEffect(() => {
    if (!drawMode) return;
    // 메모리 스냅샷이 있으면 우선 복원, 없으면 Supabase에서 불러오기
    if (tempDrawingRef.current) {
      const snap = tempDrawingRef.current;
      tempDrawingRef.current = null;
      drawCanvasRef.current?.loadImage(snap);
    } else {
      loadDrawing();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawMode]);

  const clearCanvas = () => drawCanvasRef.current?.clear();

  const set = <K extends keyof ContiFormState>(field: K, value: ContiFormState[K]) =>
    setForm(prev => ({ ...prev, [field]: value }));

  /* ── 결과 셀 수정 ── */
  const updateConti = useCallback((i: number, field: keyof ContiRow, v: string) =>
    setResult(prev => {
      if (!prev) return prev;
      return updateContiShotShared(prev, i, { [field]: v }).result as ContiResult;
    }), []);

  const updateContiColor = useCallback((i: number, bg: string, text: string) =>
    setResult(prev => {
      if (!prev) return prev;
      const rows = [...prev.conti];
      rows[i] = { ...rows[i], color: `${bg}|${text}` };
      return { ...prev, conti: rows };
    }), []);

  const updateChecklistColor = (i: number, bg: string, text: string) =>
    setResult(prev => {
      if (!prev) return prev;
      const rows = [...prev.checklist];
      rows[i] = { ...rows[i], color: `${bg}|${text}` };
      return { ...prev, checklist: rows };
    });

  const updateChecklist = (i: number, field: keyof ChecklistRow, v: string) =>
    setResult(prev => {
      if (!prev) return prev;
      const rows = [...prev.checklist];
      rows[i] = { ...rows[i], [field]: v };
      return { ...prev, checklist: rows };
    });

  const updateSchedule = (i: number, field: keyof ScheduleRow, v: string) =>
    setResult(prev => {
      if (!prev) return prev;
      const rows = [...prev.schedule];
      rows[i] = { ...rows[i], [field]: v };
      return { ...prev, schedule: rows };
    });

  /* ── 결과 행 추가/삭제 ── */
  const addContiRow = useCallback(() => setResult(prev => prev ? addContiShotsShared(prev, { items: [{ category: "", description: "" }] }).result as ContiResult : prev), []);

  const delContiRow = useCallback((i: number, sceneId: string) => {
    const context = useOliviaContextStore.getState();
    if (context.selectedSceneId === sceneId) context.setSelectedScene(undefined);
    setResult(prev => prev ? removeContiShotShared(prev, i).result as ContiResult : prev);
  }, []);
  const dupContiRow = useCallback((i: number) => setResult(prev => {
    if (!prev) return prev;
    return duplicateContiShotShared(prev, i).result as ContiResult;
  }), []);

  const moveContiRow = useCallback((from: number, to: number) => setResult(prev => {
    if (!prev) return prev;
    return reorderContiShotShared(prev, from, to).result as ContiResult;
  }), []);

  const moveChecklistRow = useCallback((from: number, to: number) => setResult(prev => {
    if (!prev) return prev;
    const rows = [...prev.checklist];
    const [moved] = rows.splice(from, 1);
    rows.splice(to, 0, moved);
    return { ...prev, checklist: rows.map((r, idx) => ({ ...r, number: idx + 1 })) };
  }), []);

  const moveScheduleRow = useCallback((from: number, to: number) => setResult(prev => {
    if (!prev) return prev;
    const rows = [...prev.schedule];
    const [moved] = rows.splice(from, 1);
    rows.splice(to, 0, moved);
    return { ...prev, schedule: rows };
  }), []);

  const dragRef = useRef<{ type: string; index: number } | null>(null);
  const touchDragRef = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<{ type: string; index: number } | null>(null);

  const handleDragStart = useCallback((type: string, index: number) => {
    dragRef.current = { type, index };
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent, type: string, index: number) => {
    e.preventDefault();
    setDragOver({ type, index });
  }, []);
  const handleDrop = useCallback((type: string, toIndex: number) => {
    if (!dragRef.current || dragRef.current.type !== type) return;
    const from = dragRef.current.index;
    if (from === toIndex) { setDragOver(null); return; }
    if (type === "conti")     moveContiRow(from, toIndex);
    if (type === "checklist") moveChecklistRow(from, toIndex);
    if (type === "schedule")  moveScheduleRow(from, toIndex);
    dragRef.current = null;
    setDragOver(null);
  }, [moveChecklistRow, moveContiRow, moveScheduleRow]);
  const handleDragEnd = useCallback(() => { dragRef.current = null; setDragOver(null); }, []);
  const selectContiScene = useCallback((id: string) => setOliviaSelection("conti-shot", id), [setOliviaSelection]);
  const handleContiDragStart = useCallback((index: number) => handleDragStart("conti", index), [handleDragStart]);
  const handleContiDragOver = useCallback((event: React.DragEvent, index: number) => handleDragOver(event, "conti", index), [handleDragOver]);
  const handleContiDrop = useCallback((index: number) => handleDrop("conti", index), [handleDrop]);

  const addChecklistRow = () => setResult(prev => {
    if (!prev) return prev;
    const number = prev.checklist.length + 1;
    return { ...prev, checklist: [...prev.checklist, { number, category: "", item: "", notes: "" }] };
  });

  const delChecklistRow = (i: number) => setResult(prev => prev ? {
    ...prev, checklist: prev.checklist.filter((_, idx) => idx !== i).map((r, idx) => ({ ...r, number: idx + 1 }))
  } : prev);

  const clearChecklist = () => {
    if (!result || result.checklist.length === 0) return;
    if (!window.confirm(`준비 체크리스트 ${result.checklist.length}개 항목을 전부 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setResult(prev => prev ? { ...prev, checklist: [] } : prev);
  };

  const addScheduleRow = () => setResult(prev => prev ? {
    ...prev, schedule: [...prev.schedule, { time: "", activity: "", type: "", requirements: "", notes: "" }]
  } : prev);

  const delScheduleRow = (i: number) => setResult(prev => prev ? { ...prev, schedule: prev.schedule.filter((_, idx) => idx !== i) } : prev);

  /* ── ⚡ 빠른 콘티 생성 ── */
  const handleQuickGenerate = async () => {
    if (quickSpecialties.length === 0) { setQuickError("진료과목을 선택해주세요."); return; }
    setQuickLoading(true); setQuickError(""); setResult(null);
    try {
      const res  = await fetch("/api/conti", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quick: true, specialties: quickSpecialties.join(", ") })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "오류가 발생했습니다.");
      setResult(withSceneIds(data));
      setResultTitle(quickSpecialties.join(" · ") + " 촬영 콘티");
      setForm(prev => ({ ...prev, specialties: quickSpecialties }));
      setTab("scenes");
      const contiTitle = quickSpecialties.join(" · ") + " — 기본 콘티";
      createMailingDraft({
        type: "conti",
        source_module: "conti",
        hospital_name: quickSpecialties.join(", "),
        subject: `[포토클리닉] 촬영 콘티 - ${contiTitle}`,
        body: `촬영 콘티가 생성되었습니다.\n\n진료과목: ${quickSpecialties.join(", ")}\n씬 수: ${data.scenes?.length || 0}개`,
      });
    } catch (err: unknown) {
      setQuickError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally { setQuickLoading(false); }
  };

  /* ── 상세 생성 ── */
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.shootTitle.trim() || !form.purpose.trim()) { setError("촬영명과 촬영 목적을 입력해주세요."); return; }
    setLoading(true); setError(""); setResult(null);

    const staffDesc    = form.staffItems.filter(s => s.role).map(s => `${s.role} ${s.count}명${s.detail ? ` (${s.detail})` : ""}`).join(", ") || form.mainPeople || "미입력";
    const patientDesc  = form.patientItems.filter(p => p.type).map(p => `${p.type} ${p.count}명${p.detail ? ` (${p.detail})` : ""}`).join(", ") || "미입력";
    const locationDesc = form.locationItems.filter(l => l.floor || l.spaces).map(l => `${l.floor ? l.floor + " " : ""}${l.spaces}${l.notes ? ` (${l.notes})` : ""}`).join(" / ") || "미입력";

    try {
      const res  = await fetch("/api/conti", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hospitalName: form.hospitalName || form.shootTitle, specialties: form.specialties.join(", "), doctors: form.doctors, viceDirectors: form.viceDirectors, staff: staffDesc, patients: patientDesc, locations: locationDesc, purpose: form.purpose, notes: [form.requiredScenes ? `꼭 필요한 장면: ${form.requiredScenes}` : "", form.notes].filter(Boolean).join("\n") })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "오류가 발생했습니다.");
      setResult(withSceneIds(data));
      setResultTitle(form.shootTitle || (form.hospitalName || form.specialties.join(" · ")) + " 촬영 콘티");
      setTab("scenes");
      createMailingDraft({
        type: "conti",
        source_module: "conti",
        hospital_name: form.hospitalName || form.specialties.join(", "),
        subject: `[포토클리닉] 촬영 콘티 - ${form.hospitalName || form.specialties.join(" · ")}`,
        body: `${form.hospitalName || ""} 촬영 콘티가 생성되었습니다.\n\n진료과목: ${form.specialties.join(", ")}\n씬 수: ${data.scenes?.length || 0}개${form.notes ? "\n\n특이사항: " + form.notes : ""}`,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally { setLoading(false); }
  };

  /* ── PDF 불러오기 ── */
  const handlePdfImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 10 MB 이상이면 Vercel 4.5 MB 업로드 제한에 걸림
    if (file.size > 10 * 1024 * 1024) {
      setPdfError("파일이 너무 큽니다. 10MB 이하의 파일을 사용해 주세요.");
      if (pdfInputRef.current) pdfInputRef.current.value = "";
      return;
    }

    setPdfLoading(true);
    setPdfError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/conti/parse-pdf", { method: "POST", body: fd });

      // Vercel 에러 페이지나 텍스트 응답을 JSON 파싱 오류 없이 처리
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(
          res.status === 413 ? "파일이 너무 커서 업로드할 수 없습니다. (최대 4.5MB)"
          : res.status === 504 || res.status === 524 ? "AI 분석 시간이 초과됐습니다. 더 작은 파일을 사용해 주세요."
          : `서버 오류 (${res.status}): ${text.slice(0, 120)}`
        );
      }

      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "PDF 인식 실패");
      const parsed: ContiResult = {
        conti:     data.conti     || [],
        checklist: data.checklist || [],
        schedule:  data.schedule  || [],
      };
      setResult(withSceneIds(parsed));
      setResultTitle((form.hospitalName || file.name.replace(/\.(pdf|jpe?g|png|gif|webp)$/i, "")) + " 촬영 콘티");
      setTab("conti");
      setShareUrl("");
    } catch (err: any) {
      setPdfError(err.message || "PDF 인식에 실패했습니다.");
    } finally {
      setPdfLoading(false);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
    }
  };

  /* ── 현장뷰 공유 링크 생성 ── */
  const handleShare = async () => {
    if (!result) return;
    setShareLoading(true);
    try {
      const res  = await fetch("/api/conti/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:      resultTitle,
          hospital:   form.hospitalName,
          specialties: form.specialties.join(", "),
          result,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "공유 링크 생성 실패");
      const url = `${window.location.origin}/conti/view/${data.token}`;
      setShareUrl(url);
      await navigator.clipboard.writeText(url).catch(() => {});
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 3000);
    } catch (err: any) {
      alert("공유 링크 생성 실패: " + err.message);
    } finally {
      setShareLoading(false);
    }
  };

  /* ── Supabase 저장/불러오기 ── */
  const [showLoadPanel, setShowLoadPanel] = useState(false);
  const [savedList,     setSavedList]     = useState<SavedConti[]>([]);
  const [saveToast,     setSaveToast]     = useState(false);
  const [saveLoading,   setSaveLoading]   = useState(false);
  const [autoSaveState, setAutoSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [historyToast,  setHistoryToast]  = useState("");
  const [loadLoading,   setLoadLoading]   = useState(false);
  const [editingId,     setEditingId]     = useState<string | null>(null);
  const [editingName,   setEditingName]   = useState("");
  const [savedContiId,  setSavedContiId]  = useState<string | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [completeState, setCompleteState] = useState<"idle" | "completing" | "done" | "error">("idle");
  const [completeError, setCompleteError] = useState("");

  const contiDocumentId = resourceId || savedContiId || undefined;
  useEffect(() => {
    setOliviaCurrentDocument(contiDocumentId, "storyboard", resultTitle || form.hospitalName || "촬영 콘티");
    setOliviaPageContext({
      pageMode: result ? (contiDocumentId ? "edit" : "create") : "create",
      capabilities: result
        ? ["conti.edit", "conti.add_scene", "conti.remove_scene", "conti.reorder_scene", "conti.export"]
        : [],
      documentStatus: completeState === "done" ? "approved" : "draft",
      brand: "photoclinic",
      canEdit: completeState !== "done",
      canFinalize: Boolean(result && (urlWorkflowRunId || modalWorkflowRunId)) && completeState !== "done",
    });
  }, [completeState, contiDocumentId, form.hospitalName, modalWorkflowRunId, result, resultTitle, setOliviaCurrentDocument, setOliviaPageContext, urlWorkflowRunId]);

  useEffect(() => {
    const current = useOliviaContextStore.getState();
    if (current.activeWorkspace !== "conti" || current.activeResourceId !== contiDocumentId) setOliviaWorkspace("conti", contiDocumentId);
    return () => {
      const current = useOliviaContextStore.getState();
      if (current.activeWorkspace === "conti" && current.activeResourceId === contiDocumentId) current.setWorkspace(undefined, undefined);
    };
  }, [contiDocumentId, setOliviaWorkspace]);

  // "최종완료" — 코드 요청서 2차(2026-08-16) 2번 항목. 저장 → 워크플로우 conti 단계 완료 처리 →
  // 다음 단계로 진행까지 승인 없이 즉시 처리한다. 포털 공개(고객 상세 화면의 "공개 관리" 패널,
  // lib/clientWorkspace/publishActions.ts)와 완전히 분리된 동작이다.
  const completeContiStep = async () => {
    setCompleteState("completing"); setCompleteError("");
    try {
      const sourceId = savedContiId || await saveConti({ silent: true });
      if (!sourceId) throw new Error("콘티 DB 저장에 실패했습니다.");
      if (!urlWorkflowRunId) throw new Error("콘티에 연결된 프로젝트가 없습니다. 먼저 견적서·계약서를 완료해 프로젝트를 생성해주세요.");
      const r = await fetch(`/api/workflow-runs/${urlWorkflowRunId}/complete-step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepKey: "conti" }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setCompleteState("done");
      setTimeout(() => setCompleteState("idle"), 3000);
    } catch (error: any) {
      setCompleteError(error?.message || "최종완료 처리에 실패했습니다.");
      setCompleteState("error");
      setTimeout(() => setCompleteState("idle"), 3000);
    }
  };

  // Workspace Modal 전용 프리필 — resourceId(기존 콘티)가 있으면 그대로 불러오고, 없으면
  // clientId로 고객 기본 정보만 채운다(콘티 자체는 사용자가 폼 입력 후 직접 생성해야 한다 —
  // 견적/계약과 달리 AI 생성 버튼을 눌러야 result가 생기므로 자동으로 채울 콘텐츠가 없다).
  useEffect(() => {
    if (!isModal) return;
    setUrlClientId(modalClientId ?? null);
    setUrlWorkflowRunId(modalWorkflowRunId ?? null);
    if (resourceId) {
      const loadResource = () => fetch(`/api/conti/saves/${resourceId}`)
        .then((r) => r.json())
        .then((json) => {
          if (!json.ok) return;
          const entry = json.data;
          if (entry.client_id || entry.hospital_name) setOliviaClient(entry.client_id, entry.hospital_name);
          if (entry.workflow_run_id) setOliviaProject(entry.workflow_run_id);
          setResult(withSceneIds(entry.result));
          setResultTitle(entry.title || entry.hospital_name);
          setForm((prev) => ({ ...prev, shootTitle: entry.title || entry.hospital_name || prev.shootTitle, hospitalName: entry.hospital_name, specialties: entry.specialties || prev.specialties }));
          setSavedContiId(resourceId);
          // In-page Agent 패널이 "여기에 추가해줘"처럼 지금 보고 있는 문서를 다시 지칭하지
          // 않아도 알아듣도록, 실제로 콘티를 불러온 시점에 현재 문서로 기록한다.
          setOliviaCurrentDocument(resourceId, "storyboard", entry.title || entry.hospital_name);
        })
        .catch(() => {});
      void loadResource();
      const onRefresh = (event: Event) => {
        const detail = (event as CustomEvent<{ resource?: string; resourceId?: string }>).detail;
        if ((!detail?.resource || detail.resource === "conti") && (!detail?.resourceId || detail.resourceId === resourceId)) void loadResource();
      };
      window.addEventListener("olivia-resource-refresh", onRefresh);
      return () => window.removeEventListener("olivia-resource-refresh", onRefresh);
    }
    if (!modalClientId) return;
    fetch(`/api/clients/${modalClientId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok || !d.client) return;
        const c = d.client;
        setForm((prev) => ({
          ...prev,
          hospitalName: c.name || c.hospital_name || prev.hospitalName,
          specialties: c.department ? [c.department] : prev.specialties,
        }));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModal, modalClientId, resourceId]);

  // 페이지 모드(예: /conti에서 "이전 콘티 불러오기")는 위 모달 전용 effect가 아예 안 돌아서
  // olivia-resource-refresh를 아무도 안 듣고 있었다 — 채팅으로 지금 보고 있는 콘티를 수정해도
  // "반영했다"는 답만 오고 화면은 그대로였던 버그. savedContiId가 있을 때(콘티를 한 번이라도
  // 불러온 뒤)만 듣고, 같은 레코드가 바뀌었을 때 새로고침 없이 그 자리에서 다시 불러온다.
  useEffect(() => {
    if (isModal || !savedContiId) return;
    const onRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ resource?: string; resourceId?: string }>).detail;
      if (detail?.resource && detail.resource !== "conti") return;
      if (detail?.resourceId && detail.resourceId !== savedContiId) return;
      fetch(`/api/conti/saves/${savedContiId}`)
        .then((r) => r.json())
        .then((json) => {
          if (!json.ok) return;
          const entry = json.data;
          setResult(withSceneIds(entry.result));
          setResultTitle(entry.title || entry.hospital_name);
          setForm((prev) => ({ ...prev, shootTitle: entry.title || entry.hospital_name || prev.shootTitle, hospitalName: entry.hospital_name, specialties: entry.specialties || prev.specialties }));
        })
        .catch(() => {});
    };
    window.addEventListener("olivia-resource-refresh", onRefresh);
    return () => window.removeEventListener("olivia-resource-refresh", onRefresh);
  }, [isModal, savedContiId]);

  useEffect(() => {
    if (!result) return;

    const signature = JSON.stringify(result);
    if (signature === resultSignatureRef.current) return;

    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
      resultSignatureRef.current = signature;
      return;
    }

    const currentIndex = historyIndexRef.current;
    const nextHistory = historyRef.current.slice(0, currentIndex + 1);
    nextHistory.push(structuredClone(result));

    if (nextHistory.length > 80) nextHistory.shift();
    historyRef.current = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;
    resultSignatureRef.current = signature;
  }, [result]);

  const restoreHistory = (direction: "undo" | "redo") => {
    const nextIndex = direction === "undo"
      ? historyIndexRef.current - 1
      : historyIndexRef.current + 1;
    const snapshot = historyRef.current[nextIndex];
    if (!snapshot) {
      setHistoryToast(direction === "undo" ? "되돌릴 내역이 없어요." : "다시 복귀할 내역이 없어요.");
      setTimeout(() => setHistoryToast(""), 1600);
      return;
    }

    skipHistoryRef.current = true;
    historyIndexRef.current = nextIndex;
    resultSignatureRef.current = JSON.stringify(snapshot);
    setResult(structuredClone(snapshot));
    setHistoryToast(direction === "undo" ? "이전 상태로 되돌렸어요." : "다시 복귀했어요.");
    setTimeout(() => setHistoryToast(""), 1600);
  };

  // ── Workspace Modal 전용 닫기 정책(dirty 추적/진행 중 저장 참조) ──
  const pendingSaveRef = useRef<Promise<string | null> | null>(null);
  const [dirty, setDirty] = useState(false);

  const saveConti = async ({ silent = false }: { silent?: boolean } = {}): Promise<string | null> => {
    if (!result) return null;
    if (silent) setAutoSaveState("saving");
    else setSaveLoading(true);

    const payload = {
      hospitalName: form.hospitalName || "병원명 없음",
      specialties: form.specialties,
      title: resultTitle,
      result,
      // 모달 모드에서는 이미 알고 있는 정확한 clientId/id로 연결한다 — 병원명만으로 "기존 것
      // 찾기"에 의존하면 다른 고객의 콘티와 뒤섞일 위험이 있다(견적번호 충돌 버그와 동일 클래스).
      ...(isModal ? { clientId: modalClientId, workflowRunId: modalWorkflowRunId, id: savedContiId ?? undefined } : {}),
    };

    try {
      const res = await fetch("/api/conti/saves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setSavedContiId(data.id);
      lastAutoSavedSignatureRef.current = JSON.stringify(payload);
      if (isModal) setDirty(false);
      if (silent) {
        setAutoSaveState("saved");
      } else {
        setSaveToast(true);
        setAutoSaveState("saved");
        setTimeout(() => setSaveToast(false), 2000);
      }
      return data.id as string;
    } catch (e: any) {
      if (silent) setAutoSaveState("error");
      else alert("저장 실패: " + e.message);
      return null;
    } finally {
      if (!silent) setSaveLoading(false);
    }
  };

  const handleSaveJSON = () => saveConti({ silent: false });

  useEffect(() => {
    if (!result) return;

    const payload = {
      hospitalName: form.hospitalName || "병원명 없음",
      specialties: form.specialties,
      title: resultTitle,
      result,
      ...(isModal ? { clientId: modalClientId, workflowRunId: modalWorkflowRunId, id: savedContiId ?? undefined } : {}),
    };
    const payloadSignature = JSON.stringify(payload);

    if (payloadSignature === lastAutoSavedSignatureRef.current) {
      if (isModal) setDirty(false);
      return;
    }
    if (isModal) setDirty(true);

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setAutoSaveState("idle");

    autoSaveTimerRef.current = setTimeout(() => {
      const savePromise = saveConti({ silent: true });
      if (isModal) pendingSaveRef.current = savePromise;
    }, 2500);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, resultTitle, form.hospitalName, form.specialties, isModal, modalClientId, modalWorkflowRunId, savedContiId]);

  const handleModalClose = async () => {
    if (!isModal) return;
    if (pendingSaveRef.current) await pendingSaveRef.current;
    const stillDirty = JSON.stringify({
      hospitalName: form.hospitalName || "병원명 없음", specialties: form.specialties, title: resultTitle, result,
      clientId: modalClientId, workflowRunId: modalWorkflowRunId, id: savedContiId ?? undefined,
    }) !== lastAutoSavedSignatureRef.current;
    if (!result || !stillDirty) { onClose?.(); return; }
    setCloseConfirmOpen(true);
  };
  useEffect(() => {
    if (!isModal) return;
    registerRequestClose?.(() => handleModalClose);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModal, registerRequestClose, dirty]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey || !result) return;

      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        handleSaveJSON();
        return;
      }

      if (key === "z" && event.shiftKey) {
        event.preventDefault();
        restoreHistory("redo");
        return;
      }

      if (key === "z") {
        event.preventDefault();
        restoreHistory("undo");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [result, resultTitle, form.hospitalName, form.specialties, saveLoading]);

  const openLoadPanel = async () => {
    setShowLoadPanel(true);
    setLoadLoading(true);
    try {
      const res  = await fetch("/api/conti/saves");
      const data = await res.json();
      if (data.ok) setSavedList(data.data || []);
    } catch { /* 무시 */ }
    finally { setLoadLoading(false); }
  };

  const loadConti = (entry: SavedConti) => {
    setResult(withSceneIds(entry.result));
    setResultTitle(entry.title || entry.hospital_name);
    setForm(prev => ({ ...prev, shootTitle: entry.title || entry.hospital_name || prev.shootTitle, hospitalName: entry.hospital_name, specialties: entry.specialties || prev.specialties }));
    setSavedContiId(entry.id);
    setTab("conti");
    setShowLoadPanel(false);
  };

  const deleteConti = async (id: string) => {
    if (!window.confirm("저장 콘티를 휴지통으로 이동할까요?")) return;
    const response = await fetch(`/api/conti/saves?id=${id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok || !data.ok) { window.alert(data.error || "콘티 삭제 실패"); return; }
    setSavedList(prev => prev.filter(s => s.id !== id));
  };

  const renameConti = async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) { setEditingId(null); return; }
    await fetch("/api/conti/saves", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, hospitalName: trimmed }),
    });
    setSavedList(prev => prev.map(s => s.id === id ? { ...s, hospital_name: trimmed } : s));
    setEditingId(null);
  };

  // "저장된 콘티" 목록에서 client_id가 비어있는(고객 미연결) 항목을 발견했을 때 — 병원명을
  // 직접 타이핑해서 저장한 콘티는 병원명이 실제 고객명과 한 글자만 달라도(오타) 자동 연결이
  // 안 된다(app/api/conti/saves/route.ts의 resolveClientId, 정확히 일치+유일할 때만 연결).
  // 그 결과 화면엔 저장된 것처럼 보이는데 워크플로우 완료 처리는 영영 그 콘티를 못 찾는 문제가
  // 생긴다 — 여기서 사용자가 직접 고객을 골라 연결하면 즉시 워크플로우에서도 인식된다.
  const [linkTarget, setLinkTarget] = useState<SavedConti | null>(null);
  const [linkQuery,  setLinkQuery]  = useState("");
  const [linkResults, setLinkResults] = useState<{ id: string; hospital_name?: string; name?: string }[]>([]);
  const [linkBusy,   setLinkBusy]   = useState(false);

  useEffect(() => {
    if (!linkTarget) return;
    const timer = setTimeout(() => {
      fetch(`/api/clients?q=${encodeURIComponent(linkQuery)}`)
        .then(r => r.json())
        .then(d => { if (d.ok) setLinkResults((d.clients || []).slice(0, 8)); })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [linkQuery, linkTarget]);

  const linkContiToClient = async (client: { id: string; hospital_name?: string; name?: string }) => {
    if (!linkTarget) return;
    setLinkBusy(true);
    try {
      const name = client.hospital_name || client.name || linkTarget.hospital_name;
      const res = await fetch("/api/conti/saves", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: linkTarget.id, clientId: client.id, hospitalName: name }),
      });
      const data = await res.json();
      if (!data.ok) { window.alert(data.error || "고객 연결 실패"); return; }
      setSavedList(prev => prev.map(s => s.id === linkTarget.id
        ? { ...s, client_id: data.clientId, workflow_run_id: data.workflowRunId, hospital_name: data.hospitalName }
        : s));
      setLinkTarget(null);
      setLinkQuery("");
      setLinkResults([]);
    } finally {
      setLinkBusy(false);
    }
  };


  /* ── PDF 인쇄 (브라우저 print, 한글 완벽 지원, 3섹션 1파일) ── */
  const handlePDF = async () => {
    if (!result) return;
    const hospitalName = form.hospitalName || "병원";
    const today = new Date().toLocaleDateString("ko-KR", { year:"numeric", month:"long", day:"numeric" });
    const specialties = form.specialties.join(" · ");

    const CAT_BG: Record<string,string> = {
      "하모니":"#FEF3C7","공통":"#FEF3C7","인포데스크":"#FEF3C7",
      "치과":"#D1FAE5","교정":"#D1FAE5",
      "상담":"#FCE7F3","진료":"#FCE7F3",
      "C-ARM":"#FEE2E2","씨암":"#FEE2E2","시술":"#FEE2E2","수술":"#FEE2E2",
      "초음파":"#DBEAFE","주사":"#DBEAFE",
      "재활":"#D1FAE5","물리치료":"#D1FAE5",
      "인테리어":"#F3F4F6",
    };
    const CAT_FG: Record<string,string> = {
      "하모니":"#92400E","공통":"#92400E","인포데스크":"#92400E",
      "치과":"#065F46","교정":"#065F46",
      "상담":"#9D174D","진료":"#9D174D",
      "C-ARM":"#991B1B","씨암":"#991B1B","시술":"#991B1B","수술":"#991B1B",
      "초음파":"#1E40AF","주사":"#1E40AF",
      "재활":"#065F46","물리치료":"#065F46",
      "인테리어":"#374151",
    };
    const getCatBg = (cat: string) => CAT_BG[Object.keys(CAT_BG).find(k=>cat.includes(k))||""]||"#E6F4F1";
    const getCatFg = (cat: string) => CAT_FG[Object.keys(CAT_FG).find(k=>cat.includes(k))||""]||"#155855";

    const shootDate = form.hospitalName ? "" : "";  // 촬영일자는 resultTitle에서 추출하거나 빈값
    const header = (title: string, isFirst = false) => `
      <div class="page-header">
        <div class="brand">
          <span class="brand-name">PHOTO CLINIC</span>
          <span class="brand-sub">병원 브랜딩 포토그래피</span>
        </div>
        <div class="doc-info">
          <div class="doc-title">${hospitalName}</div>
          <div class="doc-section">${title}</div>
        </div>
        <div class="doc-date">${today}</div>
      </div>
      <div class="orange-bar"></div>
    `;

    const contiRows = result.conti.map((r,i) => `
      <tr style="background:${i%2===0?"#fff":"#fafaf9"}">
        <td style="background:${getCatBg(r.category)};color:${getCatFg(r.category)};font-weight:900;text-align:center;font-size:7pt;word-break:keep-all;vertical-align:middle" contenteditable="true">${r.category}</td>
        <td style="text-align:center;font-size:7pt;vertical-align:middle;white-space:nowrap" contenteditable="true">${r.duration||"-"}</td>
        <td style="text-align:center;font-size:7pt;vertical-align:middle;word-break:keep-all" contenteditable="true">${r.location||"-"}</td>
        <td style="font-size:6.5pt;color:#4b5563;line-height:1.4;vertical-align:middle;white-space:nowrap;overflow:hidden" contenteditable="true">${r.cameraAngle||"-"}</td>
        <td style="color:#E85D2C;font-weight:900;font-size:7pt;vertical-align:middle;white-space:nowrap;overflow:hidden" contenteditable="true">${r.keyword||"-"}</td>
        <td style="font-size:7pt;vertical-align:middle;line-height:1.5" contenteditable="true">${r.description||"-"}</td>
        <td style="font-size:6.5pt;vertical-align:middle;line-height:1.4;color:#374151;white-space:nowrap;overflow:hidden" contenteditable="true">${r.personnel||"-"}</td>
        <td style="font-size:6.5pt;color:#666;text-align:center;vertical-align:middle;word-break:keep-all" contenteditable="true">${r.notes||"-"}</td>
      </tr>
    `).join("");

    const checkRows = result.checklist.map((r,i) => `
      <tr style="background:${i%2===0?"#fff":"#fafaf9"}">
        <td style="text-align:center;font-weight:900;color:#155855;white-space:nowrap;vertical-align:middle;font-size:7.5pt">${r.number}</td>
        <td style="font-weight:700;word-break:keep-all;vertical-align:middle;font-size:7pt;color:#155855" contenteditable="true">${r.category}</td>
        <td style="vertical-align:middle;font-size:7.5pt" contenteditable="true">${r.item}</td>
        <td style="text-align:center;font-size:14px;vertical-align:middle">☐</td>
        <td style="white-space:nowrap;vertical-align:middle;font-size:7pt;color:#666" contenteditable="true">${r.notes||"-"}</td>
      </tr>
    `).join("");

    const schedRows = result.schedule.map((r,i) => `
      <tr style="background:${i%2===0?"#EDF8F7":"#fff"}">
        <td style="text-align:center;font-weight:900;color:#155855;white-space:nowrap;vertical-align:middle;font-size:7.5pt" contenteditable="true">${r.time||"-"}</td>
        <td style="font-weight:700;vertical-align:middle;font-size:7.5pt" contenteditable="true">${r.activity||"-"}</td>
        <td style="color:#E85D2C;text-align:center;vertical-align:middle;font-size:7pt;white-space:nowrap" contenteditable="true">${r.type||"-"}</td>
        <td style="vertical-align:middle;font-size:7.5pt" contenteditable="true">${r.requirements||"-"}</td>
        <td style="vertical-align:middle;font-size:7pt;color:#666;text-align:center;white-space:nowrap" contenteditable="true">${r.notes||"-"}</td>
      </tr>
    `).join("");

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${hospitalName} 촬영 콘티</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Noto Sans KR',sans-serif; font-size:9pt; color:#222; background:#fff; }

  .page-header { display:flex; align-items:center; justify-content:space-between; background:#155855; padding:10px 16px; color:#fff; }
  .brand { display:flex; flex-direction:column; }
  .brand-name { font-size:10pt; font-weight:900; letter-spacing:0.1em; }
  .brand-sub { font-size:7pt; opacity:0.7; margin-top:2px; }
  .doc-info { display:flex; flex-direction:column; align-items:center; gap:3px; }
  .doc-title { font-size:13pt; font-weight:900; line-height:1.2; }
  .doc-section { font-size:9pt; font-weight:400; opacity:0.85; letter-spacing:0.05em; }
  .doc-date { font-size:8pt; opacity:0.8; text-align:right; }
  .orange-bar { height:3px; background:#E85D2C; }

  .section { padding:16px; }
  .section-title { font-size:11pt; font-weight:900; color:#155855; margin-bottom:10px; border-left:4px solid #E85D2C; padding-left:8px; }
  .section-meta { font-size:8pt; color:#888; margin-bottom:10px; }

  table { width:100%; border-collapse:collapse; font-size:7.5pt; table-layout:fixed; }
  th { background:#155855; color:#fff; font-weight:900; padding:6px 5px; text-align:center; border:1px solid #0e3f3c; font-size:7.5pt; word-break:keep-all; line-height:1.3; position:relative; user-select:none; }
  td { padding:5px 6px; border:1px solid #e5e7eb; vertical-align:middle; line-height:1.45; word-break:keep-all; overflow-wrap:break-word; white-space:normal; overflow:hidden; }
  .col-resize { position:absolute; right:0; top:0; bottom:0; width:6px; cursor:col-resize; z-index:10; background:transparent; transition:background 120ms; }
  .col-resize:hover, .col-resize.dragging { background:rgba(255,255,255,0.45); }
  @media print { .col-resize, .print-btn { display:none !important; } }

  /* 표지 */
  .pdf-page { width:1123px; min-height:794px; overflow:hidden; background:#fff; }
  .cover { display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:40px; }
  .cover-logo { font-size:11pt; font-weight:900; letter-spacing:0.2em; color:#155855; margin-bottom:6px; }
  .cover-logo-sub { font-size:8pt; color:#888; margin-bottom:60px; }
  .cover-hospital { font-size:28pt; font-weight:900; color:#155855; margin-bottom:12px; word-break:keep-all; }
  .cover-subtitle { font-size:16pt; font-weight:700; color:#E85D2C; margin-bottom:40px; }
  .cover-meta { display:flex; flex-direction:column; gap:10px; background:#F0F9F8; border:1px solid #C8DDD9; border-radius:12px; padding:24px 40px; margin-bottom:40px; min-width:320px; text-align:left; }
  .cover-meta-row { display:flex; align-items:center; gap:16px; font-size:10pt; }
  .cover-meta-label { color:#888; font-size:9pt; min-width:60px; }
  .cover-meta-value { font-weight:700; color:#222; }
  .cover-bar { width:60px; height:4px; background:#E85D2C; border-radius:2px; margin:0 auto; }
  .cover-toc { margin-top:20px; display:flex; gap:20px; }
  .cover-toc-item { background:#fff; border:1px solid #C8DDD9; border-radius:8px; padding:10px 18px; font-size:9pt; color:#155855; font-weight:700; }

  /* 페이지 나누기 */
  .page-break { page-break-before:always; margin-top:0; }

  /* 인쇄 설정 */
  @media print {
    @page { margin:6mm 8mm; size: A4 landscape; }
    @page :first { margin-top:8mm; }
    body { font-size:8pt; }
    .no-print { display:none; }
  }

  /* 인쇄 버튼 */
  .print-btn {
    position:fixed; top:16px; right:16px;
    background:#155855; color:#fff; border:none;
    padding:10px 20px; border-radius:8px; font-family:inherit;
    font-size:13pt; font-weight:700; cursor:pointer; z-index:999;
  }
  .print-btn:hover { background:#0e3f3c; }

  /* 하단 요약 */
  .summary { background:#F0F9F8; border:1px solid #C8DDD9; border-radius:6px; padding:8px 12px; margin-top:10px; font-size:8pt; color:#155855; }
</style>
</head>
<body>

<div class="no-print edit-bar">
  <div class="edit-bar-title">📝 최종 확인 및 편집</div>
  <div class="edit-bar-desc">인쇄 전 내용을 직접 클릭하여 수정할 수 있습니다. 파란색 밑줄 항목은 편집 가능합니다.</div>
  <button class="print-btn" onclick="window.print()">🖨️ PDF 저장 / 인쇄</button>
</div>

<!-- ① 표지 -->
<div class="pdf-page cover">
  <div class="cover-logo" contenteditable="true">PHOTO CLINIC</div>
  <div class="cover-logo-sub" contenteditable="true">병원 브랜딩 포토그래피</div>
  <div class="cover-bar" style="margin-bottom:40px"></div>
  <div class="cover-hospital" contenteditable="true">${hospitalName}</div>
  <div class="cover-subtitle" contenteditable="true">브랜드촬영 콘티</div>
  <div class="cover-meta">
    <div class="cover-meta-row">
      <span class="cover-meta-label">촬영일자</span>
      <span class="cover-meta-value" contenteditable="true" style="min-width:160px;display:inline-block" data-placeholder="날짜 입력">　</span>
    </div>
    <div class="cover-meta-row">
      <span class="cover-meta-label">진료과</span>
      <span class="cover-meta-value" contenteditable="true">${specialties}</span>
    </div>
    <div class="cover-meta-row">
      <span class="cover-meta-label">컨셉</span>
      <span class="cover-meta-value" contenteditable="true">${result.conti.length}컨셉</span>
    </div>
    <div class="cover-meta-row">
      <span class="cover-meta-label">작성일</span>
      <span class="cover-meta-value" contenteditable="true">${today}</span>
    </div>
  </div>
  <div class="cover-toc">
    <div class="cover-toc-item" contenteditable="true">📋 &nbsp;촬영 콘티</div>
    <div class="cover-toc-item" contenteditable="true">✅ &nbsp;준비 체크리스트</div>
    <div class="cover-toc-item" contenteditable="true">⏰ &nbsp;타임테이블</div>
  </div>
</div>

<!-- ② 촬영 콘티 -->
<div class="pdf-page page-break">
${header("촬영 콘티")}
<div class="section">
  <p class="section-meta">진료과: ${specialties} &nbsp;·&nbsp; 총 ${result.conti.length}컷</p>
  <table>
    <thead>
      <tr>
        <th style="width:55px">진료과</th>
        <th style="width:36px">소요<br/>시간</th>
        <th style="width:48px">장소</th>
        <th style="width:140px">카메라 구도</th>
        <th style="width:110px">키워드</th>
        <th style="width:170px">설명</th>
        <th style="width:110px">필요인원/환자역할</th>
        <th style="width:38px">비고</th>
      </tr>
    </thead>
    <tbody>${contiRows}</tbody>
  </table>
</div>
</div>

<!-- ③ 준비 체크리스트 -->
<div class="pdf-page page-break">
${header("준비 체크리스트")}
<div class="section">
  <p class="section-meta">총 ${result.checklist.length}개 항목</p>
  <table>
    <thead>
      <tr>
        <th style="width:26px">#</th>
        <th style="width:130px">분류</th>
        <th>체크리스트 항목</th>
        <th style="width:40px">준비<br/>여부</th>
        <th style="width:55px">비고</th>
      </tr>
    </thead>
    <tbody>${checkRows}</tbody>
  </table>
</div>
</div>

<!-- ④ 타임테이블 -->
<div class="pdf-page page-break">
${header("타임테이블")}
<div class="section">
  <p class="section-meta">총 ${result.schedule.length}개 일정</p>
  <table>
    <thead>
      <tr>
        <th style="width:95px">시간</th>
        <th style="width:100px">내용</th>
        <th style="width:45px">구분</th>
        <th>요청사항</th>
        <th style="width:45px">비고</th>
      </tr>
    </thead>
    <tbody>${schedRows}</tbody>
  </table>
</div>
</div>

<script>
  // 열 너비 드래그 조절
  document.querySelectorAll('table').forEach(table => {
    const ths = Array.from(table.querySelectorAll('th'));
    ths.forEach((th, i) => {
      if (i === ths.length - 1) return;
      const handle = document.createElement('div');
      handle.className = 'col-resize';
      handle.title = '드래그하여 열 너비 조절';
      th.appendChild(handle);

      handle.addEventListener('mousedown', e => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = th.offsetWidth;
        handle.classList.add('dragging');

        const onMove = e => {
          const newW = Math.max(24, startW + (e.clientX - startX));
          th.style.width = newW + 'px';
        };
        const onUp = () => {
          handle.classList.remove('dragging');
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    });
  });
</script>
</body>
</html>`;

    const sourceId = savedContiId || await saveConti({ silent: true });
    if (!sourceId) {
      alert("콘티 DB 저장에 실패해 PDF 원본을 만들지 못했습니다.");
      return;
    }

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.left = "-12000px";
    iframe.style.top = "0";
    iframe.style.width = "1123px";
    iframe.style.height = "794px";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
      await new Promise<void>((resolve, reject) => {
        iframe.onload = () => resolve();
        iframe.onerror = () => reject(new Error("콘티 PDF 문서를 준비하지 못했습니다."));
        iframe.srcdoc = html;
      });
      const doc = iframe.contentDocument;
      if (!doc) throw new Error("콘티 PDF 문서를 읽지 못했습니다.");
      if (doc.fonts?.ready) await doc.fonts.ready;
      const pages = Array.from(doc.querySelectorAll<HTMLElement>(".pdf-page"));
      if (!pages.length) throw new Error("콘티 PDF 페이지를 찾지 못했습니다.");

      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
      for (const [index, page] of pages.entries()) {
        const canvas = await html2canvas(page, { scale: 1.6, backgroundColor: "#ffffff", useCORS: true, logging: false });
        const pageWidth = 289;
        const pageHeight = 202;
        const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
        const imageWidth = canvas.width * ratio;
        const imageHeight = canvas.height * ratio;
        if (index > 0) pdf.addPage("a4", "landscape");
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", (297 - imageWidth) / 2, (210 - imageHeight) / 2, imageWidth, imageHeight);
      }

      const fileName = `${hospitalName}_포토클리닉_촬영콘티_${new Date().toISOString().slice(0, 10)}.pdf`;
      const pageParams = new URLSearchParams(window.location.search);
      const artifactBlob = pdf.output("blob");
      // 실제 다운로드가 핵심 동작이라 먼저 처리한다 — 워크플로우 문서함 백업 저장(아래)은
      // 고객 연결에 실패해도(고객관리에 없는 병원명 등) 다운로드 자체를 막으면 안 된다.
      pdf.save(fileName);
      try {
        await uploadWorkflowArtifact({
          file: artifactBlob,
          fileName,
          documentType: "conti",
          sourceTable: "conti_saves",
          sourceId,
          title: resultTitle || `${hospitalName} 촬영 콘티`,
          hospitalName,
          clientId: pageParams.get("client_id") || pageParams.get("clientId"),
          workflowRunId: pageParams.get("workflowRunId"),
        });
      } catch (artifactError) {
        console.warn("[conti] 워크플로우 문서함 백업 저장 실패(다운로드는 완료됨):", artifactError);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : "콘티 PDF 생성에 실패했습니다.");
    } finally {
      iframe.remove();
    }
  };

    /* ── Excel 다운로드 (열너비 적용, 3시트) ── */
  const handleSpreadsheetDownload = async () => {
    if (!result) return;
    const XLSX = await import("xlsx");
    const hospitalName = form.hospitalName || "병원";

    const styleSheet = (ws: any, colWidths: number[]) => {
      ws["!cols"] = colWidths.map(w => ({ wch: w }));
      return ws;
    };

    const contiWs = styleSheet(XLSX.utils.aoa_to_sheet([
      ["진료과","소요시간","장소","카메라 구도","키워드","설명","필요인원/환자역할","비고"],
      ...result.conti.map(r => [r.category,r.duration,r.location,r.cameraAngle,r.keyword,r.description,r.personnel,r.notes])
    ]), [14,8,14,22,18,40,26,14]);

    const checkWs = styleSheet(XLSX.utils.aoa_to_sheet([
      ["번호","분류","체크리스트 항목","준비여부","비고"],
      ...result.checklist.map(r => [r.number,r.category,r.item,"☐",r.notes])
    ]), [6,16,50,10,20]);

    const schedWs = styleSheet(XLSX.utils.aoa_to_sheet([
      ["시간","내용","구분","요청사항","비고"],
      ...result.schedule.map(r => [r.time,r.activity,r.type,r.requirements,r.notes])
    ]), [22,30,14,28,16]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, contiWs, "촬영콘티");
    XLSX.utils.book_append_sheet(wb, checkWs, "준비체크리스트");
    XLSX.utils.book_append_sheet(wb, schedWs, "타임테이블");
    XLSX.writeFile(wb, `${hospitalName}_촬영콘티.xlsx`);
  };

  /* ════════════════════════════════
     렌더
  ════════════════════════════════ */
  return (
    <>
    <div style={isModal ? { background: "rgba(237,247,241,.82)" } : { minHeight: "100vh", background: "rgba(237,247,241,.82)" }}>
      {isModal ? (
        <div style={{ padding: "8px 24px 0", fontSize: 11.5, fontWeight: 700, color: autoSaveState === "error" ? "#DC2626" : "#5a7470" }}>
          {autoSaveState === "saving" ? "저장 중..." : autoSaveState === "saved" ? "저장됨" : dirty ? "저장 안 된 변경사항 있음" : ""}
        </div>
      ) : null}
      {isModal && modalWorkflowRunId ? (
        <div style={{ padding: "10px 24px 0" }}>
          <ActiveMissionBar workflowRunId={modalWorkflowRunId} />
        </div>
      ) : null}
      <div style={{
        width: "100%",
        maxWidth: pageMode === "portrait" ? 1000 : (result && !fieldView ? 1880 : 1100),
        margin: "0 auto",
        padding: "36px 24px",
        boxSizing: "border-box",
      }}>

        {/* ══ 모드 전환: 콘티 작성 / 초상권 작성 ══ */}
        <div className="pc-tabs" style={{ marginBottom: 24 }}>
          {([
            { key: "conti",    label: "촬영 콘티 작성", Icon: ClipboardList },
            { key: "portrait", label: "초상권 동의서",   Icon: FileSignature },
          ] as const).map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setPageMode(key)} className={`pc-tab${pageMode === key ? " pc-tab--active" : ""}`}>
              <Icon size={13} />{label}
            </button>
          ))}
        </div>

        {pageMode === "portrait" && (
          <PortraitConsentPanel clientId={urlClientId} workflowRunId={urlWorkflowRunId} hospitalName={form.hospitalName} />
        )}

        {/* ══ 입력 폼 ══ */}
        {pageMode === "conti" && !result && (
          <ContiSetupForm
            form={form}
            loading={loading}
            error={error}
            pdfLoading={pdfLoading}
            pdfError={pdfError}
            pdfInputRef={pdfInputRef}
            quickSpecialties={quickSpecialties}
            quickLoading={quickLoading}
            quickError={quickError}
            specialtyOptions={SPECIALTY_OPTIONS}
            staffRolePresets={STAFF_ROLE_PRESETS}
            patientTypePresets={PATIENT_TYPE_PRESETS}
            onSubmit={handleGenerate}
            onFieldChange={set}
            onPdfImport={handlePdfImport}
            onOpenLoad={openLoadPanel}
            onQuickSpecialtiesChange={setQuickSpecialties}
            onQuickGenerate={handleQuickGenerate}
          />
        )}
        {/* ══ 결과 ══ */}
        {pageMode === "conti" && result && !fieldView && (
          <section>
            <ContiSummaryBar title={resultTitle} form={form} rows={result.conti} />
            {/* 결과 헤더 */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 14, marginBottom: 20 }}>
              <div>
                <p className="admin-kicker">생성 완료</p>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    value={resultTitle}
                    onChange={e => setResultTitle(e.target.value)}
                    placeholder="제목 입력 (예: 포토클리닉 촬영 콘티)"
                    style={{
                      fontSize: 19, fontWeight: 800, color: "var(--deep-green)",
                      fontFamily: "inherit",
                      border: "none", borderBottom: "2px solid transparent", background: "transparent",
                      outline: "none", padding: "0 4px",
                      width: "100%", display: "block",
                    }}
                    onFocus={e => (e.target.style.borderBottomColor = "var(--deep-green)")}
                    onBlur={e => (e.target.style.borderBottomColor = "transparent")}
                  />
                  <Pencil size={14} style={{ color: "#9ca3af", opacity: 0.5, flexShrink: 0 }} />
                </div>
                <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 13 }}>{form.specialties.join(" · ")}</p>
              </div>
              <ContiExportActions
                saveLoading={saveLoading}
                autoSaveState={autoSaveState}
                shareLoading={shareLoading}
                shareCopied={shareCopied}
                generatingImages={generatingImages}
                downloadMenuOpen={showDownloadMenu}
                completeState={completeState}
                completeError={completeError}
                onReset={() => setResult(null)}
                onFieldView={() => setFieldView(true)}
                onShare={handleShare}
                onGenerateImages={() => generateSceneImages(result.conti)}
                onSave={handleSaveJSON}
                onToggleDownloadMenu={() => setShowDownloadMenu((value) => !value)}
                onPDF={() => { setShowDownloadMenu(false); handlePDF(); }}
                onExcel={() => { setShowDownloadMenu(false); handleSpreadsheetDownload(); }}
                onCompleteWorkflow={completeContiStep}
              />
            </div>

            {/* 이미지 오류 */}
            {imageError && (
              <div style={{ padding: "8px 12px", background: "#fff0f0", border: "1px solid #fcccc", borderRadius: 8, fontSize: 12, color: "#dc2626", marginBottom: 8 }}>
                씬 이미지 생성 오류: {imageError}
              </div>
            )}
            {/* 공유 URL 배너 */}
            {shareUrl && (
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                background: "rgba(21,88,85,0.05)", border: "1px solid rgba(21,88,85,0.15)",
                borderRadius: 8, padding: "10px 14px", fontSize: 13,
                marginBottom: 12, flexWrap: "wrap",
              }}>
                <Link2 size={15} color="#155855" />
                <span style={{ color: "#155855", fontWeight: 700 }}>공유 링크:</span>
                <a href={shareUrl} target="_blank" rel="noopener noreferrer"
                  style={{ color: "#155855", textDecoration: "underline", wordBreak: "break-all", flex: 1 }}>
                  {shareUrl}
                </a>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(shareUrl);
                    setShareCopied(true);
                    setTimeout(() => setShareCopied(false), 2000);
                  }}
                  style={{
                    padding: "4px 12px", border: "1px solid rgba(21,88,85,0.3)",
                    borderRadius: 6, background: "#fff", color: "#155855",
                    fontWeight: 700, fontSize: 12, cursor: "pointer",
                  }}>
                  복사
                </button>
              </div>
            )}
            {/* 편집 안내 */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "rgba(21,88,85,0.06)", border: "1px solid rgba(21,88,85,0.14)",
              borderRadius: 6, padding: "6px 12px", fontSize: 12, color: "#155855",
              fontWeight: 700, marginBottom: 16
            }}>
              <Pencil size={13} /> 셀 클릭 즉시 편집 · ⠿ 핸들로 드래그하여 순서 변경
            </div>

            {/* 탭 — OLIVIA OS 1차 작업 지시서 4단계는 OS 창(isDesktopWindow)에만 적용된다.
                OS 창에서는 씬 편집(3단 레이아웃)에 체크리스트가 딸려 들어가 "준비 체크리스트"
                탭이 필요 없다. 타임테이블/씬 참고는 3단 레이아웃에 넣을 자리가 없어(승인받은
                안) 그대로 상단 탭으로 남긴다. ClientsWorkspace.tsx의 기존 콘티 툴 모달은
                isDesktopWindow가 false라 원래 4탭 그대로 유지된다 — 그쪽에서 체크리스트 탭이
                사라지면 기존 기능이 없어지는 셈이라 반드시 구분해야 한다. */}
            <div className="pc-tabs" style={{ marginLeft: -24, marginRight: -24, marginBottom: 16 }}>
              {(isDesktopWindow ? [
                { key: "conti",     label: "씬 편집",     Icon: ClipboardList },
                { key: "schedule",  label: "타임테이블",   Icon: Clock },
                { key: "scenes",    label: "씬 참고",      Icon: ImageIcon },
              ] as const : [
                { key: "conti",     label: "촬영 콘티",       Icon: ClipboardList },
                { key: "scenes",    label: "촬영 씬(참고용)",  Icon: ImageIcon },
                { key: "checklist", label: "준비 체크리스트", Icon: CheckSquare },
                { key: "schedule",  label: "타임테이블",       Icon: Clock },
              ] as const).map(({ key, label, Icon }) => (
                <button key={key} onClick={() => setTab(key)} className={`pc-tab${tab === key ? " pc-tab--active" : ""}`}>
                  <Icon size={13} />{label}
                </button>
              ))}
            </div>

            {/* 테이블 */}
            <div ref={printRef} style={{ background: "#fff", borderRadius: 8, border: "1px solid rgba(21,88,85,0.12)", overflow: "hidden" }}>

              {/* ── 촬영 콘티 / 씬 편집 ── */}
              {tab === "conti" && (isDesktopWindow ? (() => {
                const rows = result.conti;
                const activeIndex = rows.length
                  ? Math.max(0, rows.findIndex((row, i) => (row.id || `shot:${i + 1}`) === selectedOliviaEntityId))
                  : -1;
                const activeRow = activeIndex >= 0 ? rows[activeIndex] : undefined;
                const totalMinutes = rows.reduce((sum, row) => {
                  const match = row.duration?.match(/\d+/);
                  return sum + (match ? Number(match[0]) : 0);
                }, 0);
                const totalLabel = totalMinutes >= 60
                  ? `${Math.floor(totalMinutes / 60)}시간${totalMinutes % 60 ? ` ${totalMinutes % 60}분` : ""}`
                  : `${totalMinutes}분`;
                const wide = contiEditorWidth >= 900;
                const useDrawer = contiEditorWidth < 700;
                // 지시서 §4단계 "반응형 규칙" — 900px 미만이면 우측 패널이 기본으로 접힌 상태가
                // 되고, 같은 토글로 (좁은 화면에서는) 오버레이 서랍으로 다시 열 수 있다.
                const rightPanelOpen = wide ? !contiRightPanelCollapsed : contiRightPanelCollapsed;

                const sceneListNode = (
                  <div style={{ width: useDrawer ? 240 : 200, flexShrink: 0, borderRight: "1px solid rgba(21,88,85,.12)", display: "flex", flexDirection: "column", background: "#fafaf8", height: "100%" }}>
                    <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(21,88,85,.1)", fontSize: 11.5, fontWeight: 800, color: "#5A7470" }}>
                      씬 {rows.length}개 · 예상 {totalMinutes > 0 ? totalLabel : "-"}
                    </div>
                    <div style={{ flex: 1, overflowY: "auto" }}>
                      {rows.map((row, index) => {
                        const id = row.id || `shot:${index + 1}`;
                        const selected = index === activeIndex;
                        const thumb = sceneImages[String(index)];
                        return (
                          <button
                            key={id}
                            type="button"
                            draggable
                            onDragStart={() => handleContiDragStart(index)}
                            onDragOver={(event) => handleContiDragOver(event, index)}
                            onDrop={() => handleContiDrop(index)}
                            onDragEnd={handleDragEnd}
                            onClick={() => { selectContiScene(id); if (useDrawer) setContiLeftDrawerOpen(false); }}
                            style={{
                              display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px",
                              border: 0, borderBottom: "1px solid rgba(21,88,85,.06)",
                              background: selected ? "#EAF4F2" : "transparent",
                              borderLeft: selected ? "3px solid #E85D2C" : "3px solid transparent",
                              cursor: "grab", textAlign: "left", fontFamily: "inherit",
                            }}
                          >
                            {thumb ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={thumb} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: 36, height: 36, borderRadius: 6, flexShrink: 0, background: row.color || "#155855" }} />
                            )}
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 800, color: "#1c2b28", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {index + 1}. {row.keyword || "이름 없음"}
                              </div>
                              <div style={{ fontSize: 11, color: "#8a8377", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {row.cameraAngle || "구도 미입력"} · {row.duration || "-"}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ padding: "8px 10px", borderTop: "1px dashed rgba(21,88,85,.15)" }}>
                      <button type="button" onClick={addContiRow} style={{
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 5, width: "100%",
                        padding: "6px 12px", border: "1px dashed rgba(21,88,85,.3)", borderRadius: 6,
                        background: "transparent", color: "#155855", fontSize: 12, fontWeight: 800, cursor: "pointer",
                      }}>
                        <Plus size={13} /> 씬 추가
                      </button>
                    </div>
                  </div>
                );

                const rightPanelNode = (
                  <div style={{ width: 210, flexShrink: 0, display: "flex", flexDirection: "column", background: "#fff", height: "100%" }}>
                    <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(21,88,85,.1)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 11.5, fontWeight: 800, color: "#5A7470" }}>{activeIndex >= 0 ? `씬 ${activeIndex + 1} 설정` : "씬 설정"}</span>
                      {/* rightPanelOpen = wide ? !collapsed : collapsed 라서, "닫기"는 wide일
                          때 collapsed=true, narrow(서랍)일 때는 collapsed=false여야 한다 —
                          단순히 true로 고정하면 서랍 모드에서 오히려 안 닫히는 버그가 된다. */}
                      <button type="button" onClick={() => setContiRightPanelCollapsed(wide)} title="패널 접기" style={{ border: 0, background: "transparent", cursor: "pointer", color: "#8a8377" }}>
                        <Minus size={14} />
                      </button>
                    </div>
                    {activeRow && (
                      // maxHeight 없이 두면 이 필드 묶음이 flex column에서 "자연 높이"를 그대로
                      // 차지해버려서, 아래 flex:1인 체크리스트 영역이 남는 공간이 없어(브라우저
                      // 확인 중 발견) 사실상 안 보이는 버그가 있었다 — 여기를 캡 걸고 자체
                      // 스크롤시켜서 체크리스트에 항상 최소 공간을 보장한다.
                      <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", maxHeight: 300, flexShrink: 0 }}>
                        {([
                          ["keyword", "씬 이름"], ["category", "분류"], ["duration", "소요시간"],
                          ["location", "장소"], ["cameraAngle", "구도"], ["personnel", "인원"],
                        ] as const).map(([field, label]) => (
                          <label key={field} style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, fontWeight: 700, color: "#5A7470" }}>
                            {label}
                            <input
                              value={activeRow[field] ?? ""}
                              onChange={(event) => updateConti(activeIndex, field, event.target.value)}
                              style={{ padding: "6px 8px", border: "1px solid rgba(21,88,85,.16)", borderRadius: 6, fontSize: 12.5, fontFamily: "inherit", color: "#1c2b28" }}
                            />
                          </label>
                        ))}
                        <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, fontWeight: 700, color: "#5A7470" }}>
                          설명
                          <textarea
                            value={activeRow.description ?? ""}
                            onChange={(event) => updateConti(activeIndex, "description", event.target.value)}
                            rows={3}
                            style={{ padding: "6px 8px", border: "1px solid rgba(21,88,85,.16)", borderRadius: 6, fontSize: 12.5, fontFamily: "inherit", resize: "vertical", color: "#1c2b28" }}
                          />
                        </label>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button type="button" onClick={() => dupContiRow(activeIndex)} style={{
                            flex: 1, padding: "6px 0", borderRadius: 6, border: "1px solid rgba(21,88,85,.25)",
                            background: "#fff", color: "#155855", fontSize: 11.5, fontWeight: 800, cursor: "pointer",
                          }}>씬 복제</button>
                          <button type="button" onClick={() => delContiRow(activeIndex, activeRow.id || `shot:${activeIndex + 1}`)} style={{
                            flex: 1, padding: "6px 0", borderRadius: 6, border: "1px solid rgba(220,38,38,.3)",
                            background: "#fff", color: "#dc2626", fontSize: 11.5, fontWeight: 800, cursor: "pointer",
                          }}>씬 삭제</button>
                        </div>
                      </div>
                    )}
                    <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(21,88,85,.1)", fontSize: 11.5, fontWeight: 800, color: "#5A7470" }}>
                      준비 체크리스트
                    </div>
                    <div style={{ flex: 1, minHeight: 120, overflow: "auto" }}>
                      <ContiChecklist
                        rows={result.checklist}
                        dragOverIndex={dragOver?.type === "checklist" ? dragOver.index : undefined}
                        onUpdate={updateChecklist}
                        onColor={updateChecklistColor}
                        onAdd={addChecklistRow}
                        onDelete={delChecklistRow}
                        onClear={clearChecklist}
                        onDragStart={(index) => handleDragStart("checklist", index)}
                        onDragOver={(event, index) => handleDragOver(event, "checklist", index)}
                        onDrop={(index) => handleDrop("checklist", index)}
                        onDragEnd={handleDragEnd}
                      />
                    </div>
                  </div>
                );

                return (
                  <div ref={contiEditorRef} style={{ display: "flex", height: 560, position: "relative" }}>
                    {useDrawer ? (
                      <>
                        <button type="button" onClick={() => setContiLeftDrawerOpen(true)} style={{
                          position: "absolute", top: 8, left: 8, zIndex: 5, padding: "6px 10px", borderRadius: 6,
                          border: "1px solid rgba(21,88,85,.2)", background: "#fff", fontSize: 11.5, fontWeight: 800, color: "#155855", cursor: "pointer",
                        }}>
                          ☰ 씬 목록
                        </button>
                        {contiLeftDrawerOpen && (
                          <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex" }}>
                            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.25)" }} onClick={() => setContiLeftDrawerOpen(false)} />
                            <div style={{ position: "relative" }}>{sceneListNode}</div>
                          </div>
                        )}
                      </>
                    ) : sceneListNode}

                    {/* 중앙 — 선택된 씬의 그리기 캔버스 + 도구바 */}
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderBottom: "1px solid rgba(21,88,85,.1)", flexWrap: "wrap" }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          {PEN_TYPES.map(({ key, label, icon }) => (
                            <button key={key} title={label} onClick={() => { setPenType(key as "pen" | "marker" | "highlighter" | "brush"); setIsEraser(false); }} style={{
                              height: 28, padding: "0 8px", borderRadius: 6,
                              background: !isEraser && penType === key ? "#155855" : "#f2f2f0",
                              border: `1.5px solid ${!isEraser && penType === key ? "#E85D2C" : "transparent"}`,
                              color: !isEraser && penType === key ? "#fff" : "#5A7470", fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                            }}>{icon} {label}</button>
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                          {(isEraser ? ERASER_SIZES : [2, 4, 8]).map((size) => {
                            const dot = isEraser ? Math.min(24, 10 + size / 3) : size + 12;
                            return (
                              <button key={size} title={`굵기 ${size}`} onClick={() => (isEraser ? setEraserSize(size) : setPenSize(size))} style={{
                                width: dot, height: dot, borderRadius: "50%",
                                background: (isEraser ? eraserSize : penSize) === size ? "#155855" : "#e2ded4",
                                border: (isEraser ? eraserSize : penSize) === size ? "2px solid #E85D2C" : "2px solid transparent",
                                cursor: "pointer", flexShrink: 0,
                              }} />
                            );
                          })}
                        </div>
                        <button type="button" onClick={() => setIsEraser((v) => !v)} title="지우개" style={{
                          width: 28, height: 28, borderRadius: 6,
                          background: isEraser ? "#E85D2C" : "#f2f2f0", border: 0, cursor: "pointer",
                        }}>🧹</button>
                        <button type="button" onClick={() => drawCanvasRef.current?.undo()} title="되돌리기" style={{
                          width: 28, height: 28, borderRadius: 6, background: "#f2f2f0", border: 0, cursor: "pointer",
                        }}>↩️</button>
                        <div style={{ display: "flex", gap: 3 }}>
                          {DRAW_COLORS.slice(0, 8).map(({ color, label }) => (
                            <button key={color} title={label} onClick={() => { setPenColor(color); setIsEraser(false); }} style={{
                              width: 18, height: 18, borderRadius: "50%", background: color, cursor: "pointer",
                              border: !isEraser && penColor === color ? "2px solid #E85D2C" : "2px solid rgba(0,0,0,.08)",
                            }} />
                          ))}
                        </div>
                        {!wide && (
                          <button type="button" onClick={() => setContiRightPanelCollapsed((v) => !v)} style={{
                            padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(21,88,85,.2)",
                            background: "#fff", fontSize: 11.5, fontWeight: 800, color: "#155855", cursor: "pointer",
                          }}>
                            설정 ▸
                          </button>
                        )}
                        <button type="button" onClick={saveDrawing} disabled={drawSaveState === "saving"} style={{
                          marginLeft: wide ? "auto" : 0, padding: "5px 12px", borderRadius: 6, fontSize: 11.5, fontWeight: 800, cursor: "pointer",
                          border: `1.5px solid ${drawSaveState === "saved" ? "#4CAF50" : drawSaveState === "error" ? "#DC2626" : "rgba(21,88,85,.3)"}`,
                          background: "#fff", color: drawSaveState === "saved" ? "#4CAF50" : drawSaveState === "error" ? "#DC2626" : "#155855",
                        }}>
                          {drawSaveState === "saving" ? "저장 중…" : drawSaveState === "saved" ? "✓ 저장됨" : drawSaveState === "error" ? "저장 실패" : "💾 저장"}
                        </button>
                      </div>
                      <div style={{ flex: 1, minHeight: 0, position: "relative", background: "#fff" }}>
                        <DrawingCanvas
                          ref={drawCanvasRef}
                          penType={penType}
                          penSize={penSize}
                          penColor={penColor}
                          isEraser={isEraser}
                          eraserSize={eraserSize}
                          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
                        />
                      </div>
                    </div>

                    {/* 우측 — 선택된 씬 설정 + 전체 체크리스트 */}
                    {wide ? (
                      rightPanelOpen && <div style={{ borderLeft: "1px solid rgba(21,88,85,.12)" }}>{rightPanelNode}</div>
                    ) : (
                      rightPanelOpen && (
                        <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", justifyContent: "flex-end" }}>
                          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.25)" }} onClick={() => setContiRightPanelCollapsed(false)} />
                          <div style={{ position: "relative", borderLeft: "1px solid rgba(21,88,85,.12)", boxShadow: "-8px 0 24px rgba(0,0,0,.12)" }}>{rightPanelNode}</div>
                        </div>
                      )
                    )}
                  </div>
                );
              })() : (
                <ContiSceneTable
                  rows={result.conti}
                  selectedSceneId={selectedOliviaEntityId}
                  dragOverIndex={dragOver?.type === "conti" ? dragOver.index : undefined}
                  onSelect={selectContiScene}
                  onUpdate={updateConti}
                  onColor={updateContiColor}
                  onDuplicate={dupContiRow}
                  onDelete={delContiRow}
                  onAdd={addContiRow}
                  onDragStart={handleContiDragStart}
                  onDragOver={handleContiDragOver}
                  onDrop={handleContiDrop}
                  onDragEnd={handleDragEnd}
                />
              ))}

              {/* ── 체크리스트 ── */}
              {/* ══ 씬 참고 탭 ══ */}
              {tab === "scenes" && result && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: "#5A7470" }}>
                      촬영 씬 구성 한눈에 보기 — 총 {result.conti.length}컷
                    </div>
                    <button
                      onClick={() => {
                        const sceneList = result.conti.map((r, i) =>
                          "씬" + (i+1) + ". [" + r.category + "] " + r.location + " / " + r.keyword + " / " + r.duration + "\n  설명: " + r.description + "\n  인원: " + r.personnel
                        ).join("\n\n");
                        const prompt = [
                          "아래 병원 촬영 콘티를 보고, 각 씬을 일러스트 스타일의 스토리보드로 그려주세요.",
                          "",
                          "스타일:",
                          "- 수채화 스케치 일러스트",
                          "- 따뜻한 베이지/화이트 톤",
                          "- 한국 병원 환경, 전문적이고 친근한 분위기",
                          "- 씬 번호와 제목 포함",
                          "- 진료과별로 행을 구분한 가로형 스토리보드 한 장",
                          "",
                          "씬 목록:",
                          sceneList
                        ].join("\n");
                        navigator.clipboard.writeText(prompt);
                        alert("✅ ChatGPT 프롬프트 복사 완료! ChatGPT에 붙여넣기 하세요.");
                      }}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "0 16px", height: 36, borderRadius: 8,
                        border: "1.5px solid #155855", background: "#EAF4F2",
                        color: "#155855", fontWeight: 900, fontSize: 12,
                        cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      📋 ChatGPT 프롬프트 복사
                    </button>
                  </div>
                  {/* 진료과별 그룹 */}
                  {(() => {
                    const groups: Record<string, { row: typeof result.conti[0]; idx: number }[]> = {};
                    result.conti.forEach((row, idx) => {
                      const cat = row.category || "기타";
                      if (!groups[cat]) groups[cat] = [];
                      groups[cat].push({ row, idx });
                    });
                    return Object.entries(groups).map(([cat, items]) => (
                      <div key={cat} style={{ marginBottom: 28 }}>
                        {/* 진료과 헤더 */}
                        <div style={{
                          display: "inline-flex", alignItems: "center",
                          background: "#155855", color: "#fff",
                          padding: "4px 14px", borderRadius: 6,
                          fontSize: 12, fontWeight: 900, marginBottom: 12,
                        }}>{cat}</div>
                        {/* 씬 카드 그리드 */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
                          {items.map(({ row, idx }) => (
                            <div key={idx} style={{
                              background: "#fff", border: "1px solid rgba(21,88,85,.1)",
                              borderRadius: 12, overflow: "hidden",
                              boxShadow: "0 1px 6px rgba(0,0,0,.05)",
                            }}>
                              {/* 이미지 or 컬러바 */}
                              {sceneImages[String(idx)] ? (
                                <div style={{ position: "relative" }}>
                                  <img src={sceneImages[String(idx)]} alt={`씬${idx+1}`} style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }} />
                                  <div style={{ position: "absolute", top: 6, left: 6, background: "#E85D2C", color: "#fff", fontSize: 11, fontWeight: 900, padding: "2px 7px", borderRadius: 4 }}>씬 {idx+1}</div>
                                  <div style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,.5)", color: "#fff", fontSize: 11, padding: "2px 7px", borderRadius: 4 }}>⏱ {row.duration}</div>
                                </div>
                              ) : (
                                <div style={{
                                  background: "linear-gradient(135deg,#155855,#1e7870)",
                                  padding: "10px 12px",
                                  display: "flex", justifyContent: "space-between", alignItems: "center",
                                }}>
                                  <span style={{ fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,.7)", letterSpacing: ".1em" }}>씬 {String(idx + 1).padStart(2, "0")}</span>
                                  <span style={{ fontSize: 11, color: "rgba(255,255,255,.8)" }}>⏱ {row.duration}</span>
                                </div>
                              )}
                              {/* 씬 내용 */}
                              <div style={{ padding: "10px 12px" }}>
                                <div style={{ fontSize: 13, fontWeight: 900, color: "#E85D2C", marginBottom: 4, lineHeight: 1.3 }}>
                                  {row.keyword}
                                </div>
                                <div style={{ fontSize: 11, color: "#374151", marginBottom: 6, lineHeight: 1.5 }}>
                                  {row.description?.slice(0, 60)}{(row.description?.length || 0) > 60 ? "..." : ""}
                                </div>
                                <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
                                  <div style={{ fontSize: 11, color: "#6b7280" }}>📍 {row.location}</div>
                                  <div style={{ fontSize: 11, color: "#6b7280" }}>👥 {row.personnel?.slice(0, 40)}{(row.personnel?.length || 0) > 40 ? "..." : ""}</div>
                                  {row.cameraAngle && <div style={{ fontSize: 11, color: "#6b7280" }}>📷 {row.cameraAngle?.slice(0, 30)}</div>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}

              {tab === "checklist" && (
                <ContiChecklist
                  rows={result.checklist}
                  dragOverIndex={dragOver?.type === "checklist" ? dragOver.index : undefined}
                  onUpdate={updateChecklist}
                  onColor={updateChecklistColor}
                  onAdd={addChecklistRow}
                  onDelete={delChecklistRow}
                  onClear={clearChecklist}
                  onDragStart={(index) => handleDragStart("checklist", index)}
                  onDragOver={(event, index) => handleDragOver(event, "checklist", index)}
                  onDrop={(index) => handleDrop("checklist", index)}
                  onDragEnd={handleDragEnd}
                />
              )}

              {/* ── 타임테이블 ── */}
              {tab === "schedule" && (
                <ContiSchedule
                  rows={result.schedule}
                  dragOverIndex={dragOver?.type === "schedule" ? dragOver.index : undefined}
                  onUpdate={updateSchedule}
                  onAdd={addScheduleRow}
                  onDelete={delScheduleRow}
                  onDragStart={(index) => handleDragStart("schedule", index)}
                  onDragOver={(event, index) => handleDragOver(event, "schedule", index)}
                  onDrop={(index) => handleDrop("schedule", index)}
                  onDragEnd={handleDragEnd}
                />
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
              <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>
                <FileText size={12} style={{ display: "inline", marginRight: 4 }} />
                PDF는 현재 탭 기준, Excel은 3개 탭(촬영콘티·체크리스트·타임테이블) 전체를 한 파일로 저장합니다.
              </p>
            </div>
          </section>
        )}

        {/* ══ 아이패드 현장 뷰 ══ */}
        {pageMode === "conti" && result && fieldView && (
          <div style={{ position: "fixed", inset: 0, background: "#EDF5F3", zIndex: 200, overflow: "hidden", display: "flex", flexDirection: "column" }}>

            {/* 현장 뷰 헤더 */}
            <div style={{
              flexShrink: 0, zIndex: 310,
              background: "#155855", padding: "14px 24px",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
              boxShadow: "0 2px 12px rgba(21,88,85,0.15)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>📋</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "#fff", fontWeight: 900, fontSize: 18, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{resultTitle}</div>
                  <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 1 }}>{form.specialties.join(" · ")}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
                <button onClick={handlePDF} style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "8px 16px", border: "1.5px solid rgba(255,255,255,0.35)",
                  borderRadius: 10, background: "rgba(255,255,255,0.12)", color: "#fff",
                  fontWeight: 800, fontSize: 13, cursor: "pointer"
                }}>📄 PDF</button>
                <button onClick={() => {
                  if (drawMode) {
                    const url = drawCanvasRef.current?.getDataUrl();
                    if (url) tempDrawingRef.current = url;
                  }
                  setDrawMode(d => !d); setIsEraser(false);
                }} style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "8px 16px", border: `1.5px solid ${drawMode ? "#E85D2C" : "rgba(255,255,255,0.35)"}`,
                  borderRadius: 10, background: drawMode ? "#E85D2C" : "rgba(255,255,255,0.12)", color: "#fff",
                  fontWeight: 800, fontSize: 13, cursor: "pointer"
                }}>✏️ {drawMode ? "그리기 중" : "펜 도구"}</button>
                {/* 드로잉 저장 버튼 */}
                <button onClick={saveDrawing} disabled={drawSaveState === "saving"} style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "8px 16px", borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: drawSaveState === "saving" ? "not-allowed" : "pointer",
                  border: `1.5px solid ${drawSaveState === "saved" ? "#4CAF50" : drawSaveState === "error" ? "#FF5555" : "rgba(255,255,255,0.35)"}`,
                  background: drawSaveState === "saved" ? "rgba(76,175,80,0.25)" : drawSaveState === "error" ? "rgba(255,85,85,0.2)" : "rgba(255,255,255,0.12)",
                  color: "#fff",
                }}>
                  {drawSaveState === "saving" ? "⏳ 저장 중" : drawSaveState === "saved" ? "✓ 저장됨" : drawSaveState === "error" ? "✕ 실패" : "💾 저장"}
                </button>
                <button
                  onClick={handleShare}
                  disabled={shareLoading}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "8px 16px",
                    border: `1.5px solid ${shareCopied ? "#4CAF50" : "rgba(255,255,255,0.35)"}`,
                    borderRadius: 10,
                    background: shareCopied ? "rgba(76,175,80,0.25)" : "rgba(255,255,255,0.12)",
                    color: "#fff", fontWeight: 800, fontSize: 13,
                    cursor: shareLoading ? "not-allowed" : "pointer",
                  }}>
                  <Link2 size={14} />
                  {shareLoading ? "생성 중" : shareCopied ? "링크 복사됨!" : "링크 공유"}
                </button>
                <button onClick={() => { setFieldView(false); setDrawMode(false); clearCanvas(); tempDrawingRef.current = null; }} style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "8px 16px", border: "1.5px solid rgba(255,255,255,0.35)",
                  borderRadius: 10, background: "rgba(255,255,255,0.12)", color: "#fff",
                  fontWeight: 800, fontSize: 13, cursor: "pointer"
                }}>✕ 편집 모드로</button>
              </div>
            </div>

            {/* ── 드로잉 캔버스 오버레이 ── */}
            {drawMode && (
              <>
                <DrawingCanvas
                  ref={drawCanvasRef}
                  penType={penType}
                  penSize={penSize}
                  penColor={penColor}
                  isEraser={isEraser}
                  eraserSize={eraserSize}
                  style={{
                    position: "fixed", top: 72, left: 0, right: 0, bottom: 0,
                    width: "100%", height: "calc(100% - 72px)",
                    zIndex: 305,
                  }}
                />
                {/* 드로잉 툴바 */}
                <div style={{
                  position: "fixed", bottom: 70, left: "50%", transform: "translateX(-50%)",
                  zIndex: 320, background: "rgba(12,26,25,0.97)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 20, padding: "12px 16px",
                  display: "flex", flexDirection: "column", gap: 10,
                  boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
                  backdropFilter: "blur(16px)", minWidth: 320,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ display: "flex", gap: 5 }}>
                      {PEN_TYPES.map(({ key, label, icon }) => (
                        <button key={key} title={label} onClick={() => { setPenType(key as "pen"|"marker"|"highlighter"|"brush"); setIsEraser(false); }} style={{
                          height: 34, padding: "0 10px", borderRadius: 10,
                          background: !isEraser && penType === key ? "#155855" : "rgba(255,255,255,0.08)",
                          border: `2px solid ${!isEraser && penType === key ? "#E85D2C" : "rgba(255,255,255,0.2)"}`,
                          color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
                          display: "flex", alignItems: "center", gap: 4, transition: "all 120ms", whiteSpace: "nowrap",
                        }}>{icon} {label}</button>
                      ))}
                    </div>
                    <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.15)", flexShrink: 0 }} />
                    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                      {(isEraser ? ERASER_SIZES : [2, 4, 8]).map(size => {
                        const dot = isEraser ? Math.min(34, 12 + size / 3) : size + 16;
                        return (
                          <button
                            key={size}
                            title={`굵기 ${size}`}
                            onClick={() => isEraser ? setEraserSize(size) : setPenSize(size)}
                            style={{
                              width: dot, height: dot, borderRadius: "50%",
                              background: (isEraser ? eraserSize : penSize) === size ? "#fff" : "rgba(255,255,255,0.25)",
                              border: (isEraser ? eraserSize : penSize) === size ? "2px solid #E85D2C" : "2px solid transparent",
                              cursor: "pointer", flexShrink: 0, transition: "all 120ms",
                            }} />
                        );
                      })}
                    </div>
                    <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.15)", flexShrink: 0 }} />
                    <button onClick={() => setIsEraser(e => !e)} title="지우개" style={{
                      width: 34, height: 34, borderRadius: 10,
                      background: isEraser ? "#E85D2C" : "rgba(255,255,255,0.1)",
                      border: `2px solid ${isEraser ? "#E85D2C" : "rgba(255,255,255,0.2)"}`,
                      color: "#fff", fontSize: 15, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>🧹</button>
                    <button onClick={() => drawCanvasRef.current?.undo()} title="복원 (마지막 획 취소)" style={{
                      width: 34, height: 34, borderRadius: 10,
                      background: "rgba(255,255,255,0.08)", border: "2px solid rgba(255,255,255,0.2)",
                      color: "#fff", fontSize: 15, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>↩️</button>
                    <button onClick={async () => {
                      if (!window.confirm("저장된 드로잉을 휴지통으로 이동하고 화면을 지울까요?")) return;
                      clearCanvas();
                      const hospital = form.hospitalName || resultTitle;
                      if (hospital) {
                        const response = await fetch(`/api/conti-drawing?hospital=${encodeURIComponent(hospital)}`, { method: "DELETE" });
                        const data = await response.json();
                        if (!response.ok || !data.ok) window.alert(data.error || "드로잉 삭제 실패");
                      }
                    }} title="전체 지우기 (저장 데이터도 삭제)" style={{
                      width: 34, height: 34, borderRadius: 10,
                      background: "rgba(255,255,255,0.08)", border: "2px solid rgba(255,255,255,0.2)",
                      color: "#fff", fontSize: 15, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>🗑️</button>
                    <button onClick={() => {
                      const url = drawCanvasRef.current?.getDataUrl();
                      if (url) tempDrawingRef.current = url;
                      setDrawMode(false);
                    }} title="펜 도구 닫기" style={{
                      width: 34, height: 34, borderRadius: 10,
                      background: "rgba(232,93,44,0.2)", border: "2px solid rgba(232,93,44,0.5)",
                      color: "#fff", fontSize: 14, fontWeight: 900, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>✕</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 5 }}>
                    {DRAW_COLORS.map(({ color, label }) => (
                      <button key={color} title={label} onClick={() => { setPenColor(color); setIsEraser(false); }} style={{
                        width: "100%", aspectRatio: "1", borderRadius: "50%", background: color, cursor: "pointer",
                        border: `3px solid ${!isEraser && penColor === color ? "#fff" : "rgba(255,255,255,0.15)"}`,
                        boxShadow: !isEraser && penColor === color ? `0 0 0 2px #E85D2C, 0 0 8px ${color}` : "none",
                        transition: "all 120ms", outline: "none",
                      }} />
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── 탭 콘텐츠 영역 ── */}
            <div style={{
              flex: 1, overflowY: "auto", padding: "20px 20px 12px",
              WebkitOverflowScrolling: "touch",
            }}>

              {/* 🎬 콘티 탭 — 편집 순서 그대로 표시 + 완료 체크 */}
              {fieldViewTab === "conti" && (() => {
                const doneCount = doneConti.size;
                return (
                  <div>
                    {/* 진행률 바 */}
                    <div style={{ marginBottom: 12, background: "#fff", borderRadius: 12, padding: "12px 16px", border: "1px solid #C8DDD9", display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ flex: 1, background: "#EDF5F3", borderRadius: 99, height: 8, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${result.conti.length ? (doneCount / result.conti.length) * 100 : 0}%`, background: "#155855", borderRadius: 99, transition: "width 300ms" }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "#155855", whiteSpace: "nowrap" }}>
                        {doneCount} / {result.conti.length} 완료
                      </span>
                      {doneCount > 0 && (
                        <button onClick={() => setDoneConti(new Set())} style={{ fontSize: 11, color: "#9BB5B0", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>초기화</button>
                      )}
                    </div>

                    {/* 카드 크기 조절 바 */}
                    <div style={{ marginBottom: 16, background: "#fff", borderRadius: 12, padding: "10px 16px", border: "1px solid #C8DDD9", display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "#155855", whiteSpace: "nowrap", flexShrink: 0 }}>🔳 카드 크기</span>
                      <button
                        onClick={() => setFieldCardSize(s => Math.max(FIELD_CARD_MIN, s - 20))}
                        style={{
                          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                          background: "#EDF5F3", border: "1px solid #C8DDD9", color: "#155855",
                          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                        }}
                        aria-label="카드 작게"
                      ><Minus size={14} /></button>
                      <input
                        type="range"
                        min={FIELD_CARD_MIN}
                        max={FIELD_CARD_MAX}
                        step={10}
                        value={fieldCardSize}
                        onChange={e => setFieldCardSize(parseInt(e.target.value, 10))}
                        style={{
                          flex: 1, accentColor: "#155855", height: 28, cursor: "pointer", touchAction: "pan-x",
                        }}
                        aria-label="카드 크기 조절"
                      />
                      <button
                        onClick={() => setFieldCardSize(s => Math.min(FIELD_CARD_MAX, s + 20))}
                        style={{
                          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                          background: "#EDF5F3", border: "1px solid #C8DDD9", color: "#155855",
                          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                        }}
                        aria-label="카드 크게"
                      ><Plus size={14} /></button>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#9BB5B0", width: 44, textAlign: "right", flexShrink: 0 }}>
                        {fieldCardSize}px
                      </span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${fieldCardSize}px, 1fr))`, gap: 16 }}>
                      {result.conti.map((row, i) => {
                        const rawColor = row.color ? row.color.split("|") : null;
                        const c = rawColor ? { bg: rawColor[0], text: rawColor[1] } : getContiCategoryColor(row.category);
                        const isDraggingOver = dragOver?.type === "conti" && dragOver.index === i;
                        const isDone = doneConti.has(i);
                        return (
                          <div key={i}
                            draggable
                            data-conti-index={i}
                            onPointerDown={() => setOliviaSelection("conti-shot", row.id || `shot:${i + 1}`)}
                            onDragStart={() => handleDragStart("conti", i)}
                            onDragOver={e => handleDragOver(e, "conti", i)}
                            onDrop={() => handleDrop("conti", i)}
                            onDragEnd={handleDragEnd}
                            onTouchStart={(e) => {
                              e.stopPropagation();
                              touchDragRef.current = i;
                              handleDragStart("conti", i);
                            }}
                            onTouchMove={(e) => {
                              e.preventDefault();
                              const touch = e.touches[0];
                              const el = document.elementFromPoint(touch.clientX, touch.clientY);
                              const card = el?.closest("[data-conti-index]") as HTMLElement | null;
                              if (card) {
                                const idx = parseInt(card.getAttribute("data-conti-index") || "-1");
                                if (idx >= 0 && idx !== touchDragRef.current) setDragOver({ type: "conti", index: idx });
                              }
                            }}
                            onTouchEnd={() => {
                              if (touchDragRef.current !== null && dragOver?.type === "conti") {
                                handleDrop("conti", dragOver.index);
                              }
                              touchDragRef.current = null;
                              setDragOver(null);
                            }}
                            style={{
                              background: isDone ? "#F0FDF4" : "#fff",
                              borderRadius: 16,
                              border: isDraggingOver
                                ? "2px dashed #155855"
                                : selectedOliviaEntityId === (row.id || `shot:${i + 1}`)
                                  ? "2px solid #155855"
                                  : isDone ? "1px solid #86EFAC" : "1px solid #C8DDD9",
                              overflow: "hidden",
                              boxShadow: isDraggingOver ? "0 0 0 3px rgba(21,88,85,0.15)" : "0 2px 14px rgba(21,88,85,0.08)",
                              cursor: "grab", opacity: isDraggingOver ? 0.7 : isDone ? 0.72 : 1,
                              transition: "all 200ms",
                              touchAction: "none",
                            }}
                          >
                            {/* 카드 헤더 */}
                            <div style={{
                              background: isDone ? "#DCFCE7" : c.bg, padding: "11px 16px",
                              display: "flex", alignItems: "center", justifyContent: "space-between",
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ color: isDone ? "#166534" : c.text, fontSize: 14, opacity: 0.5, marginRight: 2, cursor: "grab" }}>⠿</span>
                                <span style={{ background: "rgba(0,0,0,0.12)", color: isDone ? "#166534" : c.text, fontSize: 11, fontWeight: 900, padding: "2px 9px", borderRadius: 99 }}>
                                  {i + 1}순위
                                </span>
                                <span style={{ color: isDone ? "#166534" : c.text, fontWeight: 900, fontSize: 14 }}>{row.category}</span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ background: "rgba(0,0,0,0.10)", color: isDone ? "#166534" : c.text, fontSize: 11, fontWeight: 800, padding: "3px 11px", borderRadius: 99 }}>⏱ {row.duration}</span>
                                {/* 완료 체크박스 */}
                                <label onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                                  <input
                                    type="checkbox"
                                    checked={isDone}
                                    onChange={() => toggleDone(i)}
                                    style={{ width: 18, height: 18, accentColor: "#155855", cursor: "pointer" }}
                                  />
                                  <span style={{ fontSize: 11, fontWeight: 800, color: isDone ? "#166534" : "rgba(0,0,0,0.35)" }}>
                                    {isDone ? "완료 ✓" : "완료"}
                                  </span>
                                </label>
                              </div>
                            </div>
                            {/* 카드 바디 */}
                            <div style={{ padding: "14px 16px", display: "grid", gap: 10 }}>
                              <div style={{ color: isDone ? "#15803D" : "#E85D2C", fontWeight: 900, fontSize: 15, textDecoration: isDone ? "line-through" : "none" }}>{row.keyword}</div>
                              <p style={{ color: isDone ? "#6B7280" : "#3A5450", fontSize: 13, lineHeight: 1.7, margin: 0 }}>
                                {row.description}
                              </p>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 2 }}>
                                <div style={{ background: "#EDF5F3", borderRadius: 9, padding: "8px 12px" }}>
                                  <div style={{ color: "#7A9E9B", fontSize: 11, fontWeight: 700, marginBottom: 3 }}>📍 장소</div>
                                  <div style={{ color: "#1C2B28", fontSize: 13, fontWeight: 700 }}>{row.location || "—"}</div>
                                </div>
                                <div style={{ background: "#EDF5F3", borderRadius: 9, padding: "8px 12px" }}>
                                  <div style={{ color: "#7A9E9B", fontSize: 11, fontWeight: 700, marginBottom: 3 }}>📷 구도</div>
                                  <div style={{ color: "#1C2B28", fontSize: 13, fontWeight: 700 }}>{row.cameraAngle || "—"}</div>
                                </div>
                                <div style={{ background: "#EDF5F3", borderRadius: 9, padding: "8px 12px", gridColumn: "1/-1" }}>
                                  <div style={{ color: "#7A9E9B", fontSize: 11, fontWeight: 700, marginBottom: 3 }}>👥 필요인원</div>
                                  <div style={{ color: "#1C2B28", fontSize: 13 }}>{row.personnel || "—"}</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* ✅ 체크리스트 탭 */}
              {fieldViewTab === "checklist" && (
                <div style={{ display: "grid", gap: 10, maxWidth: 700, margin: "0 auto" }}>
                  {result.checklist.map((row, i) => (
                    <label key={i} style={{
                      display: "flex", alignItems: "center", gap: 14,
                      background: "#fff", borderRadius: 12, padding: "14px 18px",
                      cursor: "pointer", userSelect: "none",
                      border: "1px solid #C8DDD9",
                      boxShadow: "0 1px 6px rgba(21,88,85,0.06)",
                    }}>
                      <input type="checkbox" style={{ width: 22, height: 22, accentColor: "#155855", cursor: "pointer", flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <span style={{ color: "#7A9E9B", fontSize: 11, fontWeight: 700 }}>{row.category} · </span>
                        <span style={{ color: "#1C2B28", fontSize: 14, fontWeight: 700 }}>{row.item}</span>
                        {row.notes && <span style={{ color: "#9BB5B0", fontSize: 12, marginLeft: 6 }}>({row.notes})</span>}
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {/* ⏰ 타임테이블 탭 — 시간순 정렬 */}
              {fieldViewTab === "schedule" && (
                <div style={{ display: "grid", gap: 10, maxWidth: 700, margin: "0 auto" }}>
                  {[...result.schedule].sort((a, b) => {
                    const toMins = (t: string) => {
                      const m = t?.match(/(\d{1,2}):(\d{2})/);
                      return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 9999;
                    };
                    return toMins(a.time) - toMins(b.time);
                  }).map((row, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "stretch",
                      background: "#fff", borderRadius: 12, overflow: "hidden",
                      border: "1px solid #C8DDD9",
                      boxShadow: "0 1px 6px rgba(21,88,85,0.06)",
                    }}>
                      <div style={{
                        background: "#155855", padding: "14px 18px",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        minWidth: 100, flexShrink: 0,
                      }}>
                        <span style={{ color: "#fff", fontWeight: 900, fontSize: 14 }}>{row.time}</span>
                      </div>
                      <div style={{ padding: "14px 18px", flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ color: "#1C2B28", fontWeight: 800, fontSize: 15 }}>{row.activity}</span>
                          {row.type && <span style={{ color: "#E85D2C", fontSize: 11, fontWeight: 700, background: "rgba(232,93,44,0.1)", padding: "2px 8px", borderRadius: 99 }}>{row.type}</span>}
                        </div>
                        {row.requirements && <div style={{ color: "#5A7470", fontSize: 13 }}>{row.requirements}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── 하단 탭 바 ── */}
            <div style={{
              flexShrink: 0, height: 64,
              background: "#fff", borderTop: "1px solid #C8DDD9",
              display: "flex", zIndex: 312,
              boxShadow: "0 -2px 12px rgba(21,88,85,0.07)",
            }}>
              {([
                { key: "conti",     label: "콘티",   icon: "🎬", count: result.conti.length },
                { key: "checklist", label: "체크",   icon: "✅", count: result.checklist.length },
                { key: "schedule",  label: "일정",   icon: "⏰", count: result.schedule.length },
              ] as const).map(({ key, label, icon, count }) => (
                <button key={key} onClick={() => setFieldViewTab(key)} style={{
                  flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", gap: 3, border: "none", cursor: "pointer",
                  background: fieldViewTab === key ? "#EDF5F3" : "transparent",
                  borderTop: `3px solid ${fieldViewTab === key ? "#E85D2C" : "transparent"}`,
                  transition: "all 150ms",
                }}>
                  <span style={{ fontSize: 20 }}>{icon}</span>
                  <span style={{ color: fieldViewTab === key ? "#155855" : "#9BB5B0", fontSize: 11, fontWeight: 800 }}>
                    {label} {count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>

    {/* 저장 완료 토스트 */}
    {saveToast && (
      <div style={{
        position: "fixed", bottom: 100, left: "50%", transform: "translateX(-50%)",
        zIndex: 9999, background: "#155855", color: "#fff",
        padding: "12px 24px", borderRadius: 12, fontSize: 14, fontWeight: 800,
        boxShadow: "0 8px 24px rgba(21,88,85,0.3)",
        animation: "fadeIn .2s ease"
      }}>
        ✓ 콘티가 저장됐어요
      </div>
    )}

    {historyToast && (
      <div style={{
        position: "fixed", bottom: 154, left: "50%", transform: "translateX(-50%)",
        zIndex: 9999, background: "#1C2B28", color: "#fff",
        padding: "10px 20px", borderRadius: 12, fontSize: 13, fontWeight: 800,
        boxShadow: "0 8px 24px rgba(28,43,40,0.25)",
        animation: "fadeIn .2s ease"
      }}>
        {historyToast}
      </div>
    )}

    {/* 불러오기 패널 */}
    {pageMode === "conti" && showLoadPanel && (
      <div style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center"
      }} onClick={() => setShowLoadPanel(false)}>
        <div style={{
          background: "#fff", borderRadius: 16, width: "min(560px, 90vw)",
          maxHeight: "70vh", overflow: "hidden", display: "flex", flexDirection: "column",
          boxShadow: "0 24px 60px rgba(0,0,0,0.25)"
        }} onClick={e => e.stopPropagation()}>
          {/* 패널 헤더 */}
          <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(21,88,85,0.1)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 900, color: "#155855" }}>📂 저장된 콘티</div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>클릭하면 바로 불러와요 · 최대 5개 보관</div>
            </div>
            <button onClick={() => setShowLoadPanel(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#9ca3af" }}>✕</button>
          </div>
          {/* 목록 */}
          <div style={{ overflowY: "auto", padding: "12px 16px", flex: 1 }}>
            {loadLoading ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af", fontSize: 14 }}>불러오는 중...</div>
            ) : savedList.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af", fontSize: 14 }}>
                저장된 콘티가 없어요<br />
                <span style={{ fontSize: 12 }}>콘티 생성 후 "콘티 저장" 버튼을 눌러주세요</span>
              </div>
            ) : savedList.map(entry => (
              <div key={entry.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "14px 16px", borderRadius: 10, marginBottom: 8,
                border: "1px solid rgba(21,88,85,0.12)", background: "#fafaf9",
                cursor: editingId === entry.id ? "default" : "pointer", transition: "all 120ms ease"
              }}
                onMouseEnter={e => { if (editingId !== entry.id) e.currentTarget.style.background = "rgba(21,88,85,0.05)"; }}
                onMouseLeave={e => (e.currentTarget.style.background = "#fafaf9")}
                onClick={() => {
                  if (editingId !== entry.id) {
                    setOliviaWorkspace("conti", entry.id);
                    loadConti(entry);
                  }
                }}
              >
                <div style={{ fontSize: 28, flexShrink: 0 }}>🎬</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingId === entry.id ? (
                    <input
                      autoFocus
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onBlur={() => renameConti(entry.id, editingName)}
                      onKeyDown={e => {
                        if (e.key === "Enter") renameConti(entry.id, editingName);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onClick={e => e.stopPropagation()}
                      style={{
                        width: "100%", fontSize: 15, fontWeight: 800, color: "#155855",
                        border: "2px solid #155855", borderRadius: 6, padding: "4px 8px",
                        outline: "none", background: "#fff",
                      }}
                    />
                  ) : (
                    <div style={{ fontWeight: 800, fontSize: 15, color: "#155855", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {entry.hospital_name}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                    {entry.specialties?.join(" · ")} &nbsp;·&nbsp; {new Date(entry.saved_at).toLocaleDateString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                    {entry.result.conti.length}컷 · 체크 {entry.result.checklist.length}개
                  </div>
                  {!entry.client_id && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#c2410c", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 6, padding: "2px 8px" }}>
                        고객 미연결 — 업무 완료 처리에서 안 잡혀요
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); setLinkTarget(entry); setLinkQuery(entry.hospital_name || ""); setLinkResults([]); }}
                        style={{ display: "flex", alignItems: "center", gap: 3, background: "none", border: "none", color: "#155855", cursor: "pointer", fontSize: 11, fontWeight: 700, padding: 0 }}
                      >
                        <Link2 size={11} /> 고객에 연결
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    setEditingId(entry.id);
                    setEditingName(entry.hospital_name);
                  }}
                  style={{ background: "none", border: "none", color: "#155855", cursor: "pointer", padding: 6, borderRadius: 6, flexShrink: 0, opacity: 0.5 }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = "0.5")}
                  title="이름 수정"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); deleteConti(entry.id); }}
                  style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", padding: 6, borderRadius: 6, flexShrink: 0, opacity: 0.6 }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = "0.6")}
                  title="삭제"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}

    {/* 고객 연결 — 병원명 오타 등으로 client_id 없이 저장된 콘티를 실제 고객에 연결한다 */}
    {linkTarget && (
      <div style={{
        position: "fixed", inset: 0, zIndex: 600,
        background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center"
      }} onClick={() => setLinkTarget(null)}>
        <div style={{
          background: "#fff", borderRadius: 16, width: "min(420px, 90vw)",
          overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,0.25)"
        }} onClick={e => e.stopPropagation()}>
          <div style={{ padding: "18px 20px", borderBottom: "1px solid rgba(21,88,85,0.1)" }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: "#155855" }}>고객에 연결</div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
              "{linkTarget.hospital_name}" 콘티를 연결할 실제 고객을 검색해서 선택해주세요.
            </div>
          </div>
          <div style={{ padding: 16 }}>
            <input
              autoFocus
              value={linkQuery}
              onChange={e => setLinkQuery(e.target.value)}
              placeholder="고객명·병원명 검색..."
              style={{ width: "100%", border: "1px solid rgba(21,88,85,0.16)", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none" }}
            />
            <div style={{ maxHeight: 240, overflowY: "auto", marginTop: 8 }}>
              {linkResults.length === 0 ? (
                <div style={{ padding: 10, textAlign: "center", fontSize: 12, color: "#9ca3af" }}>검색 결과 없음</div>
              ) : linkResults.map(c => (
                <div
                  key={c.id}
                  onClick={() => !linkBusy && linkContiToClient(c)}
                  style={{ padding: "8px 10px", borderRadius: 8, cursor: linkBusy ? "default" : "pointer", fontSize: 13, fontWeight: 700, color: "#1f2937", opacity: linkBusy ? 0.5 : 1 }}
                  onMouseEnter={e => { if (!linkBusy) e.currentTarget.style.background = "rgba(21,88,85,0.06)"; }}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  {c.hospital_name || c.name}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )}

    {isModal && closeConfirmOpen && typeof document !== "undefined" ? createPortal(
      <div className="pcrm-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setCloseConfirmOpen(false)}>
        <div style={{ width: "min(420px, calc(100vw - 24px))", background: "#fff", borderRadius: 16, padding: 24 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 800, color: "#155855" }}>저장하지 않은 변경사항이 있습니다.</h3>
          <p style={{ margin: "0 0 18px", fontSize: 12.5, color: "#5a7470" }}>계속 작성하시겠습니까, 아니면 저장 후 닫으시겠습니까?</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button type="button" onClick={() => setCloseConfirmOpen(false)}
              style={{ height: 40, borderRadius: 9, border: "1px solid rgba(21,88,85,.12)", background: "#fff", color: "#155855", fontWeight: 800, cursor: "pointer" }}>
              계속 작성
            </button>
            <button type="button" onClick={async () => { await saveConti({ silent: false }); setCloseConfirmOpen(false); onClose?.(); }}
              style={{ height: 40, borderRadius: 9, border: "none", background: "#155855", color: "#fff", fontWeight: 800, cursor: "pointer" }}>
              임시 저장 후 닫기
            </button>
            <button type="button" onClick={() => { setCloseConfirmOpen(false); onClose?.(); }}
              style={{ height: 40, borderRadius: 9, border: "1px solid rgba(216,70,52,.3)", background: "#fff", color: "#D84634", fontWeight: 800, cursor: "pointer" }}>
              저장하지 않고 닫기
            </button>
          </div>
        </div>
      </div>,
      document.body,
    ) : null}
    </>
  );
}
