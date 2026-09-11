"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, MessageCircle, Share2 } from "lucide-react";
import type { MobileNavigationState } from "@/lib/olivia/mobile/navigation";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";
import MobileHeader from "./MobileHeader";
import { MobileContractDocument, MobileGenericDocument, MobileQuoteDocument } from "./MobileResourceDocument";
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
  const [busy, setBusy] = useState<"share" | "download" | null>(null);
  const paperRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      if (resource.resourceType === "quote") {
        const payload = await requestJson(`/api/quotes/${encodeURIComponent(resource.resourceId)}`);
        setData(payload.quote);
      } else if (resource.resourceType === "contract") {
        const payload = await requestJson(`/api/contracts/${encodeURIComponent(resource.resourceId)}`);
        setData(payload.data);
      } else {
        const payload = await requestJson(`/api/olivia/resources/${resource.resourceType}/${encodeURIComponent(resource.resourceId)}`);
        setData({ ...payload.data, sourceType: payload.sourceType });
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "문서를 불러오지 못했어요.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [resource.resourceId, resource.resourceType]);

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

  return (
    <section className={`${styles.screenWithHeader} ${styles.previewScreen}`} aria-label="모바일 문서 미리보기">
      <MobileHeader title="미리보기" onBack={onBack} onMore={() => void share()} />
      <div className={styles.previewScroll}>
        {error ? <div className={styles.errorState}><span>{error}</span><button type="button" onClick={() => void load()}>다시 시도</button></div> : loading ? <div className={styles.emptyState}>최신 문서를 불러오고 있어요...</div> : data ? <div ref={paperRef}>
          {resource.resourceType === "quote" ? <MobileQuoteDocument quote={data} /> : resource.resourceType === "contract" ? <MobileContractDocument contract={data} /> : <MobileGenericDocument document={data} resourceType={resource.resourceType} />}
        </div> : null}
      </div>
      {notice ? <div className={styles.previewNotice}>{notice}</div> : null}
      <div className={styles.previewActions}>
        <button type="button" onClick={() => void share()} disabled={busy !== null}><Share2 size={18} /><span>{busy === "share" ? "준비 중" : "공유"}</span></button>
        <button type="button" onClick={() => void download()} disabled={busy !== null}><Download size={18} /><span>{busy === "download" ? "생성 중" : "다운로드"}</span></button>
        <button type="button" className={styles.previewEdit} onClick={requestEdit}><MessageCircle size={18} /><span>수정 요청</span></button>
      </div>
    </section>
  );
}
