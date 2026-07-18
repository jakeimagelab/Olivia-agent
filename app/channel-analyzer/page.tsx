"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Activity, BarChart3, Check, Clipboard, ExternalLink, History, Loader2, MapPin, Search, Sparkles } from "lucide-react";
import { CHANNELS, type ChannelAnalysisResult, type ChannelKey } from "@/lib/channelAnalysisTypes";

type ReportHistory = { id: string; hospital_name: string; specialty: string; overall_score: number; analysis_status: string; created_at: string };

function ChannelAnalyzerContent() {
  const params = useSearchParams();
  const clientId = params.get("clientId") || "";
  const projectId = params.get("projectId") || "";
  const workflowRunId = params.get("workflowRunId") || "";
  const [hospitalName, setHospitalName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [address, setAddress] = useState("");
  const [urls, setUrls] = useState<Record<ChannelKey,string>>({ insta: "", web: "", naver: "", blog: "" });
  const [result, setResult] = useState<ChannelAnalysisResult | null>(null);
  const [history, setHistory] = useState<ReportHistory[]>([]);
  const [benchmark, setBenchmark] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"analysis"|"history">("analysis");
  const reportRef = useRef<HTMLElement>(null);

  const loadHistory = useCallback(async () => {
    const query = new URLSearchParams({ limit: "20" });
    if (clientId) query.set("clientId", clientId);
    if (workflowRunId) query.set("workflowRunId", workflowRunId);
    const data = await fetch(`/api/channel-analysis/reports?${query}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (data?.ok) setHistory(data.reports || []);
  }, [clientId, workflowRunId]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);
  useEffect(() => {
    if (!clientId) return;
    fetch(`/api/clients/${encodeURIComponent(clientId)}${workflowRunId ? `?workflowRunId=${encodeURIComponent(workflowRunId)}` : ""}`, { cache: "no-store" })
      .then((r) => r.json()).then((data) => {
        if (!data.ok) return;
        setHospitalName(data.client?.name || "");
        setSpecialty(data.client?.department || data.client?.specialty || "");
      }).catch(() => {});
  }, [clientId, workflowRunId]);

  const runAnalysis = async () => {
    if (!Object.values(urls).some((value) => value.trim())) { setError("분석할 URL을 하나 이상 입력해주세요."); return; }
    setLoading(true); setError(""); setNotice(""); setResult(null);
    try {
      const response = await fetch("/api/channel-analysis/analyze", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ hospitalName: hospitalName || "분석 대상 병원", specialty, address, urls, clientId: clientId || null, projectId: projectId || null, workflowRunId: workflowRunId || null }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "분석에 실패했습니다.");
      setResult(data.result);
      setNotice(data.saved ? "분석 결과를 고객 이력에 저장했습니다." : `분석은 완료됐지만 저장하지 못했습니다. ${data.saveError || ""}`);
      await loadHistory();
      window.setTimeout(() => reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } catch (analysisError) { setError(analysisError instanceof Error ? analysisError.message : "분석에 실패했습니다."); }
    finally { setLoading(false); }
  };

  const runBenchmark = async () => {
    if (!specialty.trim()) { setError("벤치마킹을 위해 진료과목을 입력해주세요."); return; }
    setBenchmarkLoading(true); setError("");
    try {
      const response = await fetch("/api/channel-analysis/benchmark", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ hospitalName, specialty, address }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "벤치마킹에 실패했습니다.");
      setBenchmark(data.result);
    } catch (benchmarkError) { setError(benchmarkError instanceof Error ? benchmarkError.message : "벤치마킹에 실패했습니다."); }
    finally { setBenchmarkLoading(false); }
  };

  const openReport = async (id: string) => {
    const data = await fetch(`/api/channel-analysis/reports/${id}`, { cache: "no-store" }).then((r) => r.json());
    if (data.ok) { setResult(data.result); setHospitalName(data.report.hospital_name || ""); setSpecialty(data.report.specialty || ""); setUrls(data.report.input_urls || urls); setTab("analysis"); }
  };

  const scoreTone = useMemo(() => !result ? "" : result.overall_score >= 75 ? "good" : result.overall_score >= 50 ? "normal" : "risk", [result]);

  return <div className="channel-native-page">
    <header className="pc-header channel-native-header">
      <div className="pc-header-left"><div className="pc-header-brand"><img src="/assets/photoclinic-logo.png" alt="포토클리닉" className="pc-header-logo"/><span className="pc-header-title">병원 채널 분석</span></div></div>
    </header>
    <nav className="channel-native-tabs" aria-label="채널 분석 메뉴">
      <button className={tab === "analysis" ? "is-active" : ""} onClick={() => setTab("analysis")}><Activity size={16}/> 채널 진단</button>
      <button className={tab === "history" ? "is-active" : ""} onClick={() => setTab("history")}><History size={16}/> 분석 이력</button>
    </nav>

    {tab === "history" ? <main className="channel-native-main">
      <section className="channel-history-panel"><div className="channel-section-heading"><div><span>REPORT HISTORY</span><h1>{clientId ? "고객 채널 분석 이력" : "최근 채널 분석"}</h1></div><strong>{history.length}건</strong></div>
        <div className="channel-history-list">{history.length ? history.map((item) => <button key={item.id} onClick={() => void openReport(item.id)}><div><strong>{item.hospital_name}</strong><span>{item.specialty || "진료과 미입력"} · {new Date(item.created_at).toLocaleString("ko-KR")}</span></div><b>{item.overall_score}</b></button>) : <p>저장된 분석 결과가 없습니다.</p>}</div>
      </section>
    </main> : <main className="channel-native-main">
      <section className="channel-native-hero"><div><span>PHOTO CLINIC CHANNEL INTELLIGENCE</span><h1>병원 온라인 채널<br/>진단 리포트</h1><p>인스타그램·홈페이지·네이버 플레이스·블로그를 병원 브랜딩과 검색 관점으로 분석합니다.</p></div><div className="channel-hero-mark"><BarChart3 size={34}/><small>4 CHANNEL</small></div></section>

      <section className="channel-input-panel">
        <div className="channel-section-heading"><div><span>ANALYSIS INPUT</span><h2>분석 대상 입력</h2><p>한 채널만 입력해도 해당 채널 기준으로 리포트를 생성합니다.</p></div>{clientId && <strong>고객 연결됨</strong>}</div>
        <div className="channel-input-grid">
          <label><span>병원명</span><input value={hospitalName} onChange={(e) => setHospitalName(e.target.value)} placeholder="병원명"/></label>
          <label><span>진료과목</span><input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="피부과, 성형외과, 치과"/></label>
          <label className="is-wide"><span>병원 주소</span><input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="주변 병원 벤치마킹에 활용됩니다"/></label>
          {CHANNELS.map((channel) => <label key={channel.key}><span>{channel.label}</span><input value={urls[channel.key]} onChange={(e) => setUrls((current) => ({ ...current, [channel.key]: e.target.value }))} placeholder={channel.key === "insta" ? "@계정 또는 Instagram URL" : `${channel.label} URL`}/></label>)}
        </div>
        <div className="channel-input-actions"><button className="is-primary" onClick={() => void runAnalysis()} disabled={loading}>{loading ? <><Loader2 className="is-spin" size={16}/> 분석 중</> : <><Search size={16}/> 진단 리포트 생성</>}</button><button onClick={() => void runBenchmark()} disabled={benchmarkLoading}>{benchmarkLoading ? <Loader2 className="is-spin" size={16}/> : <MapPin size={16}/>} 주변 병원 벤치마킹</button></div>
        {error && <p className="channel-message is-error">{error}</p>}{notice && <p className="channel-message"><Check size={14}/>{notice}</p>}
      </section>

      {benchmark && <section className="channel-benchmark"><div className="channel-section-heading"><div><span>LOCAL BENCHMARK</span><h2>주변 병원 비교</h2></div></div><p>{benchmark.strategy}</p><div>{(benchmark.hospitals || []).map((item: any) => <article key={`${item.name}-${item.address}`}><strong>{item.name}</strong><span>{item.address}</span>{item.naverUrl && <a href={item.naverUrl} target="_blank" rel="noreferrer"><ExternalLink size={12}/> 보기</a>}</article>)}</div>{(benchmark.insights || []).map((item: string) => <small key={item}>{item}</small>)}</section>}

      {result && <article className="channel-report" ref={reportRef}>
        <header className="channel-report-cover"><div><span>PHOTO CLINIC BRAND REPORT</span><h2>{hospitalName || "분석 대상 병원"}</h2><p>{specialty}{specialty && " · "}{result.coverage_summary}</p></div><div className={`channel-score ${scoreTone}`}><strong>{result.overall_score}</strong><span>/100</span></div></header>
        <section className="channel-report-summary"><div><Sparkles size={18}/><p>{result.overall_summary}</p></div><strong>촬영 기회</strong><p>{result.photo_opportunity}</p></section>
        <section className="channel-score-grid">{CHANNELS.map((channel) => { const item = result.channels[channel.key]; return <article key={channel.key}><header><span>{channel.label}</span><strong>{item.score}</strong></header><i><b style={{ width: `${item.score}%` }}/></i><em>{item.status}</em><ul>{item.findings.slice(0,4).map((finding, index) => <li className={finding.type} key={`${finding.text}-${index}`}>{finding.text}</li>)}</ul></article>; })}</section>
        <section className="channel-report-sections">{result.report_sections.map((section) => <div key={section.title}><h3>{section.title}</h3><ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul></div>)}<div><h3>{result.package_recommendation.name}</h3><p>{result.package_recommendation.reason}</p><div className="channel-tags">{result.package_recommendation.items.map((item) => <span key={item}>{item}</span>)}</div></div></section>
        <footer><button onClick={async () => { await navigator.clipboard.writeText(`${hospitalName}\n${result.overall_score}/100\n${result.overall_summary}\n${result.photo_opportunity}`); setNotice("리포트 요약을 복사했습니다."); }}><Clipboard size={15}/> 요약 복사</button></footer>
      </article>}
    </main>}
  </div>;
}

export default function ChannelAnalyzerPage() {
  return <Suspense fallback={<div className="channel-native-loading"><Loader2 className="is-spin"/>채널분석기를 준비하고 있습니다.</div>}><ChannelAnalyzerContent/></Suspense>;
}
