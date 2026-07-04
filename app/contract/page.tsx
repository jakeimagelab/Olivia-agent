"use client";
import type { PointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { createMailingDraft } from "@/lib/mailingQueue";
import { useSaveShortcut } from "@/lib/hooks/useSaveShortcut";

interface QuoteData {
  hospitalName: string;
  contactName: string;
  businessNumber?: string;
  phone: string;
  email: string;
  quoteNumber: string;
  quoteDate: string;
  shootDate: string | null;
  validUntil: string;
  items: { name: string; detail: string; unitPrice: number; qty: number; subtotal: number; note: string }[];
  supplyAmount: number;
  discountAmount: number;
  vat: number;
  totalAmount: number;
  depositAmount: number;
  balanceAmount: number;
  memos: string | null;
}

const C = {
  teal: "#155855", orange: "#E85D2C",
  bg: "#EDF5F3", surface: "#FFFFFF", border: "#C8DDD9",
  muted: "#5A7470", hint: "#9BB5B0", txt: "#1C2B28", mint: "#EAF4F2",
};

const fmt = (n: number) => (n || 0).toLocaleString("ko-KR");

export default function ContractPage() {
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const isSigningRef = useRef(false);
  const [quote,      setQuote]      = useState<QuoteData | null>(null);
  const [contractHtml, setContractHtml] = useState("");
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [error,      setError]      = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [mailingQueued, setMailingQueued] = useState(false);
  const [mailingNotice, setMailingNotice] = useState("");
  const [contractId, setContractId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    const params   = new URLSearchParams(window.location.search);
    const clientId = params.get("client_id") || params.get("clientId");
    const raw      = params.get("data");

    // client_id로 고객 정보를 불러와 최소 견적 데이터 생성
    if (clientId && !raw) {
      fetch(`/api/clients/${clientId}`)
        .then(r => r.json())
        .then(d => {
          if (!d.ok || !d.client) return;
          const c = d.client;
          const today = new Date().toISOString().slice(0, 10);
          setQuote({
            hospitalName: c.name || c.hospital_name || "",
            contactName: c.manager_name || c.contact_name || "",
            phone: c.phone || "",
            email: c.email || "",
            quoteNumber: "",
            quoteDate: today,
            shootDate: null,
            validUntil: today,
            items: [],
            supplyAmount: 0, discountAmount: 0, vat: 0,
            totalAmount: 0, depositAmount: 0, balanceAmount: 0,
            memos: null,
          });
        })
        .catch(() => {});
      return;
    }

    if (!raw) return;
    try {
      const data: QuoteData = JSON.parse(decodeURIComponent(raw));
      setQuote(data);
      // 계약서 데이터 로드 시 자동으로 메일링함에 저장
      createMailingDraft({
        type: "contract",
        source_module: "contract",
        source_id: data.quoteNumber,
        hospital_name: data.hospitalName,
        contact_name: data.contactName,
        to_email: data.email,
        subject: `[포토클리닉] ${data.hospitalName} 촬영 계약서`,
        body: `포토클리닉 촬영 계약서를 발송드립니다.\n내용 확인 후 서명하여 회신 부탁드립니다.\n\n계약 금액: ${(data.totalAmount || 0).toLocaleString("ko-KR")}원\n계약금 (50%): ${(data.depositAmount || 0).toLocaleString("ko-KR")}원\n잔금 (50%): ${(data.balanceAmount || 0).toLocaleString("ko-KR")}원`,
      }).then(() => {
        setMailingQueued(true);
        setMailingNotice("계약서가 올리비아 메일링함에 자동 저장되었습니다.");
        setTimeout(() => setMailingNotice(""), 5000);
      });
    } catch (e) {
      setError("견적 데이터를 불러올 수 없습니다.");
    }
  }, []);

  useEffect(() => {
    if (!quote) return;
    setContractHtml(buildContractHtml(quote, signatureDataUrl));
  }, [quote, signatureDataUrl]);

  const updateQuote = (key: keyof QuoteData, value: string) => {
    setQuote((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const getSignaturePoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();

    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height
    };
  };

  const startSignature = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    const point = getSignaturePoint(event);
    if (!canvas || !point) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    isSigningRef.current = true;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  };

  const drawSignature = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isSigningRef.current) return;
    const canvas = signatureCanvasRef.current;
    const point = getSignaturePoint(event);
    if (!canvas || !point) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  };

  const finishSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas || !isSigningRef.current) return;
    isSigningRef.current = false;
    setSignatureDataUrl(canvas.toDataURL("image/png"));
  };

  const clearSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureDataUrl("");
  };

  const createContractPdf = async () => {
    if (!quote || !previewFrameRef.current?.contentDocument?.body) {
      throw new Error("계약서 미리보기를 불러온 뒤 다시 시도해주세요.");
    }

    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf")
    ]);

    const doc = previewFrameRef.current.contentDocument;
    const pages = Array.from(doc.querySelectorAll<HTMLElement>(".contract-page"));
    if (!pages.length) {
      throw new Error("계약서 페이지를 찾을 수 없습니다.");
    }

    if (doc.fonts?.ready) {
      await doc.fonts.ready;
    }

    await Promise.all(
      Array.from(doc.images).map((image) => {
        if (image.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          image.onload = () => resolve();
          image.onerror = () => resolve();
        });
      })
    );

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    for (const [index, page] of pages.entries()) {
      const rect = page.getBoundingClientRect();
      const canvas = await html2canvas(page, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        allowTaint: false,
        logging: false,
        width: Math.ceil(rect.width),
        height: Math.ceil(rect.height),
        windowWidth: Math.ceil(rect.width),
        windowHeight: Math.ceil(rect.height),
        scrollX: 0,
        scrollY: 0
      });

      if (index > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 210, 297);
    }

    return pdf;
  };

  const contractFileName = () =>
    `포토클리닉_계약서_${quote?.hospitalName || "고객"}_${quote?.quoteDate || ""}.pdf`;

  const downloadPdf = async () => {
    if (!contractHtml || !quote) return;
    setPdfGenerating(true); setError("");
    try {
      const pdf = await createContractPdf();
      pdf.save(contractFileName());
    } catch (e: any) {
      setError(e.message || "PDF 생성에 실패했습니다.");
    } finally {
      setPdfGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!quote) return;
    setSaveState("saving");
    try {
      if (contractId) {
        const r = await fetch(`/api/contracts/${contractId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quoteData: quote, signatureDataUrl: signatureDataUrl || null,
            hospitalName: quote.hospitalName, contactName: quote.contactName, email: quote.email,
          }),
        });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error);
      } else {
        const r = await fetch("/api/contracts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quoteNumber: quote.quoteNumber, hospitalName: quote.hospitalName,
            contactName: quote.contactName, email: quote.email,
            quoteData: quote, signatureDataUrl: signatureDataUrl || null,
          }),
        });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error);
        setContractId(d.id);
      }
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
    }
  };

  useSaveShortcut(handleSave);

  const iS: React.CSSProperties = {
    width: "100%", border: `1px solid ${C.border}`, borderRadius: 8,
    padding: "9px 12px", fontSize: 13, fontFamily: "inherit",
    background: C.surface, color: C.txt, outline: "none",
  };

  if (error && !quote) return (
    <div style={{ padding: 40, textAlign: "center", color: C.orange }}>{error}</div>
  );

  if (!quote) return (
    <div style={{ padding: 60, textAlign: "center", color: C.muted }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
      견적 데이터를 불러오는 중...
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Noto Sans KR', sans-serif" }}>

      {/* NAV */}
      <header className="pc-header">
        <div className="pc-header-left">
          <button onClick={() => window.history.back()} className="pc-header-back">
            ← 견적서로
          </button>
          <div className="pc-header-divider" />
          <div className="pc-header-brand">
            <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉" className="pc-header-logo" />
            <span className="pc-header-title">브랜드촬영 계약서</span>
          </div>
        </div>
        <div className="pc-header-actions">
          <button onClick={downloadPdf} disabled={pdfGenerating} className="pc-btn pc-btn--primary pc-btn--sm">
            {pdfGenerating ? "PDF 생성 중..." : "PDF 저장"}
          </button>
        </div>
      </header>

      <div className="pc-mobile-stack" style={{ maxWidth: 1240, margin: "0 auto", padding: "24px 20px", display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 20, alignItems: "start" }}>

        {/* 계약서 미리보기 */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
          <div style={{ background: C.mint, padding: "12px 20px", borderBottom: `1px solid ${C.border}`,
                         display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.teal }}>계약서 미리보기</div>
            <div style={{ fontSize: 11, color: C.muted }}>미리보기 내용 그대로 PDF 생성</div>
          </div>
          <div style={{ padding: 16, background: "#F8FAFA", overflowX: "auto" }}>
            <iframe ref={previewFrameRef} srcDoc={contractHtml} style={{ width: 840, minWidth: 840, height: 860,
                                                     border: `1px solid ${C.border}`,
                                                     borderRadius: 8, background: "#fff" }}
                    title="계약서 미리보기"/>
          </div>
        </div>

        {/* 오른쪽: 액션 패널 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, position: "sticky", top: 70 }}>

          {/* 견적 요약 */}
          <div style={{ background: C.teal, borderRadius: 14, padding: "16px 18px", color: "#fff" }}>
            <div style={{ fontSize: 11, opacity: .7, marginBottom: 6 }}>계약 금액</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 10 }}>{fmt(quote.totalAmount)}원</div>
            <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ background: "rgba(255,255,255,.12)", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ fontSize: 9, opacity: .7, marginBottom: 2 }}>선금 (50%)</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{fmt(quote.depositAmount)}원</div>
              </div>
              <div style={{ background: "rgba(255,255,255,.12)", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ fontSize: 9, opacity: .7, marginBottom: 2 }}>잔금 (50%)</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{fmt(quote.balanceAmount)}원</div>
              </div>
            </div>
          </div>

          {/* 계약 병원 정보 */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.teal, marginBottom: 10 }}>🏥 계약 병원 정보</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 3 }}>
                  병원명
                </label>
                <input value={quote.hospitalName} onChange={e => updateQuote("hospitalName", e.target.value)}
                  placeholder="포토클리닉" style={iS}/>
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 3 }}>
                  대표원장
                </label>
                <input value={quote.contactName} onChange={e => updateQuote("contactName", e.target.value)}
                  placeholder="정연호" style={iS}/>
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 3 }}>
                  사업자번호
                </label>
                <input value={quote.businessNumber || ""} onChange={e => updateQuote("businessNumber", e.target.value)}
                  placeholder="000-00-00000" style={iS}/>
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 3 }}>
                  연락처
                </label>
                <input value={quote.phone} onChange={e => updateQuote("phone", e.target.value)}
                  placeholder="010-0000-0000" style={iS}/>
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 3 }}>
                  이메일
                </label>
                <input value={quote.email} onChange={e => updateQuote("email", e.target.value)}
                  placeholder="photoclnic@gmail.com" style={iS}/>
              </div>
            </div>
          </div>

          {/* 포토클리닉 서명 */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.teal, marginBottom: 8 }}>✍️ 포토클리닉 서명</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6, marginBottom: 10 }}>
              아래 칸에 직접 서명하면 계약서와 PDF에 바로 반영됩니다.
            </div>
            <canvas
              ref={signatureCanvasRef}
              width={520}
              height={180}
              onPointerDown={startSignature}
              onPointerMove={drawSignature}
              onPointerUp={finishSignature}
              onPointerLeave={finishSignature}
              onPointerCancel={finishSignature}
              style={{
                width: "100%",
                aspectRatio: "520 / 180",
                border: `1px dashed ${C.border}`,
                borderRadius: 10,
                background: "#fff",
                touchAction: "none",
                display: "block"
              }}
            />
            <button
              type="button"
              onClick={clearSignature}
              style={{ width: "100%", height: 36, marginTop: 8, border: `1px solid ${C.border}`,
                       borderRadius: 8, background: C.surface, color: C.muted,
                       fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}
            >
              서명 지우기
            </button>
          </div>

          {/* PDF 다운로드 */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.teal, marginBottom: 8 }}>📄 PDF 저장</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.7, marginBottom: 12 }}>
              계약서 미리보기 내용 그대로<br/>PDF 파일을 생성합니다.
            </div>
            <button onClick={downloadPdf} disabled={pdfGenerating}
              style={{ width: "100%", height: 42, background: C.teal, color: "#fff", border: "none",
                       borderRadius: 9, fontSize: 13, fontWeight: 700,
                       cursor: pdfGenerating ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
              {pdfGenerating ? "PDF 생성 중..." : "계약서 PDF 다운로드"}
            </button>
          </div>

          {/* 올리비아 메일링 자동 저장 안내 */}
          <div style={{ background: mailingQueued ? C.mint : "#F8FAFA", border: `1px solid ${mailingQueued ? C.teal : C.border}`, borderRadius: 14, padding: "14px 18px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.teal, marginBottom: 6 }}>📬 올리비아 메일링</div>
            {mailingNotice ? (
              <div style={{ fontSize: 12, color: C.teal, fontWeight: 700 }}>{mailingNotice}</div>
            ) : (
              <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
                계약서가 올리비아 메일링함에 자동 저장됩니다.<br/>
                실제 발송은 <a href="/mailing" style={{ color: C.orange, fontWeight: 700 }}>통합 메일링</a>에서 진행하세요.
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

// ── 계약서 HTML 생성 (고정 템플릿 + 데이터 채우기) ──────────
function buildContractHtml(q: QuoteData, signatureDataUrl = ""): string {
  const today = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  const baseHref = typeof window !== "undefined" ? window.location.origin : "";
  const signatureHtml = signatureDataUrl
    ? `<img class="signature-image" src="${signatureDataUrl}" alt="포토클리닉 서명">`
    : "";

  const itemCards = q.items.map((item, i) => `
    <div class="quote-item">
      <div class="item-index">${String(i + 1).padStart(2, "0")}</div>
      <div class="item-main">
        <strong>${item.name}</strong>
        ${item.detail ? `<span>${item.detail}</span>` : ""}
        ${item.note ? `<em>${item.note}</em>` : ""}
      </div>
      <div class="item-amount">
        <small>수량 ${item.qty}</small>
        <b>${fmt(item.subtotal)}원</b>
      </div>
    </div>`).join("");

  const section = (num: string, title: string, content: string) => `
  <div class="section">
    <h3><span class="art">${num}</span>${title}</h3>
    <div class="clause">${content}</div>
  </div>`;

  // 고정 조항 (병원 촬영 전문)
  const scope       = `포토클리닉은 병원 이미지브랜드 구축을 위한,\n전문 촬영 서비스(사진/영상)을 제공합니다.\n촬영 범위는 본 계약서 제2조의 항목에 한합니다.\n납품 결과물은 색보정 완료 JPG와 원본 파일을 제공합니다.\n영상 작업이 포함된 경우 편집 완료 영상(4K, FHD)을 파일로 제공합니다.\n촬영 항목 외 추가 촬영 시 별도 견적을 협의합니다.`;
  const deliverables = `납품 파일: 색보정 완료 JPG, 원본 파일, 편집 완료 영상(4K, FHD)\n전달 방법: 클라우드(NAS) 링크로 전달\n납품 수량: 촬영 항목별 협의된 수량 기준\n현장 상황에 따라 납품 수량은 ±10% 범위에서 조정될 수 있습니다.\n파일 보관: 납품 후 3개월간 보관합니다.\n3개월 이후 데이터 백업 서버로 이동하며, 이동 후에도 링크 전달이 가능합니다.`;
  const schedule     = `촬영 예정일: ${q.shootDate || "상호 협의 후 확정"}\n촬영 당일 준비사항은 사전 협의된 촬영 가이드를 따릅니다.\n최종 납품은 사진의 경우 촬영 완료일로부터 3주 이내 전달합니다.\n영상의 경우 5~6주 이내 전달하는 것을 원칙으로 합니다.\n납품 일정은 작업 범위에 따라 상호 협의할 수 있습니다.\n보정 기간 중 천재지변 등 불가항력 사유 발생 시 일정은 상호 협의합니다.`;
  const payment      = `계약 체결 시 선금(계약금) ${fmt(q.depositAmount)}원을 납부합니다.\n잔금 ${fmt(q.balanceAmount)}원은 마지막 촬영 직후 납부합니다.\n입금 계좌: 1002-754-988962 (우리은행 / 제이크이미지연구소)\n계약금 입금 확인 후 촬영 일정이 공식 확정됩니다.\n세금계산서는 선금, 잔금 2회 모두 발행 가능합니다.\n잔금 후 통합 발행도 가능합니다.`;
  const copyright    = `촬영 결과물의 저작권은 계약 병원에 귀속됩니다.\n포토클리닉은 결과물을 포트폴리오, 홍보 및 마케팅 목적으로 사용할 수 있습니다.\n단, 민감한 의료정보나 얼굴 노출이 있는 부분은 병원의 동의 없이는 사용하지 않습니다.`;
  const retake       = `최종 전달 이후 추가 수정 요청은 1회에 한하여 무상으로 제공합니다.\n최종 전달 이후 14일이 지난 수정 요청은 유상으로 처리합니다.\n유상 수정 기준: 프로필 보정료 50,000원/1장, 연출사진 보정료 100,000원/10장`;
  const confidential = `포토클리닉은 촬영 과정에서 취득한 계약 병원의 내부 정보를\n외부에 공개하지 않습니다.\n내부 정보에는 환자 정보, 경영 정보 등이 포함됩니다.\n결과물은 계약 병원의 승인 전 SNS 등 외부 채널에 공개하지 않습니다.\n계약 병원의 승인 후 포토클리닉의 포트폴리오 채널에 게시될 수 있습니다.\n포트폴리오 채널에는 홈페이지, 인스타그램, 블로그 등이 포함됩니다.`;
  const dispute      = `본 계약과 관련한 분쟁은 상호 협의를 우선으로 하며,\n협의가 이루어지지 않을 경우 서울중앙지방법원을 관할 법원으로 합니다.\n본 계약서에 명시되지 않은 사항은 상관습 및 민법의 관련 규정에 따릅니다.`;
  const special      = `${q.memos ? `【메모】 ${q.memos}\n\n` : ""}본 계약서는 양 당사자가 서명(또는 날인)한 시점부터 법적 효력이 발생합니다.\n구두 합의 사항은 본 계약서에 반영된 경우에 한하여 효력을 인정합니다.\n촬영 현장에서의 안전사고에 대한 책임은 각 당사자가 부담합니다.`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<base href="${baseHref}/">
<title>포토클리닉 브랜드촬영 계약서 · ${q.hospitalName}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Noto Sans KR',sans-serif;color:#1C2B28;background:#F3F8F7;
       padding:18px 0;font-size:10.8px;line-height:1.55;margin:0;}
  .contract-page{width:794px;height:1123px;margin:0 auto 18px;padding:42px 56px;
                 background:#fff;overflow:hidden;position:relative;page-break-after:always;}
  .contract-page:last-child{margin-bottom:0;page-break-after:auto;}
  .top-accent{height:6px;background:linear-gradient(90deg,#E85D2C 0 42%,#EB8F22 42% 58%,#155855 58% 100%);
              border-radius:99px;margin-bottom:18px;}
  .header{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:28px;align-items:start;
          margin-bottom:18px;padding-bottom:14px;border-bottom:2px solid #155855;}
  .brand-logo{width:126px;height:auto;display:block;margin-bottom:8px;}
  .brand-sub{font-size:8.8px;color:#6B8B87;margin-top:2px;line-height:1.45;white-space:nowrap;}
  .doc-title{font-size:20px;font-weight:700;color:#1C2B28;letter-spacing:.3px;text-align:right;white-space:nowrap;}
  .doc-meta{font-size:10px;color:#6B8B87;text-align:right;margin-top:6px;line-height:1.55;}
  .doc-meta strong{color:#E85D2C;}
  .parties{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:18px;}
  .party{border-top:3px solid #155855;padding:9px 0 0;background:#fff;}
  .party.party-client{border-top-color:#E85D2C;}
  .party h3{font-size:10px;font-weight:700;color:#155855;letter-spacing:.02em;margin-bottom:7px;}
  .party.party-client h3{color:#E85D2C;}
  .party .row{display:grid;grid-template-columns:62px minmax(0,1fr);gap:9px;padding:3px 0;font-size:10.4px;border-bottom:1px solid #EEF4F3;}
  .party .k{color:#6B8B87;}
  .party .v{font-weight:600;color:#1C2B28;word-break:keep-all;overflow-wrap:break-word;line-height:1.45;}
  .section{margin-bottom:13px;break-inside:avoid;}
  .section h3{font-size:10.6px;font-weight:700;color:#155855;margin-bottom:5px;
              padding-bottom:4px;border-bottom:1px solid #C8DDD9;
              display:flex;align-items:center;gap:7px;}
  .art{display:inline-block;background:#155855;color:#fff;font-size:9px;font-weight:700;
       padding:2px 7px;border-radius:10px;flex-shrink:0;}
  .section:nth-of-type(2n) .art{background:#E85D2C;}
  .clause{border-left:3px solid #155855;padding:2px 0 2px 11px;
          font-size:10px;line-height:1.6;color:#2C3E3D;white-space:pre-line;
          word-break:keep-all;overflow-wrap:break-word;}
  .quote-list{display:grid;gap:3px;margin-bottom:8px;}
  .quote-item{display:grid;grid-template-columns:36px minmax(0,1fr) 132px;gap:12px;align-items:start;
              padding:6px 0;border-bottom:1px solid #E4F0EE;}
  .item-index{font-size:10px;font-weight:700;color:#E85D2C;}
  .item-main strong{display:block;font-size:10.6px;color:#1C2B28;margin-bottom:1px;word-break:keep-all;overflow-wrap:break-word;}
  .item-main span{display:block;font-size:9.2px;color:#6B8B87;line-height:1.35;word-break:keep-all;overflow-wrap:break-word;}
  .item-main em{display:inline-block;margin-top:4px;font-style:normal;font-size:9px;color:#fff;
                background:#155855;border-radius:99px;padding:1px 7px;}
  .item-amount{text-align:right;}
  .item-amount small{display:block;font-size:9px;color:#9BB5B0;margin-bottom:2px;}
  .item-amount b{font-size:10.8px;color:#155855;}
  .amount-panel{display:grid;grid-template-columns:minmax(0,1fr) 270px;gap:18px;align-items:end;
                border-top:2px solid #155855;padding-top:8px;}
  .amount-note{font-size:9px;color:#6B8B87;line-height:1.45;word-break:keep-all;}
  .amt-row{display:flex;justify-content:space-between;padding:2px 0;font-size:9.8px;
           border-bottom:.5px solid #EEF4F3;}
  .amt-row .l{color:#6B8B87;}
  .amt-total{display:flex;justify-content:space-between;padding:5px 0;font-size:12px;
             font-weight:700;color:#155855;border-top:2px solid #E85D2C;margin-top:2px;}
  .pay-boxes{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:7px;}
  .pay-box{border:1px solid #C8DDD9;border-radius:7px;padding:8px;text-align:center;background:#FAFCFC;}
  .pay-box .pt{font-size:10px;color:#9BB5B0;margin-bottom:3px;}
  .pay-box .pa{font-size:14px;font-weight:700;color:#155855;}
  .pay-box:first-child .pa{color:#E85D2C;}
  .pay-box .ps{font-size:10px;color:#9BB5B0;margin-top:2px;}
  .effect-box{background:#FFF6F1;border:1px solid #F3C6B1;border-radius:7px;
              padding:8px 10px;margin:14px 0 12px;font-size:9.1px;
              color:#2C3E3D;line-height:1.55;text-align:center;}
  .sign-area{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px;align-items:stretch;}
  .sign-box{min-width:0;border:1px solid #C8DDD9;border-radius:9px;padding:12px 14px;}
  .sign-box h4{font-size:11px;font-weight:700;color:#6B8B87;margin-bottom:12px;
               padding-bottom:5px;border-bottom:1px solid #EEF4F3;}
  .sl{display:grid;grid-template-columns:64px minmax(0,1fr);gap:8px;align-items:center;margin-bottom:6px;}
  .sl .sk{font-size:9.8px;color:#9BB5B0;}
  .sl .sv{font-size:10.8px;font-weight:600;color:#1C2B28;border-bottom:1px solid #C8DDD9;
          padding-bottom:1px;min-height:20px;min-width:0;}
  .signature-image{display:block;width:128px;height:42px;object-fit:contain;object-position:left center;}
  .stamp{margin-top:8px;height:42px;border:1px dashed #C8DDD9;border-radius:6px;
         display:flex;align-items:center;justify-content:center;font-size:10px;color:#C8DDD9;}
  .effect-line{display:block;white-space:nowrap;letter-spacing:-.02em;}
  .final-page{display:flex;flex-direction:column;}
  .final-spacer{flex:1;min-height:260px;}
  .footer{margin-top:12px;text-align:center;font-size:9px;color:#9BB5B0;
          padding-top:8px;border-top:1px solid #EEF4F3;}
  @media print{
    body{padding:0;background:#fff;}
    .contract-page{margin:0;box-shadow:none;}
    @page{size:A4;margin:0;}
  }
</style>
</head>
<body>

<div class="contract-page">
<div class="top-accent"></div>
<div class="header">
  <div>
    <img class="brand-logo" src="/assets/photoclinic-logo.png" alt="PHOTOCLINIC">
    <div class="brand-sub">제이크이미지연구소 · 병원 전문 브랜드 촬영</div>
    <div class="brand-sub">사업자번호: 190-16-00212 · 제이크이미지연구소</div>
  </div>
  <div>
    <div class="doc-title">포토클리닉 브랜드촬영 계약서</div>
    <div class="doc-meta">
      <strong>계약일: ${today}</strong><br>
      견적번호: ${q.quoteNumber || "PC-" + new Date().toISOString().slice(0,10).replace(/-/g,"")}
    </div>
  </div>
</div>

<div class="parties">
  <div class="party party-client">
    <h3>계약 병원</h3>
    <div class="row"><span class="k">병원명</span><span class="v">${q.hospitalName || "-"}</span></div>
    <div class="row"><span class="k">대표원장</span><span class="v">${q.contactName || "-"}</span></div>
    <div class="row"><span class="k">사업자번호</span><span class="v">${q.businessNumber || "-"}</span></div>
    <div class="row"><span class="k">연락처</span><span class="v">${q.phone || "-"}</span></div>
    <div class="row"><span class="k">이메일</span><span class="v">${q.email || "-"}</span></div>
  </div>
  <div class="party">
    <h3>포토클리닉(제이크이미지연구소)</h3>
    <div class="row"><span class="k">상호</span><span class="v">포토클리닉(제이크이미지연구소)</span></div>
    <div class="row"><span class="k">대표자</span><span class="v">정연호</span></div>
    <div class="row"><span class="k">사업자번호</span><span class="v">190-16-00212</span></div>
    <div class="row"><span class="k">연락처</span><span class="v">010-8556-2988</span></div>
    <div class="row"><span class="k">계좌</span><span class="v">1002-754-988962 (우리은행 / 제이크이미지연구소)</span></div>
  </div>
</div>

${section("제1조", "계약 목적 및 촬영 범위", scope)}

<div class="section">
  <h3><span class="art">제2조</span>촬영 항목 및 계약 금액</h3>
  <div class="quote-list">${itemCards}</div>
  <div class="amount-panel">
    <p class="amount-note">
      상기 금액은 견적서 기준으로 산정되며, 촬영 범위 또는 납품 범위가 변경되는 경우 상호 협의에 따라 조정될 수 있습니다.
    </p>
    <div class="amt-box">
      <div class="amt-row"><span class="l">공급가액</span><span>${fmt(q.supplyAmount)}원</span></div>
      ${q.discountAmount > 0 ? `<div class="amt-row"><span class="l">할인금액</span><span style="color:#E85D2C;">-${fmt(q.discountAmount)}원</span></div>` : ""}
      <div class="amt-row"><span class="l">부가세 (10%)</span><span>${fmt(q.vat)}원</span></div>
      <div class="amt-total"><span>최종 계약금액</span><span>${fmt(q.totalAmount)}원</span></div>
    </div>
  </div>
</div>
<div class="section">
  <h3><span class="art">제3조</span>결제 조건</h3>
  <div class="clause">${payment}</div>
  <div class="pay-boxes">
    <div class="pay-box">
      <div class="pt">계약금 (선금 50%)</div>
      <div class="pa">${fmt(q.depositAmount)}원</div>
      <div class="ps">계약 체결 시 납부</div>
    </div>
    <div class="pay-box">
      <div class="pt">잔금 (50%)</div>
      <div class="pa">${fmt(q.balanceAmount)}원</div>
      <div class="ps">마지막 촬영 직후 납부</div>
    </div>
  </div>
</div>
</div>

<div class="contract-page">
${section("제4조", "납품물 및 전달 방식", deliverables)}
${section("제5조", "촬영 일정 및 납품 기한", schedule)}
${section("제6조", "저작권 및 사용권", copyright)}
${section("제7조", "수정 요청", retake)}
${section("제8조", "비밀유지 및 결과물 공개", confidential)}
</div>

<div class="contract-page final-page">
${section("제9조", "분쟁 해결", dispute)}
${section("제10조", "특약사항", special)}

<div class="final-spacer"></div>

<div class="effect-box">
  <span class="effect-line">위 계약의 성립을 증명하기 위하여 본 계약서를 2부 작성하고, 각 1부씩 보관합니다.</span><br>
  <strong>${today}</strong>
</div>

<div class="sign-area">
  <div class="sign-box">
    <h4>계약 병원</h4>
    <div class="sl"><span class="sk">병원명</span><span class="sv">${q.hospitalName || ""}</span></div>
    <div class="sl"><span class="sk">사업자번호</span><span class="sv">${q.businessNumber || ""}</span></div>
    <div class="sl"><span class="sk">대표원장</span><span class="sv">${q.contactName || ""}</span></div>
    <div class="sl"><span class="sk">서명일</span><span class="sv"></span></div>
    <div class="sl"><span class="sk">서명</span><span class="sv"></span></div>
    <div class="stamp">직인 / 서명</div>
  </div>
  <div class="sign-box">
    <h4>포토클리닉(제이크이미지연구소)</h4>
    <div class="sl"><span class="sk">상호</span><span class="sv">포토클리닉(제이크이미지연구소)</span></div>
    <div class="sl"><span class="sk">사업자번호</span><span class="sv">190-16-00212</span></div>
    <div class="sl"><span class="sk">대표자</span><span class="sv">정연호</span></div>
    <div class="sl"><span class="sk">서명일</span><span class="sv">${today}</span></div>
    <div class="sl"><span class="sk">서명</span><span class="sv">${signatureHtml}</span></div>
    <div class="stamp">직인 / 서명</div>
  </div>
</div>

<div class="footer">
  PHOTOCLINIC · 제이크이미지연구소 · 병원 전문 브랜드 촬영 · @photoclinic_kr<br>
  본 계약서는 양 당사자가 서명한 시점부터 법적 효력이 발생합니다.
</div>
</div>
</body>
</html>`;
}
