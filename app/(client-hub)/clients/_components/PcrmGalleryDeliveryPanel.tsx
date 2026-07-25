"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, Images, Send } from "lucide-react";

export default function PcrmGalleryDeliveryPanel({ clientId, workflowRunId }: { clientId: string; workflowRunId: string }) {
  const [data, setData] = useState<any>({ selectGalleries: [], photoGalleries: [], publications: [], selections: [], annotations: [], confirmations: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [replies, setReplies] = useState<Record<string, string>>({});
  const query = `clientId=${encodeURIComponent(clientId)}&workflowRunId=${encodeURIComponent(workflowRunId)}`;
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/pcrm/gallery-delivery?${query}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "갤러리 업무를 불러오지 못했습니다.");
      setData(payload);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "갤러리 업무를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [query]);
  useEffect(() => { void load(); }, [load]);

  const publicationByKey = useMemo(() => new Map(data.publications.map((item: any) => [`${item.related_type}:${item.related_id}`, item])), [data.publications]);
  const publish = async (relatedType: "select_gallery" | "gallery" | "final_delivery", resource: any) => {
    if (busy) return;
    setBusy(`${relatedType}:${resource.id}`);
    setMessage("");
    try {
      const response = await fetch("/api/admin/pcrm/publications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientId,
          workflowRunId,
          relatedType,
          relatedId: resource.id,
          title: relatedType === "select_gallery" ? resource.title || "사진 셀렉" : relatedType === "final_delivery" ? "최종 납품" : "보정본 확인",
          description: resource.description || "",
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "고객에게 공개하지 못했습니다.");
      setMessage("고객 PCRM에 공개했습니다.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "고객에게 공개하지 못했습니다.");
    } finally {
      setBusy("");
    }
  };
  const updateAnnotation = async (annotation: any, status: "in_progress" | "resolved") => {
    setBusy(annotation.id);
    try {
      const response = await fetch("/api/admin/pcrm/gallery-delivery", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, workflowRunId, annotationId: annotation.id, status, adminReply: replies[annotation.id] ?? annotation.admin_reply ?? "" }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "처리 상태를 저장하지 못했습니다.");
      setReplies((current) => ({ ...current, [annotation.id]: "" }));
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "처리 상태를 저장하지 못했습니다.");
    } finally {
      setBusy("");
    }
  };

  if (loading) return <div className="pcrm-admin-empty">갤러리 업무를 불러오는 중입니다.</div>;
  const latestSelection = data.selections[0];
  const approvedDelivery = data.confirmations.find((item: any) => item.approved_at);
  return (
    <div className="pcrm-admin-gallery-delivery">
      <div className="pcrm-admin-gallery-summary">
        <article><span>최근 셀렉</span><strong>{latestSelection?.selected_count ?? 0}장</strong><small>{latestSelection ? new Date(latestSelection.submitted_at).toLocaleString("ko-KR") : "제출 전"}</small></article>
        <article><span>수정 위치</span><strong>{data.annotations.filter((item: any) => item.status !== "resolved").length}건</strong><small>처리할 표시</small></article>
        <article><span>최종 납품</span><strong>{approvedDelivery ? "승인" : "대기"}</strong><small>{approvedDelivery?.approved_at ? new Date(approvedDelivery.approved_at).toLocaleString("ko-KR") : "고객 최종 확인 전"}</small></article>
      </div>
      {message ? <p className="pcrm-admin-message">{message}</p> : null}
      <section>
        <header><div><Images size={15} /><strong>셀렉 갤러리</strong></div><span>고객이 PCRM 안에서 선택합니다.</span></header>
        {data.selectGalleries.length ? data.selectGalleries.map((gallery: any) => {
          const publication = publicationByKey.get(`select_gallery:${gallery.id}`) as any;
          return <article key={gallery.id} className="pcrm-admin-collaboration-row"><div><strong>{gallery.title}</strong><span>{gallery.total_jpg_count}장 · 현재 {gallery.selected_count}장 선택</span></div><p>{publication ? `고객 공개 · ${publication.status}` : "고객에게 공개되지 않았습니다."}</p><div className="pcrm-admin-row-actions"><button type="button" className="is-primary" disabled={busy === `select_gallery:${gallery.id}`} onClick={() => void publish("select_gallery", gallery)}>{publication ? "다시 공개" : "고객 공개"}</button></div></article>;
        }) : <div className="pcrm-admin-empty">연결된 셀렉 갤러리가 없습니다. 사진작업실에서 먼저 생성해주세요.</div>}
      </section>
      <section>
        <header><div><ExternalLink size={15} /><strong>보정본·최종 납품</strong></div><span>같은 갤러리를 확인용 또는 최종본으로 구분해 공개합니다.</span></header>
        {data.photoGalleries.length ? data.photoGalleries.map((gallery: any) => {
          const reviewPublication = publicationByKey.get(`gallery:${gallery.id}`) as any;
          const finalPublication = publicationByKey.get(`final_delivery:${gallery.id}`) as any;
          return <article key={gallery.id} className="pcrm-admin-collaboration-row"><div><strong>{gallery.description || gallery.hospital_name || "촬영 갤러리"}</strong><span>{gallery.gallery_type || "retouched"} · 미리보기 {gallery.items?.length ?? 0}개</span></div><p>{finalPublication ? `최종 납품 ${finalPublication.status}` : reviewPublication ? `보정 확인 ${reviewPublication.status}` : "고객에게 공개되지 않았습니다."}</p><div className="pcrm-admin-row-actions"><button type="button" disabled={busy === `gallery:${gallery.id}`} onClick={() => void publish("gallery", gallery)}>보정본 공개</button><button type="button" className="is-primary" disabled={busy === `final_delivery:${gallery.id}`} onClick={() => void publish("final_delivery", gallery)}>최종본 공개</button></div></article>;
        }) : <div className="pcrm-admin-empty">연결된 보정 또는 납품 갤러리가 없습니다.</div>}
      </section>
      <section>
        <header><div><Send size={15} /><strong>사진별 수정 요청</strong></div><span>고객이 사진 위에 표시한 위치와 요청 내용입니다.</span></header>
        {data.annotations.length ? data.annotations.map((annotation: any) => (
          <article key={annotation.id} className="pcrm-admin-feedback">
            <header><div><span>표시 {annotation.marker_number}</span><strong>{annotation.content}</strong></div><b className={`is-${annotation.status}`}>{annotation.status === "resolved" ? "해결" : annotation.status === "in_progress" ? "작업 중" : "확인 필요"}</b></header>
            <footer><textarea value={replies[annotation.id] ?? annotation.admin_reply ?? ""} maxLength={2000} placeholder="고객에게 전달할 답변" onChange={(event) => setReplies((current) => ({ ...current, [annotation.id]: event.target.value }))} /><button type="button" disabled={busy === annotation.id} onClick={() => void updateAnnotation(annotation, annotation.status === "resolved" ? "in_progress" : "resolved")}><CheckCircle2 size={13} />{annotation.status === "resolved" ? "다시 열기" : "답변·해결"}</button></footer>
          </article>
        )) : <div className="pcrm-admin-empty">고객이 제출한 사진 수정 요청이 없습니다.</div>}
      </section>
    </div>
  );
}
