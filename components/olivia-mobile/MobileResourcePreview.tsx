"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, MessageCircle, Share2, UserPlus } from "lucide-react";
import type { MobileNavigationState } from "@/lib/olivia/mobile/navigation";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import MobileHeader from "./MobileHeader";
import { MobileGenericDocument } from "./MobileResourceDocument";
import { MobileCanonicalContractDocument, MobileCanonicalQuoteDocument } from "./MobileCanonicalDocuments";
import styles from "./OliviaMobileShell.module.css";

type PreviewNavigation = Extract<MobileNavigationState, { view: "preview" }>;
type ResourceRow = Record<string, unknown>;

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || "문서를 불러오지 못했어요.");
  return payload;
}

export default function MobileResourcePreview({
  resource,
  onBack,
  onRequestEdit,
}: {
  resource: PreviewNavigation;
  onBack: () => void;
  onRequestEdit: () => void;
}) {
  const [data, setData] = useState<ResourceRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"share" | "download" | "approve" | "register" | null>(null);
  const [temporaryDocument, setTemporaryDocument] = useState<ResourceRow | null>(null);
  const [registrationDismissed, setRegistrationDismissed] = useState(false);
  const paperRef = useRef<HTMLDivElement>(null);
  const contractFrameRef = useRef<HTMLIFrameElement>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      let resourceRequest: Promise<ResourceRow>;
      if (resource.resourceType === "quote") {
        resourceRequest = requestJson(`/api/quotes/${encodeURIComponent(resource.resourceId)}`).then((payload) => payload.quote as ResourceRow);
      } else if (resource.resourceType === "contract") {
        resourceRequest = requestJson(`/api/contracts/${encodeURIComponent(resource.resourceId)}`).then((payload) => payload.data as ResourceRow);
      } else {
        resourceRequest = requestJson(`/api/olivia/resources/${resource.resourceType}/${encodeURIComponent(resource.resourceId)}`)
          .then((payload) => ({ ...payload.data, sourceType: payload.sourceType } as ResourceRow));
      }
      const temporaryRequest = resource.temporaryDocumentId
        ? requestJson(`/api/temporary-documents/${encodeURIComponent(resource.temporaryDocumentId)}`)
          .then((payload) => payload.document as ResourceRow)
          .catch(() => null)
        : Promise.resolve(null);
      const [nextData, nextTemporaryDocument] = await Promise.all([resourceRequest, temporaryRequest]);
      setData(nextData);
      setTemporaryDocument(nextTemporaryDocument);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "문서를 불러오지 못했어요.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [resource.resourceId, resource.resourceType, resource.temporaryDocumentId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => void load(true), 4000);
    const refresh = () => void load(true);
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("olivia-resource-updated", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("olivia-resource-updated", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [load]);

  useEffect(() => setRegistrationDismissed(false), [resource.temporaryDocumentId]);

  const share = async () => {
    setBusy("share");
    setNotice("");
    try {
      const payload = resource.temporaryDocumentId
        ? await requestJson(`/api/temporary-documents/${encodeURIComponent(resource.temporaryDocumentId)}/share`, { method: "POST" })
        : await requestJson(`/api/olivia/resources/${resource.resourceType}/${encodeURIComponent(resource.resourceId)}/share`, { method: "POST" });
      if (navigator.share) await navigator.share({ title: "Olivia 문서 미리보기", url: payload.url });
      else {
        await navigator.clipboard.writeText(payload.url);
        setNotice("7일 미리보기 링크를 복사했어요.");
      }
    } catch (shareError) {
      if ((shareError as Error)?.name !== "AbortError") setNotice(shareError instanceof Error ? shareError.message : "공유하지 못했어요.");
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    setBusy("download");
    setNotice("");
    try {
      if (resource.resourceType === "quote") {
        const payload = await requestJson(`/api/quotes/${encodeURIComponent(resource.resourceId)}/render`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ format: "pdf" }),
        });
        const anchor = document.createElement("a");
        anchor.href = payload.url;
        anchor.download = "견적서.pdf";
        anchor.click();
      } else if (resource.resourceType === "contract" && contractFrameRef.current?.contentDocument) {
        const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
        const frameDocument = contractFrameRef.current.contentDocument;
        if (frameDocument.fonts?.ready) await frameDocument.fonts.ready;
        await Promise.all(Array.from(frameDocument.images).map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => {
          image.onload = () => resolve();
          image.onerror = () => resolve();
        })));
        const pages = Array.from(frameDocument.querySelectorAll<HTMLElement>(".contract-page"));
        if (!pages.length) throw new Error("계약서 페이지를 찾지 못했어요.");
        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
        for (const [index, page] of pages.entries()) {
          const rect = page.getBoundingClientRect();
          const canvas = await html2canvas(page, {
            scale: 2, backgroundColor: "#ffffff", useCORS: true, allowTaint: false, logging: false,
            width: Math.ceil(rect.width), height: Math.ceil(rect.height), windowWidth: Math.ceil(rect.width), windowHeight: Math.ceil(rect.height),
            scrollX: 0, scrollY: 0,
          });
          if (index > 0) pdf.addPage();
          pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 210, 297);
        }
        pdf.save("Olivia_계약서.pdf");
      } else if (paperRef.current) {
        const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
        const canvas = await html2canvas(paperRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
        const width = 190;
        const height = canvas.height * width / canvas.width;
        const image = canvas.toDataURL("image/jpeg", .92);
        const pageHeight = 277;
        let offset = 10;
        pdf.addImage(image, "JPEG", 10, offset, width, height);
        for (let remaining = height - pageHeight; remaining > 0; remaining -= pageHeight) {
          pdf.addPage();
          offset = 10 - (height - remaining);
          pdf.addImage(image, "JPEG", 10, offset, width, height);
        }
        pdf.save("Olivia_문서.pdf");
      }
    } catch (downloadError) {
      setNotice(downloadError instanceof Error ? downloadError.message : "다운로드하지 못했어요.");
    } finally {
      setBusy(null);
    }
  };

  const requestEdit = () => {
    const workspace = resource.resourceType === "storyboard" ? "conti" : resource.resourceType;
    useOliviaContextStore.getState().setWorkspace(workspace, resource.resourceId);
    useOliviaContextStore.getState().setCurrentDocument(resource.resourceId, workspace, String(data?.title || data?.hospital_name || "현재 문서"));
    onRequestEdit();
  };

  const approve = async () => {
    const temporaryDocumentId = resource.temporaryDocumentId;
    if (!temporaryDocumentId) {
      setNotice("고객등록 대기 문서에서 승인할 수 있어요.");
      return;
    }
    if (temporaryDocument?.status === "pending_client") {
      setRegistrationDismissed(false);
      return;
    }
    setBusy("approve");
    setNotice("");
    try {
      const payload = await requestJson(`/api/temporary-documents/${encodeURIComponent(temporaryDocumentId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve_content" }),
      });
      setTemporaryDocument(payload.document as ResourceRow);
      setRegistrationDismissed(false);
      setNotice(payload.message || "고객 확인을 승인했어요.");
      window.dispatchEvent(new CustomEvent("olivia-resource-updated"));
    } catch (approvalError) {
      setNotice(approvalError instanceof Error ? approvalError.message : "승인하지 못했어요.");
    } finally {
      setBusy(null);
    }
  };

  const registerClient = async () => {
    const temporaryDocumentId = resource.temporaryDocumentId;
    if (!temporaryDocumentId || busy) return;
    setBusy("register");
    setNotice("");
    try {
      const payload = await requestJson(`/api/temporary-documents/${encodeURIComponent(temporaryDocumentId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "link_client" }),
      });
      setTemporaryDocument((current) => current ? { ...current, status: "linked" } : current);
      setRegistrationDismissed(true);
      setNotice(payload.message || "고객등록과 문서 연결을 완료했어요.");
      window.dispatchEvent(new CustomEvent("olivia-resource-updated"));
      void load(true);
    } catch (registrationError) {
      setNotice(registrationError instanceof Error ? registrationError.message : "고객을 등록하지 못했어요.");
    } finally {
      setBusy(null);
    }
  };

  const temporaryStatus = String(temporaryDocument?.status || "");
  const registrationPending = temporaryStatus === "pending_client";
  const registrationComplete = temporaryStatus === "linked";
  const approvalLabel = registrationComplete ? "등록 완료" : registrationPending ? "고객 등록" : busy === "approve" ? "승인 중" : "승인";

  return (
    <section className={`${styles.screenWithHeader} ${styles.previewScreen}`} aria-label="모바일 문서 미리보기">
      <MobileHeader title="미리보기" subtitle="현재 문서의 최신 내용을 확인하세요." onBack={onBack} onMore={() => void share()} />
      <div className={styles.previewScroll}>
        {error ? <div className={styles.errorState}><span>{error}</span><button type="button" onClick={() => void load()}>다시 시도</button></div> : loading ? <div className={styles.emptyState}>최신 문서를 불러오고 있어요...</div> : data ? <div ref={paperRef}>
          {resource.resourceType === "quote" ? <MobileCanonicalQuoteDocument quote={data} /> : resource.resourceType === "contract" ? <MobileCanonicalContractDocument contract={data} frameRef={contractFrameRef} /> : <MobileGenericDocument document={data} resourceType={resource.resourceType} />}
        </div> : null}
      </div>
      {notice ? <div className={styles.previewNotice}>{notice}</div> : null}
      {registrationPending && !registrationDismissed ? (
        <div className={styles.previewApprovalPrompt} role="dialog" aria-modal="false" aria-label="고객등록 확인">
          <span><UserPlus size={18} /></span>
          <div><strong>{String(temporaryDocument?.hospital_name || data?.hospital_name || "이 병원")}을 고객으로 등록할까요?</strong><small>승인한 문서와 같은 병원 자료도 함께 연결됩니다.</small></div>
          <button type="button" onClick={() => setRegistrationDismissed(true)} disabled={busy !== null}>나중에</button>
          <button type="button" className={styles.previewRegister} onClick={() => void registerClient()} disabled={busy !== null}>{busy === "register" ? "등록 중" : "고객 등록"}</button>
        </div>
      ) : null}
      <div className={styles.previewActions}>
        <button type="button" onClick={() => void share()} disabled={busy !== null}><Share2 size={18} /><span>{busy === "share" ? "준비 중" : "공유"}</span></button>
        <button type="button" onClick={() => void download()} disabled={busy !== null}><Download size={18} /><span>{busy === "download" ? "생성 중" : "다운로드"}</span></button>
        <button type="button" className={styles.previewEdit} onClick={requestEdit} disabled={busy !== null}><MessageCircle size={18} /><span>수정 요청</span></button>
        <button type="button" className={styles.previewApprove} onClick={() => void approve()} disabled={busy !== null || !resource.temporaryDocumentId || registrationComplete} title={!resource.temporaryDocumentId ? "고객등록 대기 문서에서 사용할 수 있어요." : undefined}><CheckCircle2 size={18} /><span>{approvalLabel}</span></button>
      </div>
    </section>
  );
}
