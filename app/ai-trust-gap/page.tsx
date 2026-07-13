"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Database,
  FileSearch,
  Gauge,
  Layers3,
  Play,
  Radar,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { AI_TRUST_DEMAND_SOURCES, AI_TRUST_EVIDENCE_SCHEMAS, AI_TRUST_INTENTS } from "@/lib/ai-trust/constants";
import type { AiTrustGeneratedPrompt, AiTrustProviderStatus } from "@/lib/ai-trust/types";

// 다른 기능 페이지(색감 체크, 사진 보정, 트렌드 대시보드 등)와 동일한 팔레트로 통일
const C = {
  teal: "#155855",
  orange: "#E85D2C",
  gold: "#EB8F22",
  bg: "#EDF5F3",
  white: "#FFFFFF",
  paper: "#F7FAF9",
  border: "rgba(21,88,85,.12)",
  borderStrong: "rgba(21,88,85,.2)",
  muted: "#5A7470",
  hint: "#9BB5B0",
  txt: "#1C2B28",
  light: "#EAF4F2",
  green: "#059669",
  amber: "#D97706",
  red: "#DC2626",
  shadow: "0 2px 12px rgba(21,88,85,.06)",
};

type ClientRow = {
  id: string;
  name: string;
  hospital_name?: string;
  department?: string;
  specialty?: string;
};

type ProjectRow = {
  id: string;
  project_name: string;
  client_hospital_name: string;
  region: string;
  department: string;
  status: string;
  created_at: string;
};

type SummaryData = {
  project: ProjectRow;
  prompts: AiTrustGeneratedPrompt[];
  runs: Array<{ id: string; status: string; completed_requests: number; failed_requests: number; total_requests: number; created_at: string }>;
  responses: Array<{ id: string; provider: string; question: string; raw_response: string; response_status: string; executed_at: string }>;
  hospitals: Array<{ id: string; canonical_name: string; aliases: string[] }>;
  consensusTop10: Array<{
    id: string;
    mention_rate: number;
    top1_rate: number;
    top3_rate: number;
    provider_consensus: number;
    intent_coverage: number;
    repeat_stability: number;
    hospital?: { canonical_name?: string };
  }>;
  evidence: unknown[];
  scores: unknown[];
  gaps: Array<{ id: string; schema_key: string; recommended_avg: number; client_score: number; gap: number; rank: number }>;
  strategies: unknown[];
  shootPlan: unknown[];
};

type FormState = {
  project_name: string;
  client_id: string;
  client_hospital_name: string;
  region: string;
  department: string;
  treatments: string;
  symptoms: string;
  target_age: string;
  target_gender: string;
  target_countries: string;
  target_languages: string;
  competitor_hospitals: string;
  manual_keywords: string;
  memo: string;
};

const initialForm: FormState = {
  project_name: "",
  client_id: "",
  client_hospital_name: "",
  region: "",
  department: "",
  treatments: "",
  symptoms: "",
  target_age: "",
  target_gender: "",
  target_countries: "",
  target_languages: "",
  competitor_hospitals: "",
  manual_keywords: "",
  memo: "",
};

const steps = [
  { label: "Project", desc: "분석 생성", icon: FileSearch },
  { label: "Demand", desc: "수요 데이터", icon: Database },
  { label: "Prompt", desc: "질문 검토", icon: Search },
  { label: "AI Audit", desc: "반복 질의", icon: Play },
  { label: "Consensus", desc: "추천 병원", icon: Layers3 },
  { label: "Evidence", desc: "실제 증거", icon: ShieldCheck },
  { label: "Trust Gap", desc: "격차 분석", icon: Radar },
  { label: "Strategy", desc: "전략", icon: Sparkles },
  { label: "Shoot", desc: "촬영 기획", icon: Activity },
];

function splitText(value: string) {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

function statusColor(status: string) {
  if (status === "CONNECTED" || status === "MANUAL_DATA") return C.green;
  if (status === "API_REQUIRED") return C.amber;
  if (status === "NOT_CONNECTED") return C.hint;
  if (status === "FAILED") return C.red;
  return C.teal;
}

export default function AiTrustGapPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [providers, setProviders] = useState<AiTrustProviderStatus[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [prompts, setPrompts] = useState<AiTrustGeneratedPrompt[]>([]);
  const [selectedPromptIds, setSelectedPromptIds] = useState<Set<number>>(new Set());
  const [repeatCount, setRepeatCount] = useState(5);
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(new Set(["openai", "gemini"]));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [activeProjectId, setActiveProjectId] = useState("");
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [runningAction, setRunningAction] = useState("");

  const selectedPromptCount = selectedPromptIds.size || prompts.length;
  const activeProviderCount = providers.filter((provider) => selectedProviders.has(provider.provider) && provider.status === "CONNECTED").length;
  const estimatedRequests = selectedPromptCount * Math.max(activeProviderCount, 0) * repeatCount;

  const groupedPrompts = useMemo(() => {
    return AI_TRUST_INTENTS.map((intent) => ({
      ...intent,
      prompts: prompts.map((prompt, index) => ({ prompt, index })).filter((item) => item.prompt.intent === intent.key),
    }));
  }, [prompts]);

  const set = (key: keyof FormState, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const load = async () => {
    const [clientsRes, providersRes, projectsRes] = await Promise.all([
      fetch("/api/clients"),
      fetch("/api/ai-trust/provider-status"),
      fetch("/api/ai-trust/projects"),
    ]);
    const clientsData = await clientsRes.json();
    const providersData = await providersRes.json();
    const projectsData = await projectsRes.json();
    if (clientsData.ok) setClients(clientsData.clients || []);
    if (providersData.ok) setProviders(providersData.providers || []);
    if (projectsData.ok) setProjects(projectsData.projects || []);
  };

  useEffect(() => {
    load().catch(() => setMessage("초기 데이터를 불러오지 못했습니다."));
  }, []);

  const selectClient = (clientId: string) => {
    const client = clients.find((item) => item.id === clientId);
    setForm((prev) => ({
      ...prev,
      client_id: clientId,
      client_hospital_name: client?.name || client?.hospital_name || prev.client_hospital_name,
      department: client?.department || client?.specialty || prev.department,
    }));
  };

  const generatePreview = async () => {
    setMessage("");
    const res = await fetch("/api/ai-trust/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        keywords: splitText(form.manual_keywords).length ? splitText(form.manual_keywords) : [`${form.region} ${form.department}`, `${form.region} ${form.department} 추천`],
        treatments: splitText(form.treatments),
        symptoms: splitText(form.symptoms),
        region: form.region,
        department: form.department,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      setMessage(data.error || "질문 생성에 실패했습니다.");
      return;
    }
    setPrompts(data.prompts || []);
    setSelectedPromptIds(new Set((data.prompts || []).map((_: AiTrustGeneratedPrompt, index: number) => index)));
  };

  const createProject = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/ai-trust/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.ok) {
        setMessage(data.error || "프로젝트 생성에 실패했습니다. Supabase schema 적용 여부를 확인하세요.");
        return;
      }
      setMessage("AI 추천 병원 분석 프로젝트를 생성했습니다.");
      setProjects((prev) => [data.project, ...prev]);
      setActiveProjectId(data.project.id);
      setPrompts(data.prompts || []);
      setSelectedPromptIds(new Set((data.prompts || []).map((_: AiTrustGeneratedPrompt, index: number) => index)));
      await loadSummary(data.project.id);
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async (projectId: string) => {
    if (!projectId) return;
    const res = await fetch(`/api/ai-trust/projects/${projectId}/summary`);
    const data = await res.json();
    if (data.ok) setSummary(data);
    setActiveProjectId(projectId);
  };

  const createAuditRun = async () => {
    if (!activeProjectId) {
      setMessage("먼저 프로젝트를 생성하거나 선택하세요.");
      return;
    }
    setRunningAction("audit");
    setMessage("");
    try {
      const res = await fetch("/api/ai-trust/audit-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: activeProjectId,
          providers: Array.from(selectedProviders),
          repeat_count: repeatCount,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMessage(data.error || "AI Audit 실행 준비에 실패했습니다.");
        return;
      }
      setMessage(`AI Audit Run을 생성했습니다. 총 ${data.total_requests}개 요청이 큐에 등록되었습니다.`);
      await loadSummary(activeProjectId);
    } finally {
      setRunningAction("");
    }
  };

  const processLatestRun = async () => {
    const runId = summary?.runs?.[0]?.id;
    if (!runId) {
      setMessage("처리할 Audit Run이 없습니다.");
      return;
    }
    setRunningAction("process");
    setMessage("");
    try {
      const res = await fetch(`/api/ai-trust/audit-runs/${runId}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_size: 3 }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMessage(data.error || "AI Audit 처리에 실패했습니다.");
        return;
      }
      setMessage(`${data.processed || 0}개 요청을 처리했습니다.`);
      await loadSummary(activeProjectId);
    } finally {
      setRunningAction("");
    }
  };

  const analyzeResponses = async () => {
    if (!activeProjectId) return;
    setRunningAction("analyze");
    setMessage("");
    try {
      const res = await fetch(`/api/ai-trust/projects/${activeProjectId}/analyze-responses`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) {
        setMessage(data.error || "응답 분석에 실패했습니다.");
        return;
      }
      setMessage(`병원명 추출과 Consensus 계산을 완료했습니다. TOP 후보 ${data.consensus_count || 0}개`);
      await loadSummary(activeProjectId);
    } finally {
      setRunningAction("");
    }
  };

  const runProjectStep = async (path: "collect-evidence" | "score" | "generate-strategy") => {
    if (!activeProjectId) return;
    setRunningAction(path);
    setMessage("");
    try {
      const res = await fetch(`/api/ai-trust/projects/${activeProjectId}/${path}`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) {
        setMessage(data.error || `${path} 실행에 실패했습니다.`);
        return;
      }
      const labels = {
        "collect-evidence": `Evidence 수집 완료: 문서 ${data.collected || 0}개, 근거 ${data.facts || 0}개`,
        score: `Rule Based Score 계산 완료: 점수 ${data.scores || 0}개, Gap ${data.gaps || 0}개`,
        "generate-strategy": `Strategy ${data.strategies || 0}개, Shoot Plan ${data.shoot_plan || 0}개 생성`,
      };
      setMessage(labels[path]);
      await loadSummary(activeProjectId);
    } finally {
      setRunningAction("");
    }
  };

  const togglePrompt = (index: number) => {
    setSelectedPromptIds((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectIntent = (intent: string) => {
    const indexes = prompts.map((prompt, index) => ({ prompt, index })).filter((item) => item.prompt.intent === intent).map((item) => item.index);
    setSelectedPromptIds(new Set(indexes));
  };

  return (
    <div style={{ color: C.txt, minHeight: "100vh", background: C.bg, fontFamily: "var(--font-sans)" }}>
      <PageHeader title="AI 추천 병원 역분석" />
      <main style={{ maxWidth: 1400, margin: "0 auto", padding: "28px 22px 88px" }}>
        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) minmax(360px, .65fr)", gap: 20, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <Hero />
            <StepNav />
            <ProjectForm
              clients={clients}
              form={form}
              loading={loading}
              message={message}
              onSet={set}
              onSelectClient={selectClient}
              onGeneratePreview={generatePreview}
              onSubmit={createProject}
            />
            <PromptReview
              prompts={prompts}
              groupedPrompts={groupedPrompts}
              selectedPromptIds={selectedPromptIds}
              onTogglePrompt={togglePrompt}
              onSelectAll={() => setSelectedPromptIds(new Set(prompts.map((_, index) => index)))}
              onClear={() => setSelectedPromptIds(new Set())}
              onSelectIntent={selectIntent}
            />
            <ExecutionPanel
              activeProjectId={activeProjectId}
              summary={summary}
              runningAction={runningAction}
              onCreateAuditRun={createAuditRun}
              onProcessLatestRun={processLatestRun}
              onAnalyzeResponses={analyzeResponses}
              onCollectEvidence={() => runProjectStep("collect-evidence")}
              onScore={() => runProjectStep("score")}
              onGenerateStrategy={() => runProjectStep("generate-strategy")}
              onReload={() => activeProjectId && loadSummary(activeProjectId)}
            />
          </div>
          <aside style={{ display: "flex", flexDirection: "column", gap: 14, position: "sticky", top: 18 }}>
            <ProviderPanel
              providers={providers}
              selectedProviders={selectedProviders}
              onToggle={(provider) => setSelectedProviders((prev) => {
                const next = new Set(prev);
                if (next.has(provider)) next.delete(provider);
                else next.add(provider);
                return next;
              })}
              repeatCount={repeatCount}
              setRepeatCount={setRepeatCount}
              estimatedRequests={estimatedRequests}
            />
            <DemandSourcePanel />
            <ProjectList projects={projects} activeProjectId={activeProjectId} onSelect={loadSummary} />
          </aside>
        </section>
        <ReportSkeleton summary={summary} />
      </main>
    </div>
  );
}

function Hero() {
  const signals = [
    { label: "Demand", value: "Seed 기반", desc: "가짜 검색량 없음" },
    { label: "Audit", value: "반복 질의", desc: "Provider별 원문 저장" },
    { label: "Shoot", value: "촬영 기획", desc: "Trust Gap 연결" },
  ];
  return (
    <section style={panelStyle}>
      <div style={{ display: "inline-flex", alignItems: "center", height: 24, padding: "0 10px", borderRadius: 999, background: "rgba(232,93,44,.09)", color: C.orange, fontSize: 10, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 12, border: "1px solid rgba(232,93,44,.22)" }}>AI Trust Gap</div>
      <h1 style={{ margin: 0, maxWidth: 640, fontSize: 24, letterSpacing: "-.02em", lineHeight: 1.35, color: C.teal, fontWeight: 900 }}>반복 추천 병원의 신뢰 증거를 찾아 촬영 전략으로 연결합니다.</h1>
      <p style={{ margin: "10px 0 0", maxWidth: 640, fontSize: 13, lineHeight: 1.75, color: C.muted }}>
        Demand → Prompt → AI Audit → Consensus → Evidence → Trust Gap → Strategy → Shoot Plan 흐름으로 분석합니다.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginTop: 18 }}>
        {signals.map((signal) => (
          <div key={signal.label} style={{ padding: 13, borderRadius: 12, background: C.light, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.orange, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em" }}>{signal.label}</div>
            <div style={{ marginTop: 8, fontSize: 14, color: C.teal, fontWeight: 800, lineHeight: 1.25 }}>{signal.value}</div>
            <div style={{ marginTop: 4, fontSize: 11, color: C.muted, lineHeight: 1.4 }}>{signal.desc}</div>
          </div>
        ))}
      </div>
      <Link href="/clients" style={{ marginTop: 16, height: 38, padding: "0 14px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.white, color: C.teal, display: "inline-flex", gap: 6, alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, textDecoration: "none", width: "fit-content" }}>
        고객 관리에서 병원 선택 <ArrowRight size={14} />
      </Link>
    </section>
  );
}

function StepNav() {
  return (
    <section className="pc-workflow-bar" style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, overflowX: "auto", boxShadow: C.shadow }}>
      <div className="pc-workflow-track" style={{ display: "flex", gap: 8 }}>
        {steps.map((step, index) => {
          const Icon = step.icon;
          const active = index < 4;
          return (
            <div key={step.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ minWidth: 124, padding: 10, borderRadius: 12, background: active ? C.light : C.paper, border: `1px solid ${active ? "rgba(21,88,85,.2)" : C.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: active ? C.teal : C.hint }}>
                  <span style={{ width: 24, height: 24, borderRadius: 7, display: "inline-flex", alignItems: "center", justifyContent: "center", background: active ? C.teal : "#E1E9E7", color: active ? "#fff" : C.muted }}>
                    <Icon size={13} />
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 800 }}>{step.label}</span>
                </div>
                <div style={{ marginTop: 6, fontSize: 10, color: C.muted, lineHeight: 1.35 }}>{step.desc}</div>
              </div>
              {index < steps.length - 1 && <ArrowRight size={14} color={active ? C.teal : C.hint} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ProjectForm({
  clients,
  form,
  loading,
  message,
  onSet,
  onSelectClient,
  onGeneratePreview,
  onSubmit,
}: {
  clients: ClientRow[];
  form: FormState;
  loading: boolean;
  message: string;
  onSet: (key: keyof FormState, value: string) => void;
  onSelectClient: (clientId: string) => void;
  onGeneratePreview: () => void;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} style={panelStyle}>
      <SectionTitle icon={<FileSearch size={16} />} title="분석 프로젝트 생성" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        <Field label="분석 프로젝트명 *"><input value={form.project_name} onChange={(e) => onSet("project_name", e.target.value)} placeholder="언주역 피부과 AI 추천 분석" style={inputS} /></Field>
        <Field label="클라이언트 병원 선택"><select value={form.client_id} onChange={(e) => onSelectClient(e.target.value)} style={inputS}><option value="">직접 입력</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name || client.hospital_name}</option>)}</select></Field>
        <Field label="클라이언트 병원 *"><input value={form.client_hospital_name} onChange={(e) => onSet("client_hospital_name", e.target.value)} placeholder="OO피부과" style={inputS} /></Field>
        <Field label="분석 지역 *"><input value={form.region} onChange={(e) => onSet("region", e.target.value)} placeholder="언주역" style={inputS} /></Field>
        <Field label="진료과 *"><input value={form.department} onChange={(e) => onSet("department", e.target.value)} placeholder="피부과" style={inputS} /></Field>
        <Field label="주요 시술"><input value={form.treatments} onChange={(e) => onSet("treatments", e.target.value)} placeholder="리쥬란, 써마지, 울쎄라" style={inputS} /></Field>
        <Field label="주요 증상"><input value={form.symptoms} onChange={(e) => onSet("symptoms", e.target.value)} placeholder="여드름, 기미, 홍조" style={inputS} /></Field>
        <Field label="타깃"><input value={[form.target_age, form.target_gender].filter(Boolean).join(" / ")} onChange={(e) => onSet("target_age", e.target.value)} placeholder="30대 / 여성" style={inputS} /></Field>
        <Field label="타깃 국가"><input value={form.target_countries} onChange={(e) => onSet("target_countries", e.target.value)} placeholder="한국, 일본" style={inputS} /></Field>
        <Field label="타깃 언어"><input value={form.target_languages} onChange={(e) => onSet("target_languages", e.target.value)} placeholder="한국어, 영어, 일본어" style={inputS} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 12 }}>
        <Field label="수동 Seed Keyword"><textarea value={form.manual_keywords} onChange={(e) => onSet("manual_keywords", e.target.value)} rows={5} placeholder={"언주역 피부과\n언주역 피부과 추천\n언주역 리쥬란"} style={textareaS} /></Field>
        <Field label="경쟁 병원 / 메모"><textarea value={[form.competitor_hospitals, form.memo].filter(Boolean).join("\n")} onChange={(e) => onSet("memo", e.target.value)} rows={5} placeholder="경쟁 병원은 선택 입력입니다. AI 반복 추천 결과에서 자동 발견하는 것이 기본입니다." style={textareaS} /></Field>
      </div>
      {message && <div style={{ marginTop: 12, padding: "11px 13px", borderRadius: 10, background: C.light, color: C.teal, fontSize: 12, lineHeight: 1.55, fontWeight: 800, border: `1px solid ${C.border}` }}>{message}</div>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14, flexWrap: "wrap" }}>
        <button type="button" onClick={onGeneratePreview} style={secondaryBtn}><RefreshCw size={15} /> 질문 미리보기</button>
        <button type="submit" disabled={loading} style={primaryBtn}>{loading ? "저장 중..." : "프로젝트 생성"} <CheckCircle2 size={15} /></button>
      </div>
    </form>
  );
}

function PromptReview({
  prompts,
  groupedPrompts,
  selectedPromptIds,
  onTogglePrompt,
  onSelectAll,
  onClear,
  onSelectIntent,
}: {
  prompts: AiTrustGeneratedPrompt[];
  groupedPrompts: { key: string; label: string; desc: string; prompts: { prompt: AiTrustGeneratedPrompt; index: number }[] }[];
  selectedPromptIds: Set<number>;
  onTogglePrompt: (index: number) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onSelectIntent: (intent: string) => void;
}) {
  return (
    <section style={panelStyle}>
      <SectionTitle icon={<Search size={16} />} title="질문 검토" right={`${selectedPromptIds.size || prompts.length} / ${prompts.length} 선택`} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button type="button" onClick={onSelectAll} style={miniBtn}>전체 선택</button>
        <button type="button" onClick={onClear} style={miniBtn}>전체 해제</button>
        {AI_TRUST_INTENTS.map((intent) => <button key={intent.key} type="button" onClick={() => onSelectIntent(intent.key)} style={miniBtn}>{intent.label}</button>)}
      </div>
      {prompts.length === 0 ? (
        <EmptyBox text="프로젝트 정보를 입력하고 질문 미리보기를 실행하세요." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {groupedPrompts.filter((group) => group.prompts.length > 0).map((group) => (
            <div key={group.key} style={{ border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", background: "rgba(255,255,255,.48)" }}>
              <div style={{ padding: "11px 13px", background: C.light, display: "flex", justifyContent: "space-between", gap: 12 }}>
                <strong style={{ fontSize: 12, color: C.teal }}>{group.label}</strong>
                <span style={{ fontSize: 11, color: C.muted }}>{group.prompts.length}개</span>
              </div>
              {group.prompts.map(({ prompt, index }) => (
                <label key={`${prompt.source_keyword}-${index}`} style={{ display: "grid", gridTemplateColumns: "16px 1fr", gap: 8, padding: "11px 13px", borderTop: `1px solid ${C.border}`, cursor: "pointer", alignItems: "start" }}>
                  <input
                    type="checkbox"
                    checked={selectedPromptIds.has(index)}
                    onChange={() => onTogglePrompt(index)}
                    style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0, accentColor: C.teal, cursor: "pointer" }}
                  />
                  <span>
                    <span style={{ display: "block", fontSize: 12, fontWeight: 800, color: C.txt, lineHeight: 1.5 }}>{prompt.question}</span>
                    <span style={{ display: "block", marginTop: 3, fontSize: 10, color: C.hint }}>source: {prompt.source} · keyword: {prompt.source_keyword} · volume: null</span>
                  </span>
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ProviderPanel({
  providers,
  selectedProviders,
  onToggle,
  repeatCount,
  setRepeatCount,
  estimatedRequests,
}: {
  providers: AiTrustProviderStatus[];
  selectedProviders: Set<string>;
  onToggle: (provider: string) => void;
  repeatCount: number;
  setRepeatCount: (count: number) => void;
  estimatedRequests: number;
}) {
  return (
    <section style={sideCard}>
      <SectionTitle icon={<Gauge size={16} />} title="AI Audit 설정" />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {providers.map((provider) => (
          <label key={provider.provider} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 11px", borderRadius: 10, background: C.light, cursor: provider.status === "CONNECTED" ? "pointer" : "not-allowed", border: `1px solid ${C.border}` }}>
            <input
              type="checkbox"
              checked={selectedProviders.has(provider.provider)}
              onChange={() => onToggle(provider.provider)}
              disabled={provider.status !== "CONNECTED"}
              style={{ width: 16, height: 16, flexShrink: 0, accentColor: C.teal, cursor: "inherit" }}
            />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 12, fontWeight: 800, color: C.teal }}>{provider.label}</span>
              <span style={{ display: "block", fontSize: 10, color: C.muted }}>{provider.note}</span>
            </span>
            <span style={{ fontSize: 10, fontWeight: 800, color: statusColor(provider.status), flexShrink: 0, whiteSpace: "nowrap" }}>{provider.status}</span>
          </label>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <label style={{ fontSize: 11, fontWeight: 900, color: C.muted }}>반복 실행 횟수</label>
        <input type="range" min={1} max={20} value={repeatCount} onChange={(e) => setRepeatCount(Number(e.target.value))} style={{ width: "100%" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.muted }}>
          <span>{repeatCount}회</span>
          <span>1~20회</span>
        </div>
      </div>
      <div style={{ marginTop: 12, padding: 14, borderRadius: 12, background: `linear-gradient(135deg, #569082 0%, ${C.teal} 100%)`, color: "#fff" }}>
        <div style={{ fontSize: 10, opacity: .7, fontWeight: 900, letterSpacing: ".08em" }}>ESTIMATED API REQUESTS</div>
        <div style={{ fontSize: 28, fontWeight: 900, marginTop: 2 }}>{estimatedRequests.toLocaleString("ko-KR")}</div>
        <div style={{ fontSize: 11, opacity: .76, marginTop: 3 }}>Provider Pricing 설정 필요</div>
      </div>
    </section>
  );
}

function DemandSourcePanel() {
  return (
    <section style={sideCard}>
      <SectionTitle icon={<Database size={16} />} title="Demand Data Source" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {AI_TRUST_DEMAND_SOURCES.map((source) => (
          <div key={source.key} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ width: 92, flexShrink: 0, fontSize: 10, fontWeight: 900, color: statusColor(source.status) }}>{source.status}</span>
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: 11, fontWeight: 900, color: C.txt }}>{source.label}</span>
              <span style={{ display: "block", fontSize: 10, color: C.muted, lineHeight: 1.45 }}>{source.desc}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProjectList({ projects, activeProjectId, onSelect }: { projects: ProjectRow[]; activeProjectId: string; onSelect: (id: string) => void }) {
  return (
    <section style={sideCard}>
      <SectionTitle icon={<FileSearch size={16} />} title="최근 분석 프로젝트" />
      {projects.length === 0 ? <EmptyBox text="생성된 분석 프로젝트가 없습니다." /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {projects.slice(0, 6).map((project) => (
            <button key={project.id} type="button" onClick={() => onSelect(project.id)} style={{ padding: 11, borderRadius: 10, border: `1px solid ${activeProjectId === project.id ? C.teal : C.border}`, background: activeProjectId === project.id ? C.light : C.white, textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: C.teal, marginBottom: 4 }}>{project.project_name}</div>
              <div style={{ fontSize: 10, color: C.muted }}>{project.client_hospital_name} · {project.region} · {project.department}</div>
              <div style={{ marginTop: 6, fontSize: 10, fontWeight: 900, color: statusColor(project.status) }}>{project.status}</div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function ExecutionPanel({
  activeProjectId,
  summary,
  runningAction,
  onCreateAuditRun,
  onProcessLatestRun,
  onAnalyzeResponses,
  onCollectEvidence,
  onScore,
  onGenerateStrategy,
  onReload,
}: {
  activeProjectId: string;
  summary: SummaryData | null;
  runningAction: string;
  onCreateAuditRun: () => void;
  onProcessLatestRun: () => void;
  onAnalyzeResponses: () => void;
  onCollectEvidence: () => void;
  onScore: () => void;
  onGenerateStrategy: () => void;
  onReload: () => void;
}) {
  const latestRun = summary?.runs?.[0];
  const progress = latestRun?.total_requests ? Math.round((latestRun.completed_requests / latestRun.total_requests) * 100) : 0;
  return (
    <section style={panelStyle}>
      <SectionTitle icon={<Play size={16} />} title="AI Audit 실행" right={activeProjectId ? "프로젝트 선택됨" : "프로젝트 미선택"} />
      {!activeProjectId ? <EmptyBox text="프로젝트를 생성하거나 최근 분석 프로젝트에서 선택하세요." /> : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 12 }}>
            <Metric label="질문" value={summary?.prompts?.length || 0} />
            <Metric label="AI 응답 원문" value={summary?.responses?.length || 0} />
            <Metric label="정규화 병원" value={summary?.hospitals?.length || 0} />
            <Metric label="Consensus TOP" value={summary?.consensusTop10?.length || 0} />
            <Metric label="Evidence" value={summary?.evidence?.length || 0} />
            <Metric label="Trust Gap" value={summary?.gaps?.length || 0} />
            <Metric label="Shoot Plan" value={summary?.shootPlan?.length || 0} />
          </div>
          {latestRun && (
            <div style={{ padding: 13, borderRadius: 13, background: C.light, marginBottom: 12, border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 900, color: C.teal, marginBottom: 7 }}>
                <span>{latestRun.status}</span>
                <span>{latestRun.completed_requests} / {latestRun.total_requests} 완료 · 실패 {latestRun.failed_requests}</span>
              </div>
              <div style={{ height: 8, borderRadius: 99, background: C.light, overflow: "hidden" }}>
                <div style={{ width: `${progress}%`, height: "100%", background: C.orange }} />
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={onCreateAuditRun} disabled={!!runningAction} style={primaryBtn}>Audit Run 생성</button>
            <button type="button" onClick={onProcessLatestRun} disabled={!!runningAction || !latestRun} style={secondaryBtn}>배치 처리</button>
            <button type="button" onClick={onAnalyzeResponses} disabled={!!runningAction || !summary?.responses?.length} style={secondaryBtn}>응답 분석</button>
            <button type="button" onClick={onCollectEvidence} disabled={!!runningAction || !summary?.responses?.length} style={secondaryBtn}>Evidence 수집</button>
            <button type="button" onClick={onScore} disabled={!!runningAction || !summary?.hospitals?.length} style={secondaryBtn}>Score 계산</button>
            <button type="button" onClick={onGenerateStrategy} disabled={!!runningAction || !summary?.gaps?.length} style={secondaryBtn}>Strategy/Shoot 생성</button>
            <button type="button" onClick={onReload} disabled={!!runningAction} style={secondaryBtn}>새로고침</button>
          </div>
        </>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ padding: 14, borderRadius: 12, background: C.light, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, marginBottom: 5, textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: C.teal, letterSpacing: "-.02em" }}>{value.toLocaleString("ko-KR")}</div>
    </div>
  );
}

function ReportSkeleton({ summary }: { summary: SummaryData | null }) {
  const blocks = [
    "AI SEARCH OVERVIEW",
    "AI RECOMMENDED HOSPITALS",
    "AI CONSENSUS",
    "PROMPT INTENT ANALYSIS",
    "RECOMMENDED HOSPITAL PATTERN",
    "AI TRUST GAP",
    "STRATEGY",
    "SHOOT PLAN",
    "EVIDENCE",
  ];
  return (
    <section style={{ ...panelStyle, marginTop: 20 }}>
      <SectionTitle icon={<Radar size={16} />} title="결과 리포트 구조" />
      {summary?.consensusTop10?.length ? (
        <div style={{ marginBottom: 14, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "11px 13px", background: C.light, fontSize: 12, fontWeight: 900, color: C.teal }}>AI RECOMMENDED HOSPITALS · TOP 10</div>
          {summary.consensusTop10.map((item, index) => (
            <div key={item.id} style={{ display: "grid", gridTemplateColumns: "42px 1fr repeat(4, 80px)", gap: 8, padding: "10px 12px", borderTop: `1px solid ${C.border}`, alignItems: "center", fontSize: 11 }}>
              <strong style={{ color: C.orange }}>{index + 1}</strong>
              <strong style={{ color: C.teal }}>{item.hospital?.canonical_name || "병원명 확인 필요"}</strong>
              <span>노출 {Math.round(item.mention_rate * 100)}%</span>
              <span>TOP3 {Math.round(item.top3_rate * 100)}%</span>
              <span>AI {item.provider_consensus}</span>
              <span>의도 {item.intent_coverage}</span>
            </div>
          ))}
        </div>
      ) : null}
      {summary?.gaps?.length ? (
        <div style={{ marginBottom: 14, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "11px 13px", background: C.light, fontSize: 12, fontWeight: 900, color: C.teal }}>AI TRUST GAP · 큰 격차 순</div>
          {summary.gaps.slice(0, 8).map((gap) => {
            const schema = AI_TRUST_EVIDENCE_SCHEMAS.find((item) => item.key === gap.schema_key);
            return (
              <div key={gap.id} style={{ display: "grid", gridTemplateColumns: "42px 1fr 90px 90px 90px", gap: 8, padding: "10px 12px", borderTop: `1px solid ${C.border}`, alignItems: "center", fontSize: 11 }}>
                <strong style={{ color: C.orange }}>{gap.rank}</strong>
                <strong style={{ color: C.teal }}>{schema?.label || gap.schema_key}</strong>
                <span>추천군 {Math.round(gap.recommended_avg)}</span>
                <span>클라이언트 {Math.round(gap.client_score)}</span>
                <strong style={{ color: C.red }}>Gap {Math.round(gap.gap)}</strong>
              </div>
            );
          })}
        </div>
      ) : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        {blocks.map((block, index) => (
          <div key={block} style={{ padding: 15, borderRadius: 13, border: `1px solid ${C.border}`, background: index < 4 ? C.white : C.light }}>
            <div style={{ fontSize: 10, fontWeight: 900, color: C.hint, marginBottom: 6 }}>{String(index + 1).padStart(2, "0")}</div>
            <div style={{ fontSize: 13, fontWeight: 900, color: C.teal }}>{block}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
        {AI_TRUST_EVIDENCE_SCHEMAS.map((schema) => (
          <div key={schema.key} style={{ padding: 11, borderRadius: 12, background: C.light, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: C.teal }}>{schema.label}</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 3, lineHeight: 1.45 }}>{schema.desc}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SectionTitle({ icon, title, right }: { icon: React.ReactNode; title: string; right?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 15 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, color: C.teal, fontSize: 13, fontWeight: 900 }}>
        <span style={{ width: 28, height: 28, borderRadius: 8, background: C.light, color: C.teal, display: "inline-flex", alignItems: "center", justifyContent: "center", border: `1px solid ${C.border}` }}>{icon}</span>
        <span>{title}</span>
      </div>
      {right && <div style={{ minHeight: 24, display: "inline-flex", alignItems: "center", padding: "0 10px", borderRadius: 999, background: C.light, fontSize: 11, color: C.muted, fontWeight: 800, border: `1px solid ${C.border}` }}>{right}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 11, fontWeight: 900, color: C.muted }}>{label}</span>
      {children}
    </label>
  );
}

function EmptyBox({ text }: { text: string }) {
  return <div style={{ padding: 20, borderRadius: 10, background: C.light, color: C.muted, fontSize: 12, textAlign: "center" }}>{text}</div>;
}

const inputS: React.CSSProperties = {
  width: "100%",
  height: 40,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "0 12px",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
  background: C.white,
  color: C.txt,
  boxSizing: "border-box",
};

const textareaS: React.CSSProperties = {
  ...inputS,
  height: "auto",
  minHeight: 110,
  padding: "10px 12px",
  lineHeight: 1.6,
  resize: "vertical",
};

const primaryBtn: React.CSSProperties = {
  minHeight: 40,
  padding: "0 16px",
  borderRadius: 9,
  border: "none",
  background: C.teal,
  color: "#fff",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "inherit",
};

const secondaryBtn: React.CSSProperties = {
  ...primaryBtn,
  background: C.light,
  color: C.teal,
  border: `1px solid ${C.border}`,
};

const miniBtn: React.CSSProperties = {
  height: 30,
  padding: "0 12px",
  borderRadius: 999,
  border: `1px solid ${C.border}`,
  background: C.white,
  color: C.teal,
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};

const sideCard: React.CSSProperties = {
  background: C.white,
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  padding: "18px 16px 16px",
  boxShadow: C.shadow,
};

const panelStyle: React.CSSProperties = {
  background: C.white,
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  padding: "20px 20px 20px",
  boxShadow: C.shadow,
};
