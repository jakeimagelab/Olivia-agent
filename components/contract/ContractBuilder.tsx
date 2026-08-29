"use client";
import type { PointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createMailingDraft } from "@/lib/mailingQueue";
import { useSaveShortcut } from "@/lib/hooks/useSaveShortcut";
import { uploadWorkflowArtifact } from "@/lib/workflowArtifacts";
import GlobalHeader from "@/components/GlobalHeader";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import { useContractPdfHandlerStore } from "@/lib/store/useContractPdfHandlerStore";
import { computeContractDeposit } from "@/lib/contract/computeContractDeposit";

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
  // 채팅 계약 워크플로우(2026-08-30)가 추가한 선택 필드 — 없으면 기존 하드코딩 조항 텍스트가
  // 그대로 쓰인다(buildContractHtml 참고). depositRate가 있으면 depositAmount/balanceAmount보다
  // 우선해서 computeContractDeposit()로 다시 계산한다.
  depositRate?: number;
  paymentTerms?: string;
  deliveryTerms?: string;
  specialTerms?: string;
}

type ContractBrand = "photoclinic" | "jakeimage";

const THEME: Record<ContractBrand, {
  teal: string; orange: string;
  bg: string; surface: string; border: string;
  muted: string; hint: string; txt: string; mint: string;
}> = {
  photoclinic: {
    teal: "#155855", orange: "#E85D2C",
    bg: "#EDF5F3", surface: "#FFFFFF", border: "#C8DDD9",
    muted: "#5A7470", hint: "#9BB5B0", txt: "#1C2B28", mint: "#EAF4F2",
  },
  jakeimage: {
    teal: "#162238", orange: "#2f4a73",
    bg: "#EEF1F5", surface: "#FFFFFF", border: "#CDDAEA",
    muted: "#5A6A80", hint: "#9BA9BB", txt: "#1C2632", mint: "#EEF2F7",
  },
};

const CONTRACT_BRAND_CONFIG: Record<ContractBrand, {
  label: string;
  logo: string;
  logoAlt: string;
  brandSub: string;
  docTitle: string;
  headerTitle: string;
  entityLabel: string;
  clientPartyTitle: string;
  directorLabel: string;
  companyDisplayName: string;
  footerTagline: string;
  emailPlaceholder: string;
  scopeClause: string;
  copyrightClause: string;
  confidentialClause: string;
}> = {
  photoclinic: {
    label: "포토클리닉",
    logo: "/assets/photoclinic-logo.png",
    logoAlt: "PHOTOCLINIC",
    brandSub: "제이크이미지연구소 · 병원 전문 브랜드 촬영",
    docTitle: "포토클리닉 브랜드촬영 계약서",
    headerTitle: "브랜드촬영 계약서",
    entityLabel: "병원명",
    clientPartyTitle: "계약 병원",
    directorLabel: "대표원장",
    companyDisplayName: "포토클리닉(제이크이미지연구소)",
    footerTagline: "PHOTOCLINIC · 제이크이미지연구소 · 병원 전문 브랜드 촬영 · @photoclinic_kr",
    emailPlaceholder: "photoclnic@gmail.com",
    scopeClause: "포토클리닉은 병원 이미지브랜드 구축을 위한,\n전문 촬영 서비스(사진/영상)을 제공합니다.\n촬영 범위는 본 계약서 제2조의 항목에 한합니다.\n납품 결과물은 색보정 완료 JPG와 원본 파일을 제공합니다.\n영상 작업이 포함된 경우 편집 완료 영상(4K, FHD)을 파일로 제공합니다.\n촬영 항목 외 추가 촬영 시 별도 견적을 협의합니다.",
    copyrightClause: "촬영 결과물의 저작권은 계약 병원에 귀속됩니다.\n포토클리닉은 결과물을 포트폴리오, 홍보 및 마케팅 목적으로 사용할 수 있습니다.\n단, 민감한 의료정보나 얼굴 노출이 있는 부분은 병원의 동의 없이는 사용하지 않습니다.",
    confidentialClause: "포토클리닉은 촬영 과정에서 취득한 계약 병원의 내부 정보를\n외부에 공개하지 않습니다.\n내부 정보에는 환자 정보, 경영 정보 등이 포함됩니다.\n결과물은 계약 병원의 승인 전 SNS 등 외부 채널에 공개하지 않습니다.\n계약 병원의 승인 후 포토클리닉의 포트폴리오 채널에 게시될 수 있습니다.\n포트폴리오 채널에는 홈페이지, 인스타그램, 블로그 등이 포함됩니다.",
  },
  jakeimage: {
    label: "제이크이미지연구소",
    logo: "/assets/jakeimage-logo.png",
    logoAlt: "Jake Image Institute",
    brandSub: "Jake Image Institute · Brand Image Direction",
    docTitle: "제이크이미지연구소 브랜드사진 계약서",
    headerTitle: "브랜드사진 계약서",
    entityLabel: "회사명",
    clientPartyTitle: "계약 고객사",
    directorLabel: "대표자",
    companyDisplayName: "제이크이미지연구소",
    footerTagline: "JAKE IMAGE INSTITUTE · Brand Image Direction",
    emailPlaceholder: "contact@jakeimage.com",
    scopeClause: "제이크이미지연구소는 기업·개인 브랜드 이미지 구축을 위한,\n전문 촬영 서비스(사진/영상)을 제공합니다.\n촬영 범위는 본 계약서 제2조의 항목에 한합니다.\n납품 결과물은 색보정 완료 JPG와 원본 파일을 제공합니다.\n영상 작업이 포함된 경우 편집 완료 영상(4K, FHD)을 파일로 제공합니다.\n촬영 항목 외 추가 촬영 시 별도 견적을 협의합니다.",
    copyrightClause: "촬영 결과물의 저작권은 계약 고객사에 귀속됩니다.\n제이크이미지연구소는 결과물을 포트폴리오, 홍보 및 마케팅 목적으로 사용할 수 있습니다.\n단, 민감한 정보나 얼굴 노출이 있는 부분은 고객사의 동의 없이는 사용하지 않습니다.",
    confidentialClause: "제이크이미지연구소는 촬영 과정에서 취득한 계약 고객사의 내부 정보를\n외부에 공개하지 않습니다.\n내부 정보에는 고객 정보, 경영 정보 등이 포함됩니다.\n결과물은 계약 고객사의 승인 전 SNS 등 외부 채널에 공개하지 않습니다.\n계약 고객사의 승인 후 제이크이미지연구소의 포트폴리오 채널에 게시될 수 있습니다.\n포트폴리오 채널에는 홈페이지, 인스타그램, 블로그 등이 포함됩니다.",
  },
};

const fmt = (n: number) => (n || 0).toLocaleString("ko-KR");

export default function ContractBuilder({
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
  const [publishState, setPublishState] = useState<"idle" | "publishing" | "done" | "error">("idle");
  const [completeState, setCompleteState] = useState<"idle" | "completing" | "done" | "error">("idle");
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [brand, setBrand] = useState<ContractBrand>("photoclinic");
  const C = THEME[brand];
  const cfg = CONTRACT_BRAND_CONFIG[brand];

  // Workspace Modal 모드 전용 — dirty 추적/자동저장/닫기 확인 (mode="page"일 땐 전부 미사용).
  const lastSavedSnapshotRef = useRef<string>("");
  const pendingSaveRef = useRef<Promise<string | null> | null>(null);
  const [dirty, setDirty] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  // QuoteBuilder.tsx는 이 4줄을 이미 갖고 있지만 ContractBuilder.tsx엔 없었다 — 채팅 경유로
  // 열릴 때는 actionRouter.ts의 OPEN_WORKSPACE 케이스가 대신 context.setWorkspace()를 호출해
  // 지금까지도 동작했지만, 계약서 페이지를 직접 방문했을 땐 채팅 컨텍스트가 전혀 안 잡혔다
  // (2026-08-30, PHASE 3). QuoteBuilder와 동일하게 무조건 호출한다.
  const setOliviaWorkspace = useOliviaContextStore((state) => state.setWorkspace);
  const setOliviaProject = useOliviaContextStore((state) => state.setProject);
  const setOliviaCurrentDocumentTotal = useOliviaContextStore((state) => state.setCurrentDocumentTotal);
  useEffect(() => {
    setOliviaWorkspace("contract", resourceId);
    if (workflowRunId) setOliviaProject(workflowRunId);
    return () => {
      const current = useOliviaContextStore.getState();
      if (current.activeWorkspace === "contract" && current.activeResourceId === resourceId) {
        current.setWorkspace(undefined, undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId, setOliviaProject, setOliviaWorkspace, workflowRunId]);

  useEffect(() => {
    setOliviaCurrentDocumentTotal(quote?.totalAmount, dirty);
    return () => setOliviaCurrentDocumentTotal(undefined, undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote?.totalAmount, dirty, setOliviaCurrentDocumentTotal]);

  useEffect(() => {
    if (!isModal) return;
    // resourceId(기존 계약서)가 있으면 그대로 불러오고, 없으면 그 고객의 저장된 견적서를
    // 찾아 계약서 초안의 기초 데이터로 쓴다(계약서는 견적 데이터를 그대로 이어받는 문서라
    // 견적서가 아직 없으면 고객 기본 정보만으로 빈 계약서를 시작한다).
    if (resourceId) {
      const loadContract = () => fetch(`/api/contracts/${resourceId}`)
        .then((r) => r.json())
        .then((json) => {
          if (!json.ok) return;
          setContractId(resourceId);
          // deposit_rate/payment_terms/delivery_terms/special_terms는 quote_data(jsonb) 안이
          // 아니라 contracts 테이블의 별도 컬럼이라 매번 병합해서 넣는다(채팅 update_contract_terms
          // 도구가 이 컬럼들만 patch하므로, quote_data 자체는 안 건드려도 최신 상태로 보인다).
          setQuote(json.data.quote_data ? {
            ...json.data.quote_data,
            depositRate: json.data.deposit_rate ?? undefined,
            paymentTerms: json.data.payment_terms ?? undefined,
            deliveryTerms: json.data.delivery_terms ?? undefined,
            specialTerms: json.data.special_terms ?? undefined,
          } : null);
          setSignatureDataUrl(json.data.signature_data_url ?? "");
        })
        .catch(() => {});
      void loadContract();
      // 채팅으로 지금 열려 있는 계약서를 수정했을 때 새로고침 없이 화면에 바로 반영되도록
      // (콘티/견적서와 동일한 패턴 — lib/olivia/agent/actionRouter.ts의 REFRESH_RESOURCE가
      // 이 이벤트를 쏜다).
      const onRefresh = (event: Event) => {
        const detail = (event as CustomEvent<{ resource?: string; resourceId?: string }>).detail;
        if ((!detail?.resource || detail.resource === "contract") && (!detail?.resourceId || detail.resourceId === resourceId)) void loadContract();
      };
      window.addEventListener("olivia-resource-refresh", onRefresh);
      return () => window.removeEventListener("olivia-resource-refresh", onRefresh);
    }
    if (!modalClientId) return;
    fetch(`/api/clients/${modalClientId}/workspace`)
      .then((r) => r.json())
      .then(async (ws) => {
        if (!ws.ok) return;
        const quoteId = ws.resourceIds?.quote;
        if (quoteId) {
          const qRes = await fetch(`/api/quotes/${quoteId}`).then((r) => r.json()).catch(() => null);
          if (qRes?.ok) {
            const q = qRes.quote;
            setQuote({
              hospitalName: q.hospital_name || "",
              contactName: q.contact_name || "",
              phone: q.phone || "",
              email: q.email || "",
              quoteNumber: q.quote_number || "",
              quoteDate: q.quote_date || new Date().toISOString().slice(0, 10),
              shootDate: q.shoot_date || null,
              validUntil: q.valid_until || "",
              items: q.items ?? [],
              supplyAmount: q.supply_amount || 0,
              discountAmount: q.discount_amount || 0,
              vat: q.vat || 0,
              totalAmount: q.total_amount || 0,
              depositAmount: q.deposit_amount || 0,
              balanceAmount: q.balance_amount || 0,
              memos: q.memos ?? null,
            });
            return;
          }
        }
        const today = new Date().toISOString().slice(0, 10);
        setQuote({
          hospitalName: ws.client?.name || "",
          contactName: ws.client?.manager_name || "",
          phone: ws.client?.phone || "",
          email: ws.client?.email || "",
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModal, modalClientId, resourceId]);

  useEffect(() => {
    if (isModal) return;
    const params   = new URLSearchParams(window.location.search);
    const clientId = params.get("client_id") || params.get("clientId");
    const raw      = params.get("data");
    const brandParam = params.get("brand");
    const activeBrand: ContractBrand = brandParam === "jakeimage" ? "jakeimage" : "photoclinic";
    setBrand(activeBrand);
    const activeCfg = CONTRACT_BRAND_CONFIG[activeBrand];

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
        subject: `[${activeCfg.label}] ${data.hospitalName} 촬영 계약서`,
        body: `${activeCfg.label} 촬영 계약서를 발송드립니다.\n내용 확인 후 서명하여 회신 부탁드립니다.\n\n계약 금액: ${(data.totalAmount || 0).toLocaleString("ko-KR")}원\n계약금 (50%): ${(data.depositAmount || 0).toLocaleString("ko-KR")}원\n잔금 (50%): ${(data.balanceAmount || 0).toLocaleString("ko-KR")}원`,
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
    setContractHtml(buildContractHtml(quote, signatureDataUrl, brand));
  }, [quote, signatureDataUrl, brand]);

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
    `${cfg.label}_계약서_${quote?.hospitalName || "고객"}_${quote?.quoteDate || ""}.pdf`;

  const downloadPdf = async () => {
    if (!contractHtml || !quote) return;
    setPdfGenerating(true); setError("");
    try {
      const savedContractId = await handleSave();
      if (!savedContractId) throw new Error("계약 DB 저장에 실패했습니다.");
      const pdf = await createContractPdf();
      const fileName = contractFileName();
      const pageParams = new URLSearchParams(window.location.search);
      try {
        // 고객 레코드가 아직 CRM에 없어 연결에 실패해도 로컬 PDF 저장은 막지 않는다.
        await uploadWorkflowArtifact({
          file: pdf.output("blob"),
          fileName,
          documentType: "contract",
          sourceTable: "contracts",
          sourceId: savedContractId,
          title: `${quote.hospitalName} 촬영 계약서`,
          hospitalName: quote.hospitalName,
          clientId: effectiveClientId(pageParams),
          workflowRunId: effectiveWorkflowRunId(pageParams),
        });
      } catch (artifactError) {
        console.error("workflow artifact upload failed (non-blocking)", artifactError);
      }
      pdf.save(fileName);
    } catch (e: any) {
      setError(e.message || "PDF 생성에 실패했습니다.");
    } finally {
      setPdfGenerating(false);
    }
  };

  /* ── Excel 다운로드 (열너비 적용, 2시트) — 코드 요청서 3차 2번 항목, 견적서/콘티와
     같은 패턴(xlsx 패키지, aoa_to_sheet) ── */
  const downloadExcel = async () => {
    if (!quote) return;
    const XLSX = await import("xlsx");
    const hospitalName = quote.hospitalName || "병원";

    const styleSheet = (ws: any, colWidths: number[]) => {
      ws["!cols"] = colWidths.map((w) => ({ wch: w }));
      return ws;
    };

    const infoWs = styleSheet(XLSX.utils.aoa_to_sheet([
      ["병원명", quote.hospitalName],
      ["담당자", quote.contactName],
      ["연락처", quote.phone],
      ["이메일", quote.email],
      ["견적번호", quote.quoteNumber],
      ["견적일", quote.quoteDate],
      ["촬영예정일", quote.shootDate || ""],
      ["유효기간", quote.validUntil],
    ]), [14, 30]);

    const itemsWs = styleSheet(XLSX.utils.aoa_to_sheet([
      ["항목명", "상세", "단가", "수량", "소계", "비고"],
      ...quote.items.map((item) => [item.name, item.detail || "", item.unitPrice, item.qty, item.subtotal, item.note || ""]),
      [],
      ["공급가액", "", "", "", quote.supplyAmount, ""],
      ["할인", "", "", "", -quote.discountAmount, ""],
      ["부가세", "", "", "", quote.vat, ""],
      ["합계", "", "", "", quote.totalAmount, ""],
      ["선금", "", "", "", quote.depositAmount, ""],
      ["잔금", "", "", "", quote.balanceAmount, ""],
    ]), [24, 22, 12, 8, 14, 16]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, infoWs, "기본정보");
    XLSX.utils.book_append_sheet(wb, itemsWs, "계약내역");
    XLSX.writeFile(wb, `${hospitalName}_계약서.xlsx`);
  };

  const publishToPortal = async () => {
    setPublishState("publishing"); setError("");
    try {
      const savedContractId = await handleSave();
      if (!savedContractId) throw new Error("계약 DB 저장에 실패했습니다.");
      const pageParams = new URLSearchParams(window.location.search);
      const r = await fetch(`/api/contracts/${savedContractId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: effectiveClientId(pageParams) || undefined,
          workflowRunId: effectiveWorkflowRunId(pageParams) || undefined,
        }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(d.portalUrl).catch(() => {});
      }
      setPublishState("done");
      setTimeout(() => setPublishState("idle"), 3000);
      if (isModal) setTimeout(() => { onPublished?.(); onClose?.(); }, 700);
    } catch (e: any) {
      setError(e.message || "포털 공개에 실패했습니다.");
      setPublishState("error");
      setTimeout(() => setPublishState("idle"), 3000);
    }
  };

  // "최종완료" — 코드 요청서 2차(2026-08-16) 2번 항목. 저장 → 워크플로우 contract 단계 완료 처리 →
  // 다음 단계로 진행까지 승인 없이 즉시 처리한다. 포털 공개와 완전히 분리된 동작.
  const completeContractStep = async () => {
    setCompleteState("completing"); setError("");
    try {
      const savedContractId = await handleSave();
      if (!savedContractId) throw new Error("계약 DB 저장에 실패했습니다.");
      const pageParams = new URLSearchParams(isModal ? "" : window.location.search);
      const workflowRunId = effectiveWorkflowRunId(pageParams);
      if (!workflowRunId) throw new Error("계약서에 연결된 프로젝트가 없습니다. 먼저 견적서를 완료해 프로젝트를 생성해주세요.");
      const r = await fetch(`/api/workflow-runs/${workflowRunId}/complete-step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepKey: "contract" }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setCompleteState("done");
      setTimeout(() => setCompleteState("idle"), 3000);
    } catch (e: any) {
      setError(e.message || "최종완료 처리에 실패했습니다.");
      setCompleteState("error");
      setTimeout(() => setCompleteState("idle"), 3000);
    }
  };

  // 페이지 모드는 URL 쿼리(client_id/workflowRunId)에서, 모달 모드는 props에서 읽는다.
  const effectiveClientId = (pageParams: URLSearchParams) =>
    isModal ? modalClientId : (pageParams.get("client_id") || pageParams.get("clientId"));
  const effectiveWorkflowRunId = (pageParams: URLSearchParams) =>
    isModal ? modalWorkflowRunId : pageParams.get("workflowRunId");

  const handleSave = async (): Promise<string | null> => {
    if (!quote) return null;
    setSaveState("saving");
    const pageParams = new URLSearchParams(isModal ? "" : window.location.search);
    const linkIds = isModal ? { clientId: modalClientId, workflowRunId: modalWorkflowRunId } : {
      clientId: effectiveClientId(pageParams) ?? undefined,
      workflowRunId: effectiveWorkflowRunId(pageParams) ?? undefined,
    };
    try {
      let savedId: string | null;
      if (contractId) {
        const r = await fetch(`/api/contracts/${contractId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quoteData: quote, signatureDataUrl: signatureDataUrl || null,
            hospitalName: quote.hospitalName, contactName: quote.contactName, email: quote.email,
            ...linkIds,
          }),
        });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error);
        savedId = contractId;
      } else {
        const r = await fetch("/api/contracts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quoteNumber: quote.quoteNumber, hospitalName: quote.hospitalName,
            contactName: quote.contactName, email: quote.email,
            quoteData: quote, signatureDataUrl: signatureDataUrl || null,
            ...linkIds,
          }),
        });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error);
        setContractId(d.id);
        savedId = d.id;
      }
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
      if (isModal) {
        lastSavedSnapshotRef.current = JSON.stringify({ quote, signatureDataUrl });
        setDirty(false);
      }
      return savedId;
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
      return null;
    }
  };

  useSaveShortcut(handleSave);

  // ── Workspace Modal 전용 동작 (mode==="modal"일 때만 개입) ──

  // dirty 추적: quote/signatureDataUrl 스냅샷을 마지막 저장본과 비교한다.
  useEffect(() => {
    if (!isModal) return;
    const snapshot = JSON.stringify({ quote, signatureDataUrl });
    setDirty(snapshot !== lastSavedSnapshotRef.current);
  }, [isModal, quote, signatureDataUrl]);

  // 자동저장: dirty가 1000ms 유지되면 handleSave()를 그대로 재사용해 저장한다.
  useEffect(() => {
    if (!isModal || !dirty || !quote) return;
    const timer = setTimeout(() => {
      setAutosaveStatus("saving");
      const savePromise = handleSave().then((saved) => {
        setAutosaveStatus(saved ? "saved" : "error");
        return saved;
      });
      pendingSaveRef.current = savePromise;
    }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModal, dirty, quote, signatureDataUrl]);

  // 닫기 정책: 진행 중인 자동저장이 있으면 먼저 기다리고, 저장 안 된 변경사항이 남아있으면
  // 확인창을, 없으면 바로 닫는다.
  const handleModalClose = async () => {
    if (!isModal) return;
    if (pendingSaveRef.current) await pendingSaveRef.current;
    const stillDirty = JSON.stringify({ quote, signatureDataUrl }) !== lastSavedSnapshotRef.current;
    if (!stillDirty) { onClose?.(); return; }
    setCloseConfirmOpen(true);
  };
  useEffect(() => {
    if (!isModal) return;
    registerRequestClose?.(() => handleModalClose);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModal, registerRequestClose, dirty]);

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
    <>
    <div
      className={`contract-app${brand === "jakeimage" ? " contract-app--jakeimage" : ""}`}
      style={isModal ? { background: C.bg, fontFamily: "'NanumSquare', 'Noto Sans KR', sans-serif" } : { minHeight: "100vh", background: C.bg, fontFamily: "'NanumSquare', 'Noto Sans KR', sans-serif" }}
    >

      {isModal ? (
        <div style={{ padding: "8px 20px", fontSize: 11.5, fontWeight: 700, color: autosaveStatus === "error" ? "#DC2626" : "#5a7470" }}>
          {autosaveStatus === "saving" ? "저장 중..." : autosaveStatus === "saved" ? "저장됨" : autosaveStatus === "error" ? "저장 실패" : dirty ? "저장 안 된 변경사항 있음" : ""}
        </div>
      ) : null}

      {/* NAV */}
      {(() => {
        const actionButtons = (
          <>
            {isModal ? null : (
              <button onClick={() => window.history.back()} className="pc-header-back">
                ← 견적서로
              </button>
            )}
            <button onClick={handleSave} disabled={saveState === "saving"} className="pc-btn pc-btn--sm"
              style={{
                borderColor: saveState === "saved" ? "#22C55E" : saveState === "error" ? C.orange : undefined,
                color: saveState === "saved" ? "#16a34a" : saveState === "error" ? C.orange : undefined,
              }}>
              {saveState === "saving" ? "저장 중..." : saveState === "saved" ? "✓ 저장됨" : saveState === "error" ? "✕ 저장 실패" : "저장 (⌘S)"}
            </button>
            <div style={{ position: "relative" }}>
              <button onClick={() => setShowDownloadMenu((v) => !v)} disabled={pdfGenerating} className="pc-btn pc-btn--primary pc-btn--sm">
                {pdfGenerating ? "PDF 생성 중..." : "다운로드 ▾"}
              </button>
              {showDownloadMenu && (
                <div style={{
                  position: "absolute", top: "100%", right: 0, marginTop: 4, zIndex: 30,
                  background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10,
                  boxShadow: "0 12px 30px rgba(21,88,85,.14)", minWidth: 120, overflow: "hidden",
                }}>
                  <button type="button" onClick={() => { setShowDownloadMenu(false); void downloadPdf(); }}
                    style={{ display: "block", width: "100%", padding: "10px 14px", border: 0, background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 700, color: C.teal, textAlign: "left" }}>
                    PDF
                  </button>
                  <button type="button" onClick={() => { setShowDownloadMenu(false); void downloadExcel(); }}
                    style={{ display: "block", width: "100%", padding: "10px 14px", border: 0, borderTop: `1px solid ${C.border}`, background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 700, color: C.teal, textAlign: "left" }}>
                    Excel
                  </button>
                </div>
              )}
            </div>
            <button onClick={completeContractStep} disabled={completeState === "completing"} className="pc-btn pc-btn--sm"
              style={{
                background: completeState === "done" ? undefined : "#155855",
                color: completeState === "done" ? "#16a34a" : "#fff",
                borderColor: completeState === "error" ? C.orange : undefined,
              }}>
              {completeState === "completing" ? "최종완료 처리 중..." : completeState === "done" ? "✓ 최종완료됨" : completeState === "error" ? "✕ 완료 실패" : "최종완료"}
            </button>
            <button onClick={publishToPortal} disabled={publishState === "publishing"} className="pc-btn pc-btn--secondary pc-btn--sm"
              style={{
                borderColor: publishState === "done" ? "#22C55E" : publishState === "error" ? C.orange : undefined,
                color: publishState === "done" ? "#16a34a" : publishState === "error" ? C.orange : undefined,
              }}>
              {publishState === "publishing" ? "공개 중..." : publishState === "done" ? "✓ 공개됨(링크 복사됨)" : publishState === "error" ? "✕ 공개 실패" : "포털 공개"}
            </button>
          </>
        );
        return isModal ? (
          <header className="pc-header">
            <div className="pc-header-left">
              <div className="pc-header-brand">
                <img src={cfg.logo} alt={cfg.label} className="pc-header-logo" />
                <span className="pc-header-title">{cfg.headerTitle}</span>
              </div>
            </div>
            <div className="pc-header-actions">{actionButtons}</div>
          </header>
        ) : (
          <GlobalHeader title={cfg.headerTitle} description="촬영 패키지와 옵션을 확정한 계약서를 생성합니다." pageActions={actionButtons} />
        );
      })()}

      <div className="pc-mobile-stack" style={{ maxWidth: 1240, margin: "0 auto", padding: "24px 20px", display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 20, alignItems: "start" }}>

        {/* 계약서 미리보기 */}
        <div className="pc-card">
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

          {/* 계약 고객 정보 */}
          <div className="pc-card pc-card--padded">
            <div style={{ fontSize: 12, fontWeight: 700, color: C.teal, marginBottom: 10 }}>
              {brand === "jakeimage" ? `🏢 ${cfg.clientPartyTitle} 정보` : `🏥 ${cfg.clientPartyTitle} 정보`}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 3 }}>
                  {cfg.entityLabel}
                </label>
                <input value={quote.hospitalName} onChange={e => updateQuote("hospitalName", e.target.value)}
                  placeholder={cfg.label} style={iS}/>
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 3 }}>
                  {cfg.directorLabel}
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
                  placeholder={cfg.emailPlaceholder} style={iS}/>
              </div>
            </div>
          </div>

          {/* 서명 */}
          <div className="pc-card pc-card--padded">
            <div style={{ fontSize: 12, fontWeight: 700, color: C.teal, marginBottom: 8 }}>✍️ {cfg.label} 서명</div>
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
              className="pc-btn pc-btn--secondary pc-btn--sm"
              style={{ width: "100%", marginTop: 8 }}
            >
              서명 지우기
            </button>
          </div>

          {/* PDF/Excel 다운로드 */}
          <div className="pc-card pc-card--padded">
            <div style={{ fontSize: 12, fontWeight: 700, color: C.teal, marginBottom: 8 }}>📄 다운로드</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.7, marginBottom: 12 }}>
              계약서 미리보기 내용 그대로 PDF,<br/>계약 내역은 Excel로 받을 수 있습니다.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={downloadPdf} disabled={pdfGenerating}
                className="pc-btn pc-btn--primary" style={{ flex: 1 }}>
                {pdfGenerating ? "PDF 생성 중..." : "PDF"}
              </button>
              <button onClick={downloadExcel}
                className="pc-btn pc-btn--secondary" style={{ flex: 1 }}>
                Excel
              </button>
            </div>
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
            <button type="button" onClick={async () => { await handleSave(); setCloseConfirmOpen(false); onClose?.(); }}
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

// ── 계약서 HTML 생성 (고정 템플릿 + 데이터 채우기) ──────────
function buildContractHtml(q: QuoteData, signatureDataUrl = "", brand: ContractBrand = "photoclinic"): string {
  const cfg = CONTRACT_BRAND_CONFIG[brand];
  const ink = brand === "jakeimage" ? "#162238" : "#155855";
  const accent = brand === "jakeimage" ? "#2f4a73" : "#E85D2C";
  const tint = brand === "jakeimage" ? "#EEF2F7" : "#FFF6F1";
  const tintBorder = brand === "jakeimage" ? "#CDDAEA" : "#F3C6B1";
  const quoteNumberPrefix = brand === "jakeimage" ? "JI-" : "PC-";
  const today = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  const baseHref = typeof window !== "undefined" ? window.location.origin : "";
  const signatureHtml = signatureDataUrl
    ? `<img class="signature-image" src="${signatureDataUrl}" alt="${cfg.label} 서명">`
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

  // 고정 조항 (브랜드별 고객사 지칭 어휘만 다르고 나머지 조건은 동일)
  const scope       = cfg.scopeClause;
  const deliverables = `납품 파일: 색보정 완료 JPG, 원본 파일, 편집 완료 영상(4K, FHD)\n전달 방법: 클라우드(NAS) 링크로 전달\n납품 수량: 촬영 항목별 협의된 수량 기준\n현장 상황에 따라 납품 수량은 ±10% 범위에서 조정될 수 있습니다.\n파일 보관: 납품 후 3개월간 보관합니다.\n3개월 이후 데이터 백업 서버로 이동하며, 이동 후에도 링크 전달이 가능합니다.`;
  const schedule     = `촬영 예정일: ${q.shootDate || "상호 협의 후 확정"}\n촬영 당일 준비사항은 사전 협의된 촬영 가이드를 따릅니다.\n최종 납품은 사진의 경우 촬영 완료일로부터 3주 이내 전달합니다.\n영상의 경우 5~6주 이내 전달하는 것을 원칙으로 합니다.\n납품 일정은 작업 범위에 따라 상호 협의할 수 있습니다.\n보정 기간 중 천재지변 등 불가항력 사유 발생 시 일정은 상호 협의합니다.`;
  const payment      = `계약 체결 시 선금(계약금) ${fmt(q.depositAmount)}원을 납부합니다.\n잔금 ${fmt(q.balanceAmount)}원은 마지막 촬영 직후 납부합니다.\n입금 계좌: 1002-754-988962 (우리은행 / 제이크이미지연구소)\n계약금 입금 확인 후 촬영 일정이 공식 확정됩니다.\n세금계산서는 선금, 잔금 2회 모두 발행 가능합니다.\n잔금 후 통합 발행도 가능합니다.`;
  const copyright    = cfg.copyrightClause;
  const retake       = `최종 전달 이후 추가 수정 요청은 1회에 한하여 무상으로 제공합니다.\n최종 전달 이후 14일이 지난 수정 요청은 유상으로 처리합니다.\n유상 수정 기준: 프로필 보정료 50,000원/1장, 연출사진 보정료 100,000원/10장`;
  const confidential = cfg.confidentialClause;
  const dispute      = `본 계약과 관련한 분쟁은 상호 협의를 우선으로 하며,\n협의가 이루어지지 않을 경우 서울중앙지방법원을 관할 법원으로 합니다.\n본 계약서에 명시되지 않은 사항은 상관습 및 민법의 관련 규정에 따릅니다.`;
  const special      = `${q.memos ? `【메모】 ${q.memos}\n\n` : ""}본 계약서는 양 당사자가 서명(또는 날인)한 시점부터 법적 효력이 발생합니다.\n구두 합의 사항은 본 계약서에 반영된 경우에 한하여 효력을 인정합니다.\n촬영 현장에서의 안전사고에 대한 책임은 각 당사자가 부담합니다.`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<base href="${baseHref}/">
<title>${cfg.docTitle} · ${q.hospitalName}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Noto Sans KR',sans-serif;color:#1C2B28;background:#F3F8F7;
       padding:18px 0;font-size:10.8px;line-height:1.55;margin:0;}
  .contract-page{width:794px;height:1123px;margin:0 auto 18px;padding:42px 56px;
                 background:#fff;overflow:hidden;position:relative;page-break-after:always;}
  .contract-page:last-child{margin-bottom:0;page-break-after:auto;}
  .top-accent{height:6px;background:linear-gradient(90deg,${accent} 0 42%,${accent} 42% 58%,${ink} 58% 100%);
              border-radius:99px;margin-bottom:18px;}
  .header{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:28px;align-items:start;
          margin-bottom:18px;padding-bottom:14px;border-bottom:2px solid ${ink};}
  .brand-logo{width:126px;height:auto;display:block;margin-bottom:8px;}
  .brand-sub{font-size:8.8px;color:#6B8B87;margin-top:2px;line-height:1.45;white-space:nowrap;}
  .doc-title{font-size:20px;font-weight:700;color:#1C2B28;letter-spacing:.3px;text-align:right;white-space:nowrap;}
  .doc-meta{font-size:10px;color:#6B8B87;text-align:right;margin-top:6px;line-height:1.55;}
  .doc-meta strong{color:${accent};}
  .parties{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:18px;}
  .party{border-top:3px solid ${ink};padding:9px 0 0;background:#fff;}
  .party.party-client{border-top-color:${accent};}
  .party h3{font-size:10px;font-weight:700;color:${ink};letter-spacing:.02em;margin-bottom:7px;}
  .party.party-client h3{color:${accent};}
  .party .row{display:grid;grid-template-columns:62px minmax(0,1fr);gap:9px;padding:3px 0;font-size:10.4px;border-bottom:1px solid #EEF4F3;}
  .party .k{color:#6B8B87;}
  .party .v{font-weight:600;color:#1C2B28;word-break:keep-all;overflow-wrap:break-word;line-height:1.45;}
  .section{margin-bottom:13px;break-inside:avoid;}
  .section h3{font-size:10.6px;font-weight:700;color:${ink};margin-bottom:5px;
              padding-bottom:4px;border-bottom:1px solid #C8DDD9;
              display:flex;align-items:center;gap:7px;}
  .art{display:inline-block;background:${ink};color:#fff;font-size:9px;font-weight:700;
       padding:2px 7px;border-radius:10px;flex-shrink:0;}
  .section:nth-of-type(2n) .art{background:${accent};}
  .clause{border-left:3px solid ${ink};padding:2px 0 2px 11px;
          font-size:10px;line-height:1.6;color:#2C3E3D;white-space:pre-line;
          word-break:keep-all;overflow-wrap:break-word;}
  .quote-list{display:grid;gap:3px;margin-bottom:8px;}
  .quote-item{display:grid;grid-template-columns:36px minmax(0,1fr) 132px;gap:12px;align-items:start;
              padding:6px 0;border-bottom:1px solid #E4F0EE;}
  .item-index{font-size:10px;font-weight:700;color:${accent};}
  .item-main strong{display:block;font-size:10.6px;color:#1C2B28;margin-bottom:1px;word-break:keep-all;overflow-wrap:break-word;}
  .item-main span{display:block;font-size:9.2px;color:#6B8B87;line-height:1.35;word-break:keep-all;overflow-wrap:break-word;}
  .item-main em{display:inline-block;margin-top:4px;font-style:normal;font-size:9px;color:#fff;
                background:${ink};border-radius:99px;padding:1px 7px;}
  .item-amount{text-align:right;}
  .item-amount small{display:block;font-size:9px;color:#9BB5B0;margin-bottom:2px;}
  .item-amount b{font-size:10.8px;color:${ink};}
  .amount-panel{display:grid;grid-template-columns:minmax(0,1fr) 270px;gap:18px;align-items:end;
                border-top:2px solid ${ink};padding-top:8px;}
  .amount-note{font-size:9px;color:#6B8B87;line-height:1.45;word-break:keep-all;}
  .amt-row{display:flex;justify-content:space-between;padding:2px 0;font-size:9.8px;
           border-bottom:.5px solid #EEF4F3;}
  .amt-row .l{color:#6B8B87;}
  .amt-total{display:flex;justify-content:space-between;padding:5px 0;font-size:12px;
             font-weight:700;color:${ink};border-top:2px solid ${accent};margin-top:2px;}
  .pay-boxes{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:7px;}
  .pay-box{border:1px solid #C8DDD9;border-radius:7px;padding:8px;text-align:center;background:#FAFCFC;}
  .pay-box .pt{font-size:10px;color:#9BB5B0;margin-bottom:3px;}
  .pay-box .pa{font-size:14px;font-weight:700;color:${ink};}
  .pay-box:first-child .pa{color:${accent};}
  .pay-box .ps{font-size:10px;color:#9BB5B0;margin-top:2px;}
  .effect-box{background:${tint};border:1px solid ${tintBorder};border-radius:7px;
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
    <img class="brand-logo" src="${cfg.logo}" alt="${cfg.logoAlt}">
    <div class="brand-sub">${cfg.brandSub}</div>
    <div class="brand-sub">사업자번호: 190-16-00212 · 제이크이미지연구소</div>
  </div>
  <div>
    <div class="doc-title">${cfg.docTitle}</div>
    <div class="doc-meta">
      <strong>계약일: ${today}</strong><br>
      견적번호: ${q.quoteNumber || quoteNumberPrefix + new Date().toISOString().slice(0,10).replace(/-/g,"")}
    </div>
  </div>
</div>

<div class="parties">
  <div class="party party-client">
    <h3>${cfg.clientPartyTitle}</h3>
    <div class="row"><span class="k">${cfg.entityLabel}</span><span class="v">${q.hospitalName || "-"}</span></div>
    <div class="row"><span class="k">${cfg.directorLabel}</span><span class="v">${q.contactName || "-"}</span></div>
    <div class="row"><span class="k">사업자번호</span><span class="v">${q.businessNumber || "-"}</span></div>
    <div class="row"><span class="k">연락처</span><span class="v">${q.phone || "-"}</span></div>
    <div class="row"><span class="k">이메일</span><span class="v">${q.email || "-"}</span></div>
  </div>
  <div class="party">
    <h3>${cfg.companyDisplayName}</h3>
    <div class="row"><span class="k">상호</span><span class="v">${cfg.companyDisplayName}</span></div>
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
    <h4>${cfg.clientPartyTitle}</h4>
    <div class="sl"><span class="sk">${cfg.entityLabel}</span><span class="sv">${q.hospitalName || ""}</span></div>
    <div class="sl"><span class="sk">사업자번호</span><span class="sv">${q.businessNumber || ""}</span></div>
    <div class="sl"><span class="sk">${cfg.directorLabel}</span><span class="sv">${q.contactName || ""}</span></div>
    <div class="sl"><span class="sk">서명일</span><span class="sv"></span></div>
    <div class="sl"><span class="sk">서명</span><span class="sv"></span></div>
    <div class="stamp">직인 / 서명</div>
  </div>
  <div class="sign-box">
    <h4>${cfg.companyDisplayName}</h4>
    <div class="sl"><span class="sk">상호</span><span class="sv">${cfg.companyDisplayName}</span></div>
    <div class="sl"><span class="sk">사업자번호</span><span class="sv">190-16-00212</span></div>
    <div class="sl"><span class="sk">대표자</span><span class="sv">정연호</span></div>
    <div class="sl"><span class="sk">서명일</span><span class="sv">${today}</span></div>
    <div class="sl"><span class="sk">서명</span><span class="sv">${signatureHtml}</span></div>
    <div class="stamp">직인 / 서명</div>
  </div>
</div>

<div class="footer">
  ${cfg.footerTagline}<br>
  본 계약서는 양 당사자가 서명한 시점부터 법적 효력이 발생합니다.
</div>
</div>
</body>
</html>`;
}
