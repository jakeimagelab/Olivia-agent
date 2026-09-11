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
import {
  buildContractHtml,
  CONTRACT_BRAND_CONFIG,
  normalizeContractQuoteData,
  type ContractBrand,
  type ContractQuoteData as QuoteData,
} from "@/lib/contract/contractDocument";

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
  const setOliviaCurrentDocument = useOliviaContextStore((state) => state.setCurrentDocument);
  const setOliviaPageContext = useOliviaContextStore((state) => state.setPageContext);
  useEffect(() => {
    if (modalWorkflowRunId) setOliviaProject(modalWorkflowRunId);
  }, [modalWorkflowRunId, setOliviaProject]);

  const contractDocumentId = resourceId || contractId || undefined;
  useEffect(() => {
    const current = useOliviaContextStore.getState();
    if (current.activeWorkspace !== "contract" || current.activeResourceId !== contractDocumentId) {
      setOliviaWorkspace("contract", contractDocumentId);
    }
    return () => {
      const latest = useOliviaContextStore.getState();
      if (latest.activeWorkspace === "contract" && latest.activeResourceId === contractDocumentId) {
        latest.setWorkspace(undefined, undefined);
      }
    };
  }, [contractDocumentId, setOliviaWorkspace]);

  useEffect(() => {
    setOliviaCurrentDocument(contractDocumentId, "contract", quote?.hospitalName ? `${quote.hospitalName} 계약서` : "계약서");
    setOliviaPageContext({
      pageMode: contractDocumentId ? "edit" : "create",
      capabilities: ["contract.edit", "contract.sign", "contract.publish", "contract.download_pdf"],
      documentStatus: publishState === "done" ? "published" : "draft",
      brand,
      canEdit: publishState !== "done",
      canFinalize: Boolean(quote) && publishState !== "done",
    });
  }, [brand, contractDocumentId, publishState, quote, setOliviaCurrentDocument, setOliviaPageContext]);

  useEffect(() => {
    setOliviaCurrentDocumentTotal(quote?.totalAmount, dirty);
    return () => setOliviaCurrentDocumentTotal(undefined, undefined);
  }, [quote?.totalAmount, dirty, setOliviaCurrentDocumentTotal]);

  useEffect(() => {
    if (!isModal) return;
    // resourceId(기존 계약서)가 있으면 그대로 불러오고, 없으면 그 고객의 저장된 견적서를
    // 찾아 계약서 초안의 기초 데이터로 쓴다(계약서는 견적 데이터를 그대로 이어받는 문서라
    // 견적서가 아직 없으면 고객 기본 정보만으로 빈 계약서를 시작한다).
    if (resourceId) {
      const loadContract = () => {
        setError("");
        return fetch(`/api/contracts/${resourceId}`)
        .then(async (r) => {
          const json = await r.json().catch(() => null);
          if (!r.ok || !json?.ok) throw new Error(json?.error || `HTTP ${r.status}`);
          return json;
        })
        .then((json) => {
          const contract = json.data as Record<string, unknown>;
          const loadedQuote = normalizeContractQuoteData(contract.quote_data, contract);
          if (!loadedQuote) throw new Error("저장된 계약서에 견적 정보가 없습니다.");
          setContractId(resourceId);
          // deposit_rate/payment_terms/delivery_terms/special_terms는 quote_data(jsonb) 안이
          // 아니라 contracts 테이블의 별도 컬럼이라 매번 병합해서 넣는다(채팅 update_contract_terms
          // 도구가 이 컬럼들만 patch하므로, quote_data 자체는 안 건드려도 최신 상태로 보인다).
          setQuote(loadedQuote);
          setSignatureDataUrl(String(contract.signature_data_url ?? ""));
          lastSavedSnapshotRef.current = JSON.stringify({ quote: loadedQuote, signatureDataUrl: String(contract.signature_data_url ?? "") });
        })
        .catch((loadError) => {
          console.error("contract load failed", loadError);
          setError("계약서 정보를 불러올 수 없습니다. 잠시 후 다시 시도해주세요.");
        });
      };
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

  // onResult는 선택 인자다 — 사람이 누르는 다운로드 버튼은 그대로 두고, Agent가 채팅으로
  // 트리거할 때만(useContractPdfHandlerStore.pdfHandler, 아래 등록 effect) 실제 성공/실패를
  // 알려준다. QuoteBuilder.tsx의 downloadPdf(onResult?) 확장과 동일한 패턴(PHASE 2).
  const downloadPdf = async (onResult?: (result: { success: boolean; error?: string }) => void) => {
    if (!contractHtml || !quote) {
      onResult?.({ success: false, error: "계약서 화면을 찾지 못했어요." });
      return;
    }
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
      onResult?.({ success: true });
    } catch (e: any) {
      setError(e.message || "PDF 생성에 실패했습니다.");
      onResult?.({ success: false, error: e.message || "PDF 생성에 실패했습니다." });
    } finally {
      setPdfGenerating(false);
    }
  };

  // downloadPdf는 렌더마다 새로 만들어지는 클로저라 등록 effect는 마운트 시 한 번만 실행하고,
  // 최신 함수는 ref로 갱신한다(QuoteBuilder.tsx와 동일한 advanced-use-latest 패턴).
  const downloadPdfRef = useRef(downloadPdf);
  useEffect(() => {
    downloadPdfRef.current = downloadPdf;
  });
  useEffect(() => {
    const handler = () =>
      new Promise<{ success: boolean; error?: string }>((resolve) => {
        void downloadPdfRef.current((result) => resolve(result));
      });
    useContractPdfHandlerStore.getState().registerPdfHandler(handler);
    return () => {
      if (useContractPdfHandlerStore.getState().pdfHandler === handler) useContractPdfHandlerStore.getState().registerPdfHandler(null);
    };
  }, []);

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

  // depositRate가 채팅으로 바뀌었으면(update_contract_terms) 그 비율로, 아니면 견적에서
  // 물려받은 금액을 그대로 쓴다 — buildContractHtml()의 같은 계산과 동일한 원칙.
  const effectiveDepositRate = quote.depositRate ?? Math.round(((quote.depositAmount || 0) / (quote.totalAmount || 1)) * 100);
  const { depositAmount: effectiveDeposit, balanceAmount: effectiveBalance } = quote.depositRate != null
    ? computeContractDeposit(quote.totalAmount, quote.depositRate)
    : { depositAmount: quote.depositAmount, balanceAmount: quote.balanceAmount };

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
                <div style={{ fontSize: 9, opacity: .7, marginBottom: 2 }}>선금 ({effectiveDepositRate}%)</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{fmt(effectiveDeposit)}원</div>
              </div>
              <div style={{ background: "rgba(255,255,255,.12)", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ fontSize: 9, opacity: .7, marginBottom: 2 }}>잔금 ({100 - effectiveDepositRate}%)</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{fmt(effectiveBalance)}원</div>
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
              <button onClick={() => void downloadPdf()} disabled={pdfGenerating}
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
