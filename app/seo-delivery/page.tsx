"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

/* ── 색상 ── */
const C = {
  teal: "#155855", orange: "#E85D2C", green: "#22876A",
  white: "#FFFFFF", border: "rgba(21,88,85,.12)", muted: "#5A7470",
  hint: "#9BB5B0", txt: "#1C2B28", light: "#EAF4F2",
  purple: "#7C3AED", purpleLight: "rgba(124,58,237,.08)",
  danger: "#DC2626", caution: "#D97706",
};

const iS: React.CSSProperties = {
  width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8,
  padding: "0 12px", height: 40, fontSize: 13, fontFamily: "inherit",
  outline: "none", background: C.white, color: C.txt, boxSizing: "border-box",
};

/* ── 타입 ── */
type ImageInput = {
  originalFileName: string;
  sceneType: string;
  sceneDisplayName: string;
  department: string;
  imageRole: string;
};

type ImageResult = {
  originalFileName: string;
  seoFileName: string;
  title: string;
  altText: string;
  caption: string;
  description: string;
  keywords: string[];
  recommendedPageSection: string;
  recommendedUse: string[];
  medicalAdRiskLevel: "safe" | "caution" | "danger";
  medicalAdRiskReasons: string[];
  riskyPhrases: string[];
  iptcMetadata: {
    title: string; description: string; keywords: string[];
    creator: string; credit: string; copyright: string; source: string;
  };
};

const SCENE_TYPES = [
  "원장 상담", "의료진 상담", "장비 시술", "수술 장면", "진료실 내부",
  "대기실", "원장 프로필", "의료진 프로필", "직원 응대", "하모니컷",
  "병원 외관", "시설 및 환경", "기타",
];

const IMAGE_ROLES = [
  { value: "homepage", label: "홈페이지" },
  { value: "blog",     label: "블로그" },
  { value: "sns",      label: "SNS" },
  { value: "portfolio",label: "포트폴리오" },
  { value: "general",  label: "일반" },
];

const RISK_COLOR = { safe: C.green, caution: C.caution, danger: C.danger };
const RISK_LABEL = { safe: "안전", caution: "주의", danger: "위험" };

/* ── 메인 컴포넌트 ── */
function SeoDeliveryInner() {
  const sp = useSearchParams();
  const clientId = sp.get("clientId") || sp.get("client_id");
  const workflowRunId = sp.get("workflowRunId") || sp.get("workflow_run_id");

  /* 고객 연결 모드 */
  const [clientInfo, setClientInfo] = useState<any>(null);
  const [loadingClient, setLoadingClient] = useState(false);

  /* 입력 */
  const [hospitalName, setHospitalName] = useState("");
  const [department, setDepartment]     = useState("");
  const [region, setRegion]             = useState("");
  const [shootingPurpose, setShootingPurpose] = useState("홈페이지, SNS 홍보");
  const [mainKeywords, setMainKeywords] = useState("");

  /* 이미지 목록 */
  const [images, setImages] = useState<ImageInput[]>([]);
  const [bulkInput, setBulkInput] = useState("");

  /* 생성 결과 */
  const [results, setResults] = useState<ImageResult[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState<{ text: string; ok: boolean } | null>(null);

  /* 선택된 결과 행 */
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  /* 내보내기 */
  const [exporting, setExporting] = useState<string | null>(null);

  /* ── 고객 정보 로드 ── */
  useEffect(() => {
    if (!clientId) return;
    setLoadingClient(true);
    fetch(`/api/clients/${clientId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.client) {
          setClientInfo(d.client);
          setHospitalName(d.client.hospital_name || d.client.name || "");
          setDepartment(d.client.specialty || d.client.department || "");
        }
      })
      .finally(() => setLoadingClient(false));
  }, [clientId]);

  /* ── 이미지 추가 ── */
  const addImage = () =>
    setImages((prev) => [
      ...prev,
      { originalFileName: "", sceneType: "일반", sceneDisplayName: "", department: department, imageRole: "general" },
    ]);

  const removeImage = (i: number) => setImages((prev) => prev.filter((_, idx) => idx !== i));

  const updateImage = (i: number, field: keyof ImageInput, val: string) =>
    setImages((prev) => prev.map((img, idx) => idx === i ? { ...img, [field]: val } : img));

  const parseBulk = () => {
    const lines = bulkInput.trim().split("\n").filter((l) => l.trim());
    const parsed: ImageInput[] = lines.map((line) => {
      const parts = line.split("\t");
      return {
        originalFileName: parts[0]?.trim() || line.trim(),
        sceneType:        parts[1]?.trim() || "일반",
        sceneDisplayName: parts[2]?.trim() || "",
        department:       parts[3]?.trim() || department,
        imageRole:        parts[4]?.trim() || "general",
      };
    });
    setImages((prev) => [...prev, ...parsed]);
    setBulkInput("");
  };

  /* ── AI 생성 ── */
  const generate = async () => {
    if (!hospitalName.trim() || !department.trim()) {
      setGenMsg({ text: "병원명과 진료과를 입력해주세요.", ok: false });
      return;
    }
    if (!images.filter((i) => i.originalFileName.trim()).length) {
      setGenMsg({ text: "이미지 파일명을 1개 이상 입력해주세요.", ok: false });
      return;
    }
    setGenerating(true); setGenMsg(null);
    try {
      const res = await fetch("/api/seo-delivery/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hospitalName, department, region, shootingPurpose,
          mainKeywords: mainKeywords.split(",").map((k) => k.trim()).filter(Boolean),
          images: images.filter((i) => i.originalFileName.trim()),
        }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "생성 실패");
      setResults(d.results);
      setSelectedIdx(0);
      setGenMsg({ text: `✅ ${d.results.length}장 SEO 최적화 완료`, ok: true });
    } catch (e: any) {
      setGenMsg({ text: e.message || "생성 중 오류가 발생했습니다.", ok: false });
    } finally {
      setGenerating(false);
    }
  };

  /* ── 내보내기 ── */
  const exportFile = async (type: string, filename: string) => {
    setExporting(type);
    try {
      const res = await fetch("/api/seo-delivery/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type, hospitalName, department, region,
          generatedAt: new Date().toISOString(),
          results,
        }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert("내보내기 실패: " + e.message);
    } finally {
      setExporting(null);
    }
  };

  /* ── 워크플로우 완료 ── */
  const completeStep = async () => {
    if (!workflowRunId || !results.length) return;
    const res = await fetch("/api/workflow/advance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow_run_id: workflowRunId, to_step_key: "final_delivery" }),
    });
    const d = await res.json();
    if (d.ok) window.location.href = `/clients?id=${clientId}`;
    else alert(d.error || "완료 처리 실패");
  };

  const sel = selectedIdx !== null ? results[selectedIdx] : null;

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFB", fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif", color: C.txt }}>

      {/* ── 헤더 ── */}
      <header className="pc-header">
        <div className="pc-header-left">
          <div className="pc-header-brand">
            <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉" className="pc-header-logo" />
            <span className="pc-header-title">
              AI 검색 최적화 납품 생성{clientInfo ? ` · ${clientInfo.hospital_name || clientInfo.name}` : ""}
            </span>
          </div>
        </div>
        <div className="pc-header-actions" style={{ fontSize: 11, color: "#9BB5B0" }}>
          {clientId
            ? <Link href={`/clients?id=${clientId}`} className="pc-header-back">← 고객관리</Link>
            : <span>독립 실행 모드</span>}
        </div>
      </header>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 16px 80px" }}>
        <div style={{ display: "grid", gridTemplateColumns: results.length ? "1fr 480px" : "1fr", gap: 16, alignItems: "start" }}>

          {/* ── 왼쪽: 입력 + 이미지 목록 ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* 기본 정보 */}
            <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
              <div style={{ padding: "12px 18px", background: "rgba(21,88,85,.03)", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: C.teal }}>기본 정보</div>
              </div>
              <div style={{ padding: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelS}>병원명 *</label>
                  <input value={hospitalName} onChange={(e) => setHospitalName(e.target.value)} placeholder="브라보마취통증의학과" style={iS} />
                </div>
                <div>
                  <label style={labelS}>진료과 *</label>
                  <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="마취통증의학과" style={iS} />
                </div>
                <div>
                  <label style={labelS}>지역</label>
                  <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="서울 강남" style={iS} />
                </div>
                <div>
                  <label style={labelS}>촬영 목적</label>
                  <input value={shootingPurpose} onChange={(e) => setShootingPurpose(e.target.value)} placeholder="홈페이지, SNS 홍보" style={iS} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={labelS}>주요 키워드 (쉼표 구분)</label>
                  <input value={mainKeywords} onChange={(e) => setMainKeywords(e.target.value)}
                    placeholder="통증치료, 신경차단술, C-arm시술" style={iS} />
                </div>
              </div>
            </div>

            {/* 이미지 목록 */}
            <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
              <div style={{ padding: "12px 18px", background: "rgba(21,88,85,.03)", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: C.teal }}>이미지 목록 ({images.length}장)</div>
                  <div style={{ fontSize: 11, color: C.hint, marginTop: 2 }}>파일명과 장면 정보를 입력하세요</div>
                </div>
                <button onClick={addImage} className="pc-btn pc-btn--secondary pc-btn--sm">+ 추가</button>
              </div>

              {/* 일괄 입력 */}
              <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.border}`, background: C.purpleLight }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.purple, marginBottom: 6 }}>일괄 입력 (탭 구분: 파일명 장면유형 표시명 진료과 용도)</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <textarea value={bulkInput} onChange={(e) => setBulkInput(e.target.value)}
                    placeholder={"R5K03697.JPG\t원장 상담\t원장 상담 장면\t마취통증의학과\thomepage\nR5K03698.JPG\t장비 시술\tC-arm 시술 장면\t마취통증의학과\thomepage"}
                    rows={3} style={{ ...iS, height: "auto", padding: "8px 12px", resize: "vertical", fontSize: 11, flex: 1 }} />
                  <button onClick={parseBulk} disabled={!bulkInput.trim()}
                    className="pc-btn pc-btn--primary" style={{ height: "auto", padding: "0 16px", alignSelf: "stretch" }}>
                    적용
                  </button>
                </div>
              </div>

              {/* 이미지 행 */}
              <div style={{ maxHeight: 400, overflowY: "auto" }}>
                {images.length === 0 && (
                  <div style={{ padding: 24, textAlign: "center", color: C.hint, fontSize: 12 }}>
                    이미지를 추가하거나 일괄 입력을 사용하세요
                  </div>
                )}
                {images.map((img, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 130px 130px 100px 28px", gap: 8, padding: "10px 18px", borderBottom: `1px solid ${C.border}`, alignItems: "center" }}>
                    <input value={img.originalFileName} onChange={(e) => updateImage(i, "originalFileName", e.target.value)}
                      placeholder="R5K03697.JPG" style={{ ...iS, height: 34, fontSize: 12 }} />
                    <select value={img.sceneType} onChange={(e) => updateImage(i, "sceneType", e.target.value)}
                      style={{ ...iS, height: 34, fontSize: 12 }}>
                      {SCENE_TYPES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                    <input value={img.sceneDisplayName} onChange={(e) => updateImage(i, "sceneDisplayName", e.target.value)}
                      placeholder="표시명" style={{ ...iS, height: 34, fontSize: 12 }} />
                    <select value={img.imageRole} onChange={(e) => updateImage(i, "imageRole", e.target.value)}
                      style={{ ...iS, height: 34, fontSize: 12 }}>
                      {IMAGE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                    <button onClick={() => removeImage(i)}
                      className="pc-btn pc-btn--danger" style={{ width: 28, height: 28, padding: 0, borderRadius: 6, fontSize: 14 }}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* 생성 버튼 */}
            {genMsg && (
              <div style={{ padding: "10px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: genMsg.ok ? C.light : "#FFF0F0", color: genMsg.ok ? C.green : C.orange }}>
                {genMsg.text}
              </div>
            )}
            <button onClick={generate} disabled={generating}
              className="pc-btn pc-btn--primary pc-btn--lg" style={{ width: "100%" }}>
              {generating ? "AI가 SEO 최적화 중..." : `✨ AI 검색 최적화 생성 (${images.filter((i) => i.originalFileName.trim()).length}장)`}
            </button>

            {/* 결과 테이블 (결과 있을 때만) */}
            {results.length > 0 && (
              <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.border}`, background: "rgba(21,88,85,.03)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: C.teal }}>생성 결과 ({results.length}장)</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {[
                      { type: "alt_caption_xlsx",  label: "ALT/캡션 XLSX",  file: "03_ALT_캡션_복사용.xlsx" },
                      { type: "metadata_csv",       label: "메타데이터 CSV",  file: "05_이미지SEO_메타데이터_리포트.csv" },
                      { type: "medical_ad_csv",     label: "리스크체크 CSV",  file: "06_의료광고_리스크체크.csv" },
                      { type: "upload_guide_txt",   label: "업로드 가이드",   file: "04_홈페이지_업로드_가이드.txt" },
                      { type: "xmp_sidecar",        label: "XMP 사이드카",   file: "07_XMP_메타데이터_사이드카.txt" },
                    ].map(({ type, label, file }) => (
                      <button key={type} onClick={() => exportFile(type, file)}
                        disabled={exporting === type}
                        className="pc-btn pc-btn--secondary" style={{ fontSize: 10, padding: "4px 10px", height: "auto" }}>
                        {exporting === type ? "..." : `↓ ${label}`}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: "rgba(21,88,85,.04)" }}>
                        {["#", "원본 파일명", "SEO 파일명", "ALT 문구", "리스크"].map((h) => (
                          <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 800, color: C.muted, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r, i) => (
                        <tr key={i} onClick={() => setSelectedIdx(i)}
                          style={{ cursor: "pointer", background: selectedIdx === i ? C.light : "transparent", transition: "background .1s" }}>
                          <td style={tdS}>{i + 1}</td>
                          <td style={{ ...tdS, color: C.muted, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.originalFileName}</td>
                          <td style={{ ...tdS, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600, color: C.teal }}>{r.seoFileName}</td>
                          <td style={{ ...tdS, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.altText}</td>
                          <td style={tdS}>
                            <span style={{
                              fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 99,
                              background: `${RISK_COLOR[r.medicalAdRiskLevel]}18`,
                              color: RISK_COLOR[r.medicalAdRiskLevel],
                            }}>{RISK_LABEL[r.medicalAdRiskLevel]}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 워크플로우 완료 버튼 */}
                {clientId && workflowRunId && (
                  <div style={{ padding: "14px 18px", borderTop: `1px solid ${C.border}`, background: "rgba(21,88,85,.03)" }}>
                    <button onClick={completeStep}
                      className="pc-btn pc-btn--primary pc-btn--lg" style={{ width: "100%" }}>
                      ✓ AI 검색 최적화 완료 → 최종 납품 단계로
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── 오른쪽: 선택된 결과 상세 ── */}
          {results.length > 0 && sel && (
            <div style={{ position: "sticky", top: 16, display: "flex", flexDirection: "column", gap: 12 }}>

              {/* 리스크 배너 */}
              {sel.medicalAdRiskLevel !== "safe" && (
                <div style={{
                  padding: "10px 14px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                  background: sel.medicalAdRiskLevel === "danger" ? "#FEF2F2" : "#FFFBEB",
                  color: RISK_COLOR[sel.medicalAdRiskLevel],
                  border: `1px solid ${RISK_COLOR[sel.medicalAdRiskLevel]}30`,
                }}>
                  ⚠️ {RISK_LABEL[sel.medicalAdRiskLevel]} — {sel.riskyPhrases.join(", ")} 표현 수정 필요
                </div>
              )}

              <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.border}`, background: "rgba(21,88,85,.03)" }}>
                  <div style={{ fontSize: 11, color: C.hint }}>{sel.originalFileName}</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: C.teal, marginTop: 2 }}>{sel.seoFileName}</div>
                </div>

                <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                  <DetailField label="제목 (Title)" value={sel.title} />
                  <DetailField label="ALT 문구" value={sel.altText} highlight />
                  <DetailField label="캡션" value={sel.caption} />
                  <DetailField label="설명 (IPTC Description)" value={sel.description} />
                  <div>
                    <div style={fieldLabel}>키워드</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                      {sel.keywords.map((k) => (
                        <span key={k} style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 99, background: C.light, color: C.teal }}>{k}</span>
                      ))}
                    </div>
                  </div>
                  <DetailField label="추천 업로드 위치" value={sel.recommendedPageSection} />
                  <div>
                    <div style={fieldLabel}>추천 용도</div>
                    <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                      {sel.recommendedUse.map((u) => (
                        <span key={u} style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: `${C.teal}12`, color: C.teal }}>{u}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* IPTC 메타데이터 */}
              <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, background: C.purpleLight }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: C.purple }}>IPTC / XMP 메타데이터</div>
                </div>
                <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                  {Object.entries(sel.iptcMetadata).map(([k, v]) => (
                    <div key={k} style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, paddingTop: 2 }}>{k}</span>
                      <span style={{ fontSize: 11, color: C.txt, wordBreak: "break-word" }}>
                        {Array.isArray(v) ? v.join(", ") : v}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 네비게이션 */}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setSelectedIdx((p) => Math.max(0, (p ?? 0) - 1))}
                  disabled={!selectedIdx}
                  className="pc-btn pc-btn--secondary pc-btn--sm" style={{ flex: 1 }}>← 이전</button>
                <span style={{ fontSize: 12, color: C.muted, display: "flex", alignItems: "center", minWidth: 60, justifyContent: "center" }}>
                  {(selectedIdx ?? 0) + 1} / {results.length}
                </span>
                <button onClick={() => setSelectedIdx((p) => Math.min(results.length - 1, (p ?? 0) + 1))}
                  disabled={selectedIdx === results.length - 1}
                  className="pc-btn pc-btn--secondary pc-btn--sm" style={{ flex: 1 }}>다음 →</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── 서브 컴포넌트 ── */
function DetailField({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={fieldLabel}>{label}</span>
        <button onClick={copy} style={{ fontSize: 10, color: copied ? C.green : C.hint, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          {copied ? "✓ 복사됨" : "복사"}
        </button>
      </div>
      <div style={{
        fontSize: 12, lineHeight: 1.6, color: C.txt,
        background: highlight ? C.light : "rgba(21,88,85,.02)",
        border: `1px solid ${highlight ? C.teal + "30" : C.border}`,
        borderRadius: 6, padding: "8px 10px",
        wordBreak: "break-word",
      }}>{value || "—"}</div>
    </div>
  );
}

/* ── 스타일 상수 ── */
const labelS: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 5 };
const fieldLabel: React.CSSProperties = { fontSize: 10, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: ".06em" };
const tdS: React.CSSProperties = { padding: "9px 12px", borderBottom: `1px solid ${C.border}` };

export default function SeoDeliveryPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#9BB5B0" }}>로딩 중...</div>}>
      <SeoDeliveryInner />
    </Suspense>
  );
}
