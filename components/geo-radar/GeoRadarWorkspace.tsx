"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, Building2, ChevronLeft, CircleDollarSign, ClipboardCheck, Download, MapPinned, Menu, Plus, Radar, RefreshCw, SlidersHorizontal, X } from "lucide-react";
import { useAnalysisHost } from "@/components/analysis-workspace/AnalysisHostContext";
import { estimateAiTrustRunCost, type PricingTable } from "@/lib/ai-trust/costs";
import type { AiTrustGeneratedPrompt, AiTrustIntent, AiTrustProviderKey } from "@/lib/ai-trust/types";
import { GeoRadarMap } from "./GeoRadarMap";
import { GEO_RADAR_PREVIEW, GEO_RADAR_PREVIEW_SUMMARY } from "./previewData";
import type { GeoRadarClinic, GeoRadarOverview, GeoRadarProject, GeoRadarRegion } from "./types";
import styles from "./GeoRadarWorkspace.module.css";

type Screen = "new" | "result" | "clinics" | "review" | "settings" | "operations";
type ResultTab = "ranking" | "map" | "site" | "gap" | "trend" | "report";
type PromptRow = AiTrustGeneratedPrompt & { id?: string };
type ReviewQueueRow = {
  id: string;
  raw_name: string;
  confidence?: number | null;
  proposed_clinic_id?: string | null;
  project?: { project_name?: string } | Array<{ project_name?: string }>;
};
type ProjectSummary = {
  project: GeoRadarProject; prompts: PromptRow[]; runs: Array<Record<string, unknown>>;
  responses: Array<{ id: string; provider: string; prompt_id: string; question: string; raw_response: string; source_urls?: string[]; executed_at: string }>;
  consensusTop10: Array<{ id: string; hospital_id?: string; mention_rate: number; top3_rate: number; provider_consensus: number; hospital?: { id?: string; canonical_name?: string } }>;
  mentions: Array<{ id: string; response_id: string; hospital_id?: string | null; raw_name: string; rank?: number | null; hospital?: { id?: string; canonical_name?: string } }>;
  gaps: Array<{ schema_key: string; gap: number; rank: number }>;
  strategies: Array<{ id: string; title: string; summary: string }>;
  shootPlan: Array<{ id: string; title: string; description?: string }>;
  projectClinics: Array<{ is_client: boolean; clinic: GeoRadarClinic }>;
  reviewQueue: Array<{ id: string; raw_name: string; confidence?: number | null; proposed_clinic_id?: string | null }>;
  jobs: Array<Record<string, unknown>>; costs: Array<{ amount_usd: number }>;
  history: Array<{ id: string; client_hospital_name: string; scope_label?: string | null; created_at: string; runs?: Array<{ created_at?: string; status?: string }> }>;
  historyConsensus: Array<{ project_id: string; mention_rate: number; provider_consensus: number; hospital?: { canonical_name?: string } }>;
  dataSources: Array<{ source_key: string; source_name: string; status: string; message?: string | null; checked_at?: string }>;
};

const INTENT_LABEL: Record<AiTrustIntent, string> = { LOCATION: "지역", RECOMMENDATION: "추천", SYMPTOM: "증상", TREATMENT: "시술", PRICE: "가격", TRUST: "신뢰", CONDITION: "조건" };
const PROVIDER_LABEL: Record<string, string> = { openai: "ChatGPT", gemini: "Gemini", anthropic: "Claude", perplexity: "Perplexity" };
const JOB_LABEL: Record<string, string> = { ai_query: "AI 질문", clinic_sync: "병원 목록 수집", extract: "병원명 추출", score: "추천 순위 집계", retention: "원문 보관 정리" };
const STATUS_LABEL: Record<string, string> = { PENDING: "대기", RUNNING: "진행", RETRY: "재시도", FAILED: "실패", COMPLETED: "완료", PAUSED: "일시정지" };
const RESULT_TABS: Array<{ key: ResultTab; label: string }> = [
  { key: "ranking", label: "AI 추천 순위" }, { key: "map", label: "지도" }, { key: "site", label: "사이트 점수" },
  { key: "gap", label: "갭 · 전략 · 촬영 계획" }, { key: "trend", label: "추이" }, { key: "report", label: "보고서" },
];

export default function GeoRadarWorkspace() {
  const { surface } = useAnalysisHost();
  const [overview, setOverview] = useState<GeoRadarOverview | null>(null);
  const [setupInfo, setSetupInfo] = useState<{ error: string; apply_order: string[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [screen, setScreen] = useState<Screen>("new");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [step, setStep] = useState(1);
  const [resultTab, setResultTab] = useState<ResultTab>("ranking");
  const [clientId, setClientId] = useState("");
  const [regionId, setRegionId] = useState("");
  const [customRegion, setCustomRegion] = useState<GeoRadarRegion>({ id: "custom", name: "직접 지정", region_type: "custom", center_lat: 37.507287, center_lng: 127.033868, radius_m: 1000, districts: [], region_terms: [] });
  const [radiusM, setRadiusM] = useState(1000);
  const [treatments, setTreatments] = useState(["울쎄라", "써마지", "세르프", "리쥬란"]);
  const [regionTerms, setRegionTerms] = useState<string[]>([]);
  const [providers, setProviders] = useState<Set<AiTrustProviderKey>>(new Set());
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [repeatCount, setRepeatCount] = useState(3);
  const [createdProject, setCreatedProject] = useState<GeoRadarProject | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      if (process.env.NODE_ENV !== "production") {
        const preview = new URLSearchParams(window.location.search).get("preview");
        if (preview === "setup") {
          setSetupInfo({ error: "로컬 검증용 스키마 미적용 상태입니다.", apply_order: ["supabase/ai-trust-gap-schema.sql", "supabase/geo-radar-v1.sql"] });
          setOverview(null);
          return;
        }
        if (preview === "new" || preview === "result") {
          setOverview(GEO_RADAR_PREVIEW);
          setSetupInfo(null);
          setClientId("preview-glory");
          setRegionId("preview-eonju");
          setRegionTerms(GEO_RADAR_PREVIEW.regions[0].region_terms);
          setProviders(new Set(["openai", "anthropic"]));
          if (preview === "result") {
            setSummary(GEO_RADAR_PREVIEW_SUMMARY as ProjectSummary);
            setActiveProjectId("preview-project");
            setScreen("result");
            setStep(4);
          }
          return;
        }
      }
      const res = await fetch("/api/ai-trust/overview", { cache: "no-store" });
      const data = await res.json();
      if (data.setup_required) {
        setSetupInfo({ error: data.error, apply_order: data.apply_order || [] });
        setOverview(null);
        return;
      }
      if (!data.ok) throw new Error(data.error || "초기 데이터를 불러오지 못했습니다.");
      setOverview(data);
      const connected = (data.providers || []).filter((item: { status: string }) => item.status === "CONNECTED").map((item: { provider: AiTrustProviderKey }) => item.provider);
      setProviders(new Set(connected));
      const firstRegion = data.regions?.[0];
      if (firstRegion) { setRegionId(firstRegion.id); setRadiusM(firstRegion.radius_m || 1000); setRegionTerms(firstRegion.region_terms || []); }
      const latest = data.projects?.[0];
      if (latest) await openProject(latest.id, true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "초기 데이터를 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadOverview(); }, [loadOverview]);

  const activeRegion = useMemo(() => regionId === "custom" ? customRegion : overview?.regions.find((item) => item.id === regionId) || overview?.regions[0], [customRegion, overview, regionId]);
  const activeClient = overview?.clients.find((item) => item.id === clientId) || overview?.clients[0];
  const connectedCount = overview?.providers.filter((item) => providers.has(item.provider) && item.status === "CONNECTED").length || 0;
  const requestCount = prompts.length * connectedCount * repeatCount;
  const estimatedCost = overview ? estimateAiTrustRunCost({ requestCount, providers: Array.from(providers), pricing: overview.pricing as PricingTable }) : 0;

  async function openProject(projectId: string, quiet = false) {
    if (projectId.startsWith("preview-")) {
      setSummary(GEO_RADAR_PREVIEW_SUMMARY as ProjectSummary); setActiveProjectId(projectId); setScreen("result"); setStep(4); setSidebarOpen(false); return;
    }
    try {
      const res = await fetch(`/api/ai-trust/projects/${projectId}/summary`, { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "결과를 불러오지 못했습니다.");
      setSummary(data); setActiveProjectId(projectId); setScreen("result"); setStep(4); setSidebarOpen(false);
    } catch (error) { if (!quiet) setMessage(error instanceof Error ? error.message : "결과를 불러오지 못했습니다."); }
  }

  function startPreview(target: "new" | "result" = "new") {
    setOverview(GEO_RADAR_PREVIEW); setSetupInfo(null); setClientId("preview-glory"); setRegionId("preview-eonju");
    setRegionTerms(GEO_RADAR_PREVIEW.regions[0].region_terms); setProviders(new Set(["openai", "anthropic"])); setLoading(false);
    if (target === "result") { setSummary(GEO_RADAR_PREVIEW_SUMMARY as ProjectSummary); setActiveProjectId("preview-project"); setScreen("result"); setStep(4); }
  }

  function startNew() {
    setScreen("new"); setStep(1); setCreatedProject(null); setSummary(null); setPrompts([]); setMessage(""); setSidebarOpen(false);
  }

  async function confirmScope() {
    if (!overview || !activeRegion || !activeClient) return setMessage("클라이언트와 범위를 선택해 주세요.");
    if (activeClient.id.startsWith("preview-")) {
      setCreatedProject({ id: "preview-project", client_id: activeClient.id, project_name: `${activeClient.hospital_name} GEO 레이더`, client_hospital_name: activeClient.hospital_name, region: activeRegion.name, region_id: activeRegion.id, scope_label: `${activeRegion.name}${activeRegion.region_type === "radius" ? ` ${radiusM / 1000}km` : ""}`, department: activeClient.specialty || "피부과", treatments, status: "DRAFT", created_at: new Date().toISOString() });
      setPrompts(makePreviewPrompts(activeRegion.name, activeClient.specialty || "피부과", treatments[0])); setStep(2); return;
    }
    setLoading(true); setMessage("");
    try {
      const res = await fetch("/api/ai-trust/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        project_name: `${activeClient.hospital_name} GEO 레이더`, client_id: activeClient.id, client_hospital_name: activeClient.hospital_name,
        region: activeRegion.name, region_id: activeRegion.id === "custom" ? null : activeRegion.id, scope_label: `${activeRegion.name}${["radius", "custom"].includes(activeRegion.region_type) ? ` ${radiusM / 1000}km` : ""}`,
        center_lat: activeRegion.center_lat, center_lng: activeRegion.center_lng, radius_m: radiusM,
        department: activeClient.specialty || "피부과", treatments, manual_keywords: regionTerms,
      }) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "분석을 만들지 못했습니다.");
      setCreatedProject(data.project); setPrompts(data.prompts || []); setStep(2);
    } catch (error) { setMessage(error instanceof Error ? error.message : "분석을 만들지 못했습니다."); }
    finally { setLoading(false); }
  }

  async function startRun() {
    if (!createdProject) return;
    if (createdProject.id.startsWith("preview-")) { setStep(3); setMessage("미리보기에서는 실제 AI 호출을 실행하지 않습니다. SQL 적용 후 실행해 주세요."); return; }
    setLoading(true); setMessage("");
    try {
      const promptRes = await fetch("/api/ai-trust/prompts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: createdProject.id, prompts }) });
      const promptData = await promptRes.json();
      if (!promptData.ok) throw new Error(promptData.error || "질문 저장 실패");
      const res = await fetch("/api/ai-trust/audit-runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: createdProject.id, providers: Array.from(providers), repeat_count: repeatCount }) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "측정 작업 생성 실패");
      setStep(3); setActiveProjectId(createdProject.id); setMessage(`총 ${data.queued}회 측정을 대기열에 등록했습니다. 창을 닫아도 계속됩니다.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "측정을 시작하지 못했습니다."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (step !== 3 || !activeProjectId || activeProjectId.startsWith("preview-")) return;
    const timer = window.setInterval(async () => {
      const res = await fetch(`/api/ai-trust/projects/${activeProjectId}/summary`, { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) return;
      setSummary(data);
      const run = data.runs?.[0];
      if (run && ["COMPLETED", "FAILED"].includes(run.status)) { window.clearInterval(timer); setStep(4); setScreen("result"); }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [step, activeProjectId]);

  if (loading && !overview && !setupInfo) return <div className={styles.loadingPage}><RefreshCw className={styles.spin} size={20} /> GEO 레이더를 준비하는 중...</div>;
  if (setupInfo) return <SetupRequired info={setupInfo} onPreview={() => startPreview("new")} onPreviewResult={() => startPreview("result")} />;
  if (!overview) return <div className={styles.loadingPage}>{message || "GEO 레이더를 불러오지 못했습니다."}</div>;

  return (
    <div className={styles.app} data-surface={surface}>
      <header className={styles.titlebar}><div className={styles.windowDots}><i /><i /><i /></div><strong>GEO 레이더</strong><span>AI 추천 병원 역분석</span></header>
      <div className={styles.shell}>
        <aside className={styles.sidebar} data-open={sidebarOpen || undefined}>
          <div className={styles.sidebarHead}><strong>GEO 레이더</strong><button type="button" onClick={() => setSidebarOpen(false)} aria-label="메뉴 닫기"><X size={18} /></button></div>
          <button className={styles.newButton} type="button" onClick={startNew}><Plus size={16} /> 새 분석</button>
          <p className={styles.sideLabel}>클라이언트</p>
          <div className={styles.clientList}>{overview.clients.length ? overview.clients.map((client) => {
            const project = overview.projects.find((item) => item.client_id === client.id);
            return <button key={client.id} type="button" data-active={summary?.project.client_id === client.id || clientId === client.id || undefined} onClick={() => { setClientId(client.id); if (project) void openProject(project.id); else startNew(); }}><span>{client.hospital_name}</span><b>—</b></button>;
          }) : <span className={styles.emptySmall}>등록된 고객이 없습니다.</span>}</div>
          <p className={styles.sideLabel}>도구</p>
          <nav className={styles.sideNav}>
            <button type="button" onClick={() => setScreen("clinics")}><Building2 size={15} /> 병원 목록</button>
            <button type="button" onClick={() => setScreen("review")}><ClipboardCheck size={15} /> 검수 대기함 <b>{overview.review_count || ""}</b></button>
            <button type="button" onClick={() => setScreen("settings")}><SlidersHorizontal size={15} /> 배점표 v1.0</button>
            <button type="button" onClick={() => setScreen("operations")}><Activity size={15} /> 운영 현황 · 비용</button>
          </nav>
        </aside>
        <main className={styles.main}>
          <button className={styles.mobileMenu} type="button" onClick={() => setSidebarOpen(true)}><Menu size={18} /> 메뉴</button>
          {message ? <div className={styles.notice} role="status">{message}</div> : null}
          {screen === "new" ? <NewAnalysis overview={overview} step={step} setStep={setStep} activeClientId={clientId || overview.clients[0]?.id || ""} setClientId={setClientId} activeRegion={activeRegion} setRegion={(region) => { if (region.id === "custom") setCustomRegion(region); setRegionId(region.id); setRadiusM(region.radius_m || 1000); setRegionTerms(region.region_terms || []); }} radiusM={radiusM} setRadiusM={setRadiusM} treatments={treatments} setTreatments={setTreatments} regionTerms={regionTerms} setRegionTerms={setRegionTerms} providers={providers} setProviders={setProviders} prompts={prompts} setPrompts={setPrompts} repeatCount={repeatCount} setRepeatCount={setRepeatCount} requestCount={requestCount} estimatedCost={estimatedCost} onConfirmScope={confirmScope} onStartRun={startRun} loading={loading} summary={summary} /> : null}
          {screen === "result" ? <ResultView summary={summary} tab={resultTab} setTab={setResultTab} onNew={startNew} onReload={() => activeProjectId && void openProject(activeProjectId)} /> : null}
          {screen === "clinics" ? <ClinicView summary={summary} sources={overview.clinic_sources} /> : null}
          {screen === "review" ? <ReviewView summary={summary} /> : null}
          {screen === "settings" ? <SettingsView overview={overview} /> : null}
          {screen === "operations" ? <OperationsView overview={overview} summary={summary} /> : null}
        </main>
      </div>
    </div>
  );
}

function NewAnalysis(props: {
  overview: GeoRadarOverview; step: number; setStep: (value: number) => void; activeClientId: string; setClientId: (value: string) => void;
  activeRegion?: GeoRadarRegion; setRegion: (region: GeoRadarRegion) => void; radiusM: number; setRadiusM: (value: number) => void;
  treatments: string[]; setTreatments: (value: string[]) => void; regionTerms: string[]; setRegionTerms: (value: string[]) => void;
  providers: Set<AiTrustProviderKey>; setProviders: (value: Set<AiTrustProviderKey>) => void; prompts: PromptRow[]; setPrompts: (value: PromptRow[]) => void;
  repeatCount: number; setRepeatCount: (value: number) => void; requestCount: number; estimatedCost: number;
  onConfirmScope: () => void; onStartRun: () => void; loading: boolean; summary: ProjectSummary | null;
}) {
  const client = props.overview.clients.find((item) => item.id === props.activeClientId) || props.overview.clients[0];
  const latestRun = props.summary?.runs?.[0] as { completed_requests?: number; total_requests?: number; failed_requests?: number; status?: string } | undefined;
  return <>
    <header className={styles.pageHeader}><div><p>새 분석</p><h1>{client ? `새 분석 — ${client.hospital_name}` : "새 분석"}</h1><span>범위를 정하고 그 지역에서 AI가 어떤 병원을 추천하는지 측정합니다.</span></div></header>
    <div className={styles.steps}>{["범위 · 병원", "질문 확인", "실행", "결과"].map((label, index) => <button type="button" key={label} data-active={props.step === index + 1 || undefined} data-done={props.step > index + 1 || undefined} onClick={() => props.step > index + 1 && props.setStep(index + 1)}><i>{index + 1}</i>{label}</button>)}</div>
    {props.step === 1 && props.activeRegion ? <div className={styles.twoColumns}>
      <section className={styles.card}><h2>분석 범위</h2><div className={styles.pillRow}>{props.overview.regions.map((region) => <button type="button" key={region.id} data-active={props.activeRegion?.id === region.id || undefined} onClick={() => props.setRegion(region)}>{region.name}</button>)}<button type="button" data-active={props.activeRegion.id === "custom" || undefined} onClick={() => props.setRegion({ id: "custom", name: "직접 지정", region_type: "custom", center_lat: props.activeRegion?.center_lat || 37.507287, center_lng: props.activeRegion?.center_lng || 127.033868, radius_m: props.radiusM, districts: [], region_terms: props.regionTerms })}>직접 지정</button></div>{props.activeRegion.id === "custom" ? <div className={styles.coordinateFields}><label>위도<input type="number" step="0.000001" value={props.activeRegion.center_lat || ""} onChange={(event) => props.setRegion({ ...props.activeRegion!, center_lat: Number(event.target.value) })} /></label><label>경도<input type="number" step="0.000001" value={props.activeRegion.center_lng || ""} onChange={(event) => props.setRegion({ ...props.activeRegion!, center_lng: Number(event.target.value) })} /></label></div> : null}<GeoRadarMap region={{ ...props.activeRegion, radius_m: props.radiusM }} clinics={[]} clientName={client?.hospital_name} />{["radius", "custom"].includes(props.activeRegion.region_type) ? <label className={styles.range}><span>반경 {(props.radiusM / 1000).toFixed(1)}km</span><input type="range" min={500} max={3000} step={100} value={props.radiusM} onChange={(event) => props.setRadiusM(Number(event.target.value))} /><small>3km</small></label> : null}<div className={styles.mapCounts}>범위 안 피부과 <strong>수집 전</strong> · 홈페이지 확인 <strong>수집 전</strong></div></section>
      <section className={styles.card}><h2>클라이언트 · 키워드</h2><label className={styles.field}>클라이언트 병원<select value={props.activeClientId} onChange={(event) => props.setClientId(event.target.value)}>{props.overview.clients.map((item) => <option key={item.id} value={item.id}>{item.hospital_name}{item.address ? ` · ${item.address}` : ""}</option>)}</select></label><TagEditor label="지역어" values={props.regionTerms} onChange={props.setRegionTerms} /><TagEditor label="주요 시술" values={props.treatments} onChange={props.setTreatments} /><span className={styles.fieldLabel}>측정할 AI</span><div className={styles.providerGrid}>{props.overview.providers.map((provider) => <button type="button" key={provider.provider} disabled={provider.status !== "CONNECTED"} data-active={props.providers.has(provider.provider) || undefined} onClick={() => { const next = new Set(props.providers); if (next.has(provider.provider)) next.delete(provider.provider); else next.add(provider.provider); props.setProviders(next); }}><strong>{provider.label}</strong><span>{provider.status === "CONNECTED" ? "연결됨" : "키 없음"}</span></button>)}</div><CostBox requests={12 * Math.max(props.providers.size, 0) * props.repeatCount} cost={props.estimatedCost} budget={props.overview.budgets.project_monthly_usd} /><button className={styles.primary} type="button" disabled={props.loading || !client || props.providers.size === 0} onClick={props.onConfirmScope}>다음: 질문 확인 <ArrowRight size={16} /></button></section>
    </div> : null}
    {props.step === 2 ? <section className={styles.card}><div className={styles.cardHead}><div><h2>질문 확인</h2><p>실제 고객이 묻는 방식으로 측정합니다. 수정·삭제·추가할 수 있습니다.</p></div><label className={styles.compactField}>반복 횟수<select value={props.repeatCount} onChange={(event) => props.setRepeatCount(Number(event.target.value))}>{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value}회</option>)}</select></label></div><div className={styles.promptList}>{props.prompts.map((prompt, index) => <div className={styles.promptRow} key={prompt.id || index}><span>{INTENT_LABEL[prompt.intent]}</span><input value={prompt.question} onChange={(event) => props.setPrompts(props.prompts.map((item, itemIndex) => itemIndex === index ? { ...item, question: event.target.value } : item))} /><button type="button" aria-label="질문 삭제" onClick={() => props.setPrompts(props.prompts.filter((_, itemIndex) => itemIndex !== index))}><X size={16} /></button></div>)}</div><button className={styles.secondary} type="button" onClick={() => props.setPrompts([...props.prompts, { source_keyword: "직접 입력", source: "MANUAL", intent: "RECOMMENDATION", question: "", language: "ko", region: props.activeRegion?.name || "", department: client?.specialty || "피부과", demand_score: null }])}><Plus size={15} /> 질문 추가</button><div className={styles.actionRow}><button className={styles.secondary} type="button" onClick={() => props.setStep(1)}><ChevronLeft size={16} /> 이전</button><div><CostBox requests={props.requestCount} cost={props.estimatedCost} budget={props.overview.budgets.project_monthly_usd} compact /><button className={styles.primary} type="button" disabled={!props.prompts.some((prompt) => prompt.question.trim()) || props.loading} onClick={props.onStartRun}>측정 실행 <ArrowRight size={16} /></button></div></div></section> : null}
    {props.step === 3 ? <section className={styles.execution}><div className={styles.radarPulse}><Radar size={30} /></div><h2>AI 추천 측정 진행 중</h2><p>작업은 서버 대기열에서 진행됩니다. 이 창을 닫거나 다른 앱을 사용해도 계속됩니다.</p><div className={styles.progress}><i style={{ width: `${latestRun?.total_requests ? Math.round((latestRun.completed_requests || 0) / latestRun.total_requests * 100) : 0}%` }} /></div><strong>{latestRun?.completed_requests || 0} / {latestRun?.total_requests || props.requestCount} 완료 · 실패 {latestRun?.failed_requests || 0}</strong><button className={styles.secondary} type="button" onClick={() => props.setStep(2)}>질문으로 돌아가기</button></section> : null}
  </>;
}

function ResultView({ summary, tab, setTab, onNew, onReload }: { summary: ProjectSummary | null; tab: ResultTab; setTab: (value: ResultTab) => void; onNew: () => void; onReload: () => void }) {
  if (!summary) return <EmptyState title="표시할 측정 결과가 없습니다." action="새 분석" onAction={onNew} />;
  const project = summary.project; const run = summary.runs?.[0] as { providers?: string[]; repeat_count?: number; question_count?: number; completed_requests?: number; total_requests?: number; created_at?: string } | undefined;
  const ranking = summary.consensusTop10 || [];
  const clientIndex = ranking.findIndex((row) => row.hospital?.canonical_name?.includes(project.client_hospital_name));
  const mention = clientIndex >= 0 ? ranking[clientIndex].mention_rate : 0;
  const clinics = (summary.projectClinics || []).map((row) => ({ ...row.clinic, is_client: row.is_client }));
  const projectRegion = Array.isArray(project.region_config) ? project.region_config[0] : project.region_config;
  const region: GeoRadarRegion = projectRegion || { id: project.region_id || "result", name: project.region, region_type: "custom", center_lat: null, center_lng: null, radius_m: null, districts: [], region_terms: [] };
  return <><header className={styles.pageHeader}><div><p>측정 결과</p><h1>{project.client_hospital_name} — {project.scope_label || project.region}</h1><span>{formatDate(run?.created_at || project.created_at)} 측정 · {(run?.providers || []).map((provider) => PROVIDER_LABEL[provider] || provider).join(" · ") || "연결된 AI"} · {run?.question_count || summary.prompts.length}개 질문 × {run?.repeat_count || 3}회 · API 기준 측정</span></div><button className={styles.secondary} type="button" onClick={onNew}><Plus size={15} /> 새 분석</button></header><div className={styles.metrics}><Metric label="AI 추천 언급률" value={`${Math.round(mention * 100)}%`} detail="지역 1위와 비교" /><Metric label="추천 순위" value={clientIndex >= 0 ? `${clientIndex + 1}위` : "미언급"} detail={`${ranking.length || "—"}곳 중`} /><Metric label="사이트 GEO 점수 v1.0" value="점검 예정" detail="2차 작업" /><Metric label="가장 큰 갭" value={summary.gaps?.[0]?.schema_key || "측정 전"} detail="기존 증거 기준" /></div><div className={styles.resultTabs}>{RESULT_TABS.map((item) => <button type="button" key={item.key} data-active={tab === item.key || undefined} onClick={() => setTab(item.key)}>{item.label}</button>)}</div>
    {tab === "ranking" ? <RankingTable rows={ranking} clientName={project.client_hospital_name} responses={summary.responses} prompts={summary.prompts} mentions={summary.mentions} /> : null}
    {tab === "map" ? <section className={styles.card}><GeoRadarMap region={region} clinics={clinics} clientName={project.client_hospital_name} /></section> : null}
    {tab === "site" ? <EmptyState title="사이트 GEO 점수는 2차 작업에서 연결합니다." detail="이번 측정에서는 실제 AI 추천 순위와 기존 evidence 기반 갭을 제공합니다." /> : null}
    {tab === "gap" ? <GapPanel summary={summary} onReload={onReload} /> : null}
    {tab === "trend" ? <TrendPanel summary={summary} currentMention={mention} currentRank={clientIndex >= 0 ? clientIndex + 1 : null} /> : null}
    {tab === "report" ? <ReportPanel summary={summary} /> : null}
  </>;
}

function RankingTable({ rows, clientName, responses, prompts, mentions }: {
  rows: ProjectSummary["consensusTop10"];
  clientName: string;
  responses: ProjectSummary["responses"];
  prompts: ProjectSummary["prompts"];
  mentions: ProjectSummary["mentions"];
}) {
  const [detail, setDetail] = useState<{ id: string; name: string } | null>(null);
  const [providerFilter, setProviderFilter] = useState("all");
  const [intentFilter, setIntentFilter] = useState("all");
  const promptIntent = useMemo(() => new Map(prompts.map((prompt) => [prompt.id || "", prompt.intent])), [prompts]);
  const filteredResponses = useMemo(() => responses.filter((response) =>
    (providerFilter === "all" || response.provider === providerFilter)
    && (intentFilter === "all" || promptIntent.get(response.prompt_id) === intentFilter)), [responses, providerFilter, intentFilter, promptIntent]);
  const filteredRows = useMemo(() => {
    if (providerFilter === "all" && intentFilter === "all") return rows;
    const responseById = new Map(filteredResponses.map((response) => [response.id, response]));
    const stats = new Map<string, { name: string; responses: Set<string>; top3: Set<string>; providers: Set<string> }>();
    for (const mention of mentions) {
      const response = responseById.get(mention.response_id);
      const hospitalId = mention.hospital_id || mention.hospital?.id;
      if (!response || !hospitalId) continue;
      const current = stats.get(hospitalId) || { name: mention.hospital?.canonical_name || mention.raw_name, responses: new Set<string>(), top3: new Set<string>(), providers: new Set<string>() };
      current.responses.add(response.id);
      if (mention.rank != null && mention.rank <= 3) current.top3.add(response.id);
      current.providers.add(response.provider);
      stats.set(hospitalId, current);
    }
    const denominator = Math.max(1, filteredResponses.length);
    return Array.from(stats, ([hospitalId, value]) => ({
      id: `filtered-${hospitalId}`, hospital_id: hospitalId,
      mention_rate: value.responses.size / denominator, top3_rate: value.top3.size / denominator,
      provider_consensus: value.providers.size, hospital: { id: hospitalId, canonical_name: value.name },
    })).sort((a, b) => b.mention_rate - a.mention_rate);
  }, [filteredResponses, intentFilter, mentions, providerFilter, rows]);
  const evidenceResponses = useMemo(() => {
    if (!detail) return [];
    const responseIds = new Set(mentions.filter((mention) => (mention.hospital_id || mention.hospital?.id) === detail.id).map((mention) => mention.response_id));
    return filteredResponses.filter((response) => responseIds.has(response.id)).slice(0, 5);
  }, [detail, filteredResponses, mentions]);
  const providerOptions = Array.from(new Set(responses.map((response) => response.provider)));
  return <><div className={styles.filterBar}><label>AI<select value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)}><option value="all">전체 AI</option>{providerOptions.map((provider) => <option key={provider} value={provider}>{PROVIDER_LABEL[provider] || provider}</option>)}</select></label><label>질문 유형<select value={intentFilter} onChange={(event) => setIntentFilter(event.target.value)}><option value="all">전체 유형</option>{Object.entries(INTENT_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div><div className={styles.resultColumns}><section className={styles.card}><h2>AI가 추천한 병원</h2><div className={styles.rankTable}><div className={styles.rankHead}><span>순위</span><span>병원</span><span>언급률</span><span>상위 3곳</span><span>AI 일치</span></div>{filteredRows.length ? filteredRows.map((row, index) => <button type="button" key={row.id} data-client={row.hospital?.canonical_name?.includes(clientName) || undefined} onClick={() => setDetail({ id: row.hospital_id || row.hospital?.id || "", name: row.hospital?.canonical_name || "확인 필요" })}><b>{index + 1}</b><strong>{row.hospital?.canonical_name || "확인 필요"}</strong><span className={styles.bar}><i style={{ width: `${Math.round(row.mention_rate * 100)}%` }} /></span><span>{Math.round(row.top3_rate * 100)}%</span><span>{row.provider_consensus}</span></button>) : <p className={styles.emptySmall}>선택한 조건에서 추천된 병원이 없습니다.</p>}</div></section><section className={styles.card}><h2>추천 답변 근거</h2>{detail ? <><h3>{detail.name}</h3>{evidenceResponses.length ? evidenceResponses.map((response) => <article className={styles.responseSnippet} key={response.id}><strong>{PROVIDER_LABEL[response.provider] || response.provider}</strong><p>{response.raw_response.slice(0, 320)}{response.raw_response.length > 320 ? "…" : ""}</p>{response.source_urls?.slice(0, 3).map((url) => <a key={url} href={url} target="_blank" rel="noreferrer">{safeHostname(url)}</a>)}</article>) : <p className={styles.emptySmall}>이 필터에 해당하는 답변 근거가 없습니다.</p>}</> : <p className={styles.emptySmall}>병원 행을 누르면 해당 병원이 나온 답변과 출처를 확인할 수 있습니다.</p>}</section></div></>;
}

function TrendPanel({ summary, currentMention, currentRank }: { summary: ProjectSummary; currentMention: number; currentRank: number | null }) {
  if (!summary.history.length) return <EmptyState title="비교할 이전 측정이 아직 없습니다." detail="같은 클라이언트와 범위로 다시 측정하면 언급률과 순위 변화를 표시합니다." />;
  const past = summary.history.map((project) => {
    const matching = summary.historyConsensus.filter((row) => row.project_id === project.id).sort((a, b) => b.mention_rate - a.mention_rate);
    const index = matching.findIndex((row) => row.hospital?.canonical_name?.includes(summary.project.client_hospital_name));
    return { id: project.id, date: project.runs?.[0]?.created_at || project.created_at, mention: index >= 0 ? matching[index].mention_rate : 0, rank: index >= 0 ? index + 1 : null };
  });
  const items = [...past, { id: summary.project.id, date: String((summary.runs?.[0] as Record<string, unknown> | undefined)?.created_at || summary.project.created_at), mention: currentMention, rank: currentRank }].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return <section className={styles.card}><h2>추천 언급률 · 순위 추이</h2>{items.map((item) => <div className={styles.trendRow} key={item.id}><span>{formatDate(item.date)}</span><span className={styles.bar}><i style={{ width: `${Math.round(item.mention * 100)}%` }} /></span><strong>{Math.round(item.mention * 100)}%</strong><b>{item.rank ? `${item.rank}위` : "미언급"}</b></div>)}</section>;
}

function GapPanel({ summary, onReload }: { summary: ProjectSummary; onReload: () => void }) {
  const [status, setStatus] = useState("");
  async function run(path: "score" | "generate-strategy") {
    setStatus(path === "score" ? "기존 근거로 갭 점수를 계산하는 중..." : "전략과 촬영 계획을 만드는 중...");
    const response = await fetch(`/api/ai-trust/projects/${summary.project.id}/${path}`, { method: "POST" });
    const data = await response.json();
    if (!data.ok) return setStatus(data.error || "작업을 완료하지 못했습니다.");
    setStatus(path === "score" ? `갭 ${data.gaps || 0}개를 계산했습니다.` : `전략 ${data.strategies || 0}개와 촬영 계획 ${data.shoot_plan || 0}개를 만들었습니다.`);
    onReload();
  }
  return <>
    <div className={styles.actionStrip}>
      <span>{status || "기존 AI Trust Gap의 점수·전략·촬영 계획 기능을 그대로 사용합니다. 사이트 수집은 이번 단계에서 실행하지 않습니다."}</span>
      <button className={styles.secondary} type="button" onClick={() => void run("score")}>갭 다시 계산</button>
      <button className={styles.secondary} type="button" disabled={!summary.gaps?.length} onClick={() => void run("generate-strategy")}>전략·촬영 계획 생성</button>
    </div>
    <div className={styles.threeColumns}>
      <section className={styles.card}><h2>신뢰 격차</h2>{summary.gaps?.length ? summary.gaps.slice(0, 6).map((item) => <div className={styles.listRow} key={item.schema_key}><span>{item.rank}. {item.schema_key}</span><b>{Math.round(item.gap)}</b></div>) : <p className={styles.emptySmall}>기존 근거가 있으면 갭 점수를 계산해 표시합니다.</p>}</section>
      <section className={styles.card}><h2>전략</h2>{summary.strategies?.length ? summary.strategies.map((item) => <article className={styles.textItem} key={item.id}><strong>{item.title}</strong><p>{item.summary}</p></article>) : <p className={styles.emptySmall}>기존 전략 생성 기능의 결과가 여기에 표시됩니다.</p>}</section>
      <section className={styles.card}><h2>촬영 계획</h2>{summary.shootPlan?.length ? summary.shootPlan.map((item) => <article className={styles.textItem} key={item.id}><strong>{item.title}</strong><p>{item.description}</p></article>) : <p className={styles.emptySmall}>기존 촬영 계획 결과가 여기에 표시됩니다.</p>}</section>
    </div>
  </>;
}

function ReportPanel({ summary }: { summary: ProjectSummary }) { const download = () => { const lines = [["순위","병원","언급률","상위 3곳 비율","AI 일치"], ...summary.consensusTop10.map((row,index) => [String(index+1), row.hospital?.canonical_name || "", String(row.mention_rate), String(row.top3_rate), String(row.provider_consensus)])]; const blob = new Blob(["\uFEFF" + lines.map((row) => row.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${summary.project.client_hospital_name}-geo-radar.csv`; anchor.click(); URL.revokeObjectURL(url); }; return <section className={styles.card}><h2>측정 데이터 내보내기</h2><p>순위와 언급률 집계를 CSV로 내려받습니다. PDF 보고서는 2차 작업 예정입니다.</p><button className={styles.primary} type="button" onClick={download}><Download size={16} /> CSV 내보내기</button></section>; }
function ClinicView({ summary, sources }: { summary: ProjectSummary | null; sources: GeoRadarOverview["clinic_sources"] }) {
  const clinics = summary?.projectClinics || [];
  const [syncState, setSyncState] = useState("");
  async function syncClinics() {
    if (!summary?.project.id) return;
    setSyncState("병원 목록 작업을 등록하는 중...");
    const response = await fetch(`/api/ai-trust/projects/${summary.project.id}/clinic-sync`, { method: "POST" });
    const data = await response.json();
    setSyncState(data.ok ? "병원 목록 동기화를 대기열에 등록했습니다." : data.error || "등록하지 못했습니다.");
  }
  return <><header className={styles.pageHeader}><div><p>도구</p><h1>병원 목록</h1><span>범위 안 병원을 공공데이터에서 수집하고 중복을 병합합니다.</span></div>{summary?.project.id ? <button className={styles.secondary} type="button" disabled={!sources.hira} onClick={() => void syncClinics()}><RefreshCw size={15} /> 병원 목록 동기화</button> : null}</header>{syncState ? <div className={styles.notice} role="status">{syncState}</div> : null}<section className={styles.card}><div className={styles.sourceStatus}><span data-ok={sources.hira || undefined}>건강보험심사평가원 {sources.hira ? "연결됨" : "키 없음"}</span><span data-ok={sources.kakao || undefined}>카카오 로컬 {sources.kakao ? "연결됨" : "키 없음"}</span></div>{clinics.length ? clinics.map((row) => <div className={styles.listRow} key={row.clinic.id}><span><strong>{row.clinic.canonical_name}</strong><small>{row.clinic.address}</small></span><b>{row.clinic.website ? "홈페이지 확인" : "홈페이지 없음"}</b></div>) : <EmptyState title="수집된 병원 목록이 없습니다." detail="분석 범위를 확정한 뒤 병원 목록 동기화를 실행해 주세요." />}</section><p className={styles.attribution}>출처: 건강보험심사평가원 · 공공누리 제1유형</p></>;
}
function ReviewView({ summary }: { summary: ProjectSummary | null }) {
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [loaded, setLoaded] = useState<{ reviews: ReviewQueueRow[]; clinics: GeoRadarClinic[] } | null>(null);
  useEffect(() => {
    let active = true;
    void fetch("/api/ai-trust/review-queue", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        if (data.ok) setLoaded({ reviews: data.reviews || [], clinics: data.clinics || [] });
        else setStatus(data.error || "검수 대기함을 불러오지 못했습니다.");
      })
      .catch(() => { if (active) setStatus("검수 대기함을 불러오지 못했습니다."); });
    return () => { active = false; };
  }, []);
  const clinics = loaded?.clinics || summary?.projectClinics.map((row) => row.clinic) || [];
  const reviews = (loaded?.reviews || summary?.reviewQueue || []).filter((item) => !resolved.has(item.id));
  async function review(id: string, action: "match" | "create" | "ignore", rawName: string, proposedClinicId?: string | null) {
    setStatus("검수 결과를 저장하는 중...");
    const response = await fetch(`/api/ai-trust/review-queue/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, clinic_id: selected[id] || proposedClinicId || "", canonical_name: rawName }),
    });
    const data = await response.json();
    if (!data.ok) return setStatus(data.error || "검수 결과를 저장하지 못했습니다.");
    setResolved((current) => new Set(current).add(id));
    setStatus("검수 결과를 저장했습니다.");
  }
  return <><header className={styles.pageHeader}><div><p>도구</p><h1>검수 대기함</h1><span>병원 자동 매칭 신뢰도가 낮은 응답만 확인합니다.</span></div></header>{status ? <div className={styles.notice} role="status">{status}</div> : null}<section className={styles.card}>{reviews.length ? reviews.map((item) => <div className={styles.reviewRow} key={item.id}><span><strong>{item.raw_name}</strong><small>자동 매칭 신뢰도 {Math.round(Number(item.confidence || 0) * 100)}%</small></span><select value={selected[item.id] || item.proposed_clinic_id || ""} onChange={(event) => setSelected((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">맞는 병원 선택</option>{clinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.canonical_name}</option>)}</select><button className={styles.secondary} type="button" disabled={!selected[item.id] && !item.proposed_clinic_id} onClick={() => void review(item.id, "match", item.raw_name, item.proposed_clinic_id)}>연결</button><button className={styles.secondary} type="button" onClick={() => void review(item.id, "create", item.raw_name)}>새 병원 등록</button><button className={styles.weakButton} type="button" onClick={() => void review(item.id, "ignore", item.raw_name)}>무시</button></div>) : <EmptyState title="현재 검수할 항목이 없습니다." />}</section></>;
}
function SettingsView({ overview }: { overview: GeoRadarOverview }) { return <><header className={styles.pageHeader}><div><p>설정</p><h1>배점표 v1.0</h1><span>단가와 예산은 DB 설정 및 환경변수로 관리합니다.</span></div></header><section className={styles.card}><h2>AI 단가 설정</h2>{Object.entries(overview.pricing).map(([provider, price]) => <div className={styles.listRow} key={provider}><span><strong>{PROVIDER_LABEL[provider] || provider}</strong><small>입력 ${price.input_per_million}/100만 토큰 · 출력 ${price.output_per_million}/100만 토큰 · 검색 ${price.web_search}/회</small></span><b>{price.input_per_million || price.output_per_million || price.web_search ? "설정됨" : "확인 필요"}</b></div>)}</section></>; }
function OperationsView({ overview, summary }: { overview: GeoRadarOverview; summary: ProjectSummary | null }) {
  const statuses = ["PENDING", "RUNNING", "RETRY", "FAILED", "COMPLETED"];
  const totalCost = overview.costs.reduce((sum, item) => sum + Number(item.amount_usd || 0), 0);
  return <>
    <header className={styles.pageHeader}><div><p>운영</p><h1>운영 현황 · 비용</h1><span>작업 대기열, 재시도와 이번 달 API 비용을 확인합니다.</span></div></header>
    <div className={styles.metrics}>{statuses.slice(0, 4).map((status) => <Metric key={status} label={STATUS_LABEL[status]} value={String(overview.jobs.filter((job) => job.status === status).length)} detail="작업" />)}</div>
    <section className={styles.card}><h2>이번 달 비용</h2><strong className={styles.bigCost}>${totalCost.toFixed(4)}</strong><p>전체 월 예산 ${overview.budgets.global_monthly_usd}</p><h2>최근 작업</h2>{overview.jobs.slice(0, 20).map((job) => <div className={styles.listRow} key={job.id}><span><strong>{JOB_LABEL[job.job_type] || job.job_type}</strong><small>{job.error || formatDate(job.updated_at)}</small></span><b>{STATUS_LABEL[job.status] || job.status}</b></div>)}</section>
    {summary?.dataSources?.length ? <section className={styles.card}><h2>데이터 연결 상태</h2>{summary.dataSources.map((source) => <div className={styles.listRow} key={source.source_key}><span><strong>{source.source_name}</strong><small>{source.message || "상태 확인"}</small></span><b>{source.status === "CONNECTED" ? "연결됨" : source.status === "MANUAL_DATA" ? "직접 입력" : "연결 필요"}</b></div>)}</section> : null}
  </>;
}
function SetupRequired({ info, onPreview, onPreviewResult }: { info: { error: string; apply_order: string[] }; onPreview: () => void; onPreviewResult: () => void }) { return <div className={styles.setupPage}><Radar size={34} /><h1>GEO 레이더 설정이 필요합니다</h1><p>{info.error}</p><ol>{info.apply_order.map((item) => <li key={item}><code>{item}</code></li>)}</ol><p>운영 DB에는 자동 적용하지 않습니다. 파일을 검토한 뒤 직접 실행해 주세요.</p><div className={styles.setupActions}><button className={styles.primary} type="button" onClick={onPreview}>새 분석 화면 확인</button><button className={styles.secondary} type="button" onClick={onPreviewResult}>샘플 결과 확인</button></div></div>; }
function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <section className={styles.metric}><span>{label}</span><strong>{value}</strong><small>{detail}</small></section>; }
function EmptyState({ title, detail, action, onAction }: { title: string; detail?: string; action?: string; onAction?: () => void }) { return <div className={styles.empty}><MapPinned size={24} /><strong>{title}</strong>{detail ? <p>{detail}</p> : null}{action && onAction ? <button className={styles.secondary} type="button" onClick={onAction}>{action}</button> : null}</div>; }
function CostBox({ requests, cost, budget, compact }: { requests: number; cost: number; budget: number; compact?: boolean }) { return <div className={styles.costBox} data-compact={compact || undefined}><CircleDollarSign size={18} /><span>총 <strong>{requests}회</strong> · {requests === 0 ? "AI를 선택해 주세요" : cost > 0 ? `약 $${cost.toFixed(2)}` : "단가표 확인 필요"}<small>이번 달 프로젝트 예산 ${budget}달러</small></span></div>; }
function TagEditor({ label, values, onChange }: { label: string; values: string[]; onChange: (value: string[]) => void }) { const [draft, setDraft] = useState(""); return <label className={styles.field}>{label}<div className={styles.tags}>{values.map((value,index) => <button type="button" key={`${value}-${index}`} onClick={() => onChange(values.filter((_,itemIndex) => itemIndex !== index))}>{value}<X size={11} /></button>)}<input value={draft} placeholder="+ 추가" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && draft.trim()) { event.preventDefault(); onChange([...values, draft.trim()]); setDraft(""); } }} /></div></label>; }
function makePreviewPrompts(region: string, department: string, treatment: string): PromptRow[] { const items: Array<[AiTrustIntent,string]> = [["LOCATION",`${region} 주변 ${department}를 찾아줘`],["RECOMMENDATION",`${region} 근처에서 괜찮은 ${department} 추천해줘`],["RECOMMENDATION",`${region}에서 평이 좋은 ${department}는 어디야?`],["TREATMENT",`${region} 근처에서 ${treatment} 받으려면 어느 ${department}가 좋아?`],["PRICE",`${region} ${treatment} 비용과 선택 기준을 알려줘`],["TRUST",`${region}에서 과잉진료 걱정 없이 신뢰할 만한 ${department}를 찾고 싶어`],["CONDITION",`${region}에서 상담을 꼼꼼하게 해주는 ${department} 추천해줘`],["CONDITION",`${region}에서 예약과 접근이 편한 ${department}는 어디야?`],["RECOMMENDATION",`${region} ${department} 중 후기와 의료진 정보를 함께 비교해줘`],["TRUST",`${region} ${department} 중 안전 정보가 잘 된 곳을 추천해줘`],["CONDITION",`${region}에서 시설과 장비 정보를 확인할 수 있는 ${department}를 알려줘`],["RECOMMENDATION",`${region} 주변 ${department}를 여러 출처를 바탕으로 순위와 이유를 함께 추천해줘`]]; return items.map(([intent,question]) => ({ source_keyword: question, source: "GEO_RADAR_V1", intent, question, language: "ko", region, department, demand_score: null })); }
function formatDate(value?: string) { return value ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—"; }
function safeHostname(value: string) { try { return new URL(value).hostname; } catch { return value; } }
function csvCell(value: string) { return `"${String(value).replace(/"/g, '""')}"`; }
