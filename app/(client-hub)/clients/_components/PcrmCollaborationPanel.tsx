"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, FileCheck2, MessageSquareText, Send, Video } from "lucide-react";
import { C } from "@/lib/theme";

type Tab = "documents" | "preparation" | "conti" | "inquiries";

export default function PcrmCollaborationPanel({
  clientId,
  workflowRunId,
  managerName,
}: {
  clientId: string;
  workflowRunId: string;
  managerName?: string;
}) {
  const [tab, setTab] = useState<Tab>("documents");
  const [publications, setPublications] = useState<any[]>([]);
  const [preparation, setPreparation] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<any[]>([]);
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [replies, setReplies] = useState<Record<string, string>>({});

  const query = `clientId=${encodeURIComponent(clientId)}&workflowRunId=${encodeURIComponent(workflowRunId)}`;
  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const [publicationResponse, prepResponse, feedbackResponse, inquiryResponse] = await Promise.all([
        fetch(`/api/admin/pcrm/publications?${query}`).then((response) => response.json()),
        fetch(`/api/admin/pcrm/preparation?${query}`).then((response) => response.json()),
        fetch(`/api/admin/pcrm/conti-feedback?${query}`).then((response) => response.json()),
        fetch(`/api/admin/pcrm/inquiries?${query}`).then((response) => response.json()),
      ]);
      if (publicationResponse.ok) setPublications(publicationResponse.publications ?? []);
      if (prepResponse.ok) setPreparation(prepResponse.items ?? []);
      if (feedbackResponse.ok) setFeedback(feedbackResponse.feedback ?? []);
      if (inquiryResponse.ok) setInquiries(inquiryResponse.inquiries ?? []);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { void load(); }, [load]);

  const initializePreparation = async () => {
    if (busy) return;
    setBusy("initialize");
    try {
      const response = await fetch("/api/admin/pcrm/preparation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, workflowRunId }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "준비 항목을 만들지 못했습니다.");
      setMessage("기본 촬영 준비 항목을 고객 포털에 열었습니다.");
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "준비 항목을 만들지 못했습니다.");
    } finally {
      setBusy("");
    }
  };

  const updatePreparation = async (item: any, action: "confirm" | "request_revision") => {
    if (busy) return;
    setBusy(item.id);
    try {
      const response = await fetch("/api/admin/pcrm/preparation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, workflowRunId, id: item.id, action, confirmedBy: managerName }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "상태를 변경하지 못했습니다.");
      setPreparation((current) => current.map((entry) => entry.id === item.id ? payload.item : entry));
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "상태를 변경하지 못했습니다.");
    } finally {
      setBusy("");
    }
  };

  const replyConti = async (item: any, resolve: boolean) => {
    if (busy) return;
    setBusy(item.id);
    try {
      const response = await fetch("/api/admin/pcrm/conti-feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId, workflowRunId, id: item.id, reply: replies[item.id] ?? item.admin_reply ?? "", resolve,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "답변을 저장하지 못했습니다.");
      setFeedback((current) => current.map((entry) => entry.id === item.id ? payload.feedback : entry));
      setReplies((current) => ({ ...current, [item.id]: "" }));
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "답변을 저장하지 못했습니다.");
    } finally {
      setBusy("");
    }
  };

  const replyInquiry = async (inquiry: any) => {
    const content = replies[inquiry.id] ?? "";
    if (!content.trim() || busy) return;
    setBusy(inquiry.id);
    try {
      const response = await fetch("/api/admin/pcrm/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, workflowRunId, inquiryId: inquiry.id, content, authorName: managerName }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "답변을 보내지 못했습니다.");
      setReplies((current) => ({ ...current, [inquiry.id]: "" }));
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "답변을 보내지 못했습니다.");
    } finally {
      setBusy("");
    }
  };

  const republish = async (publication: any) => {
    if (busy) return;
    setBusy(publication.id);
    try {
      const response = await fetch("/api/admin/pcrm/publications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: publication.id, action: "publish" }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "자료를 다시 공개하지 못했습니다.");
      setPublications((current) => current.map((item) => item.id === publication.id ? payload.publication : item));
      setMessage("수정된 자료를 고객에게 다시 공개했습니다.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "자료를 다시 공개하지 못했습니다.");
    } finally {
      setBusy("");
    }
  };

  const tabs = [
    { key: "documents" as const, label: "문서 확인", Icon: FileCheck2, count: publications.filter((item) => item.status === "revision_requested").length },
    { key: "preparation" as const, label: "촬영 준비", Icon: ClipboardList, count: preparation.filter((item) => item.status === "submitted").length },
    { key: "conti" as const, label: "콘티 피드백", Icon: Video, count: feedback.filter((item) => item.status !== "resolved" && item.status !== "approved").length },
    { key: "inquiries" as const, label: "고객 문의", Icon: MessageSquareText, count: inquiries.filter((item) => item.status === "open").length },
  ];

  return (
    <section className="pcrm-admin-collaboration">
      <header>
        <div><span>PCRM · COLLABORATION</span><h2>고객 확인과 피드백</h2><p>고객 포털에서 제출된 준비 정보, 콘티 의견과 문의를 처리합니다.</p></div>
        <nav>{tabs.map(({ key, label, Icon, count }) => (
          <button type="button" key={key} className={tab === key ? "is-active" : ""} onClick={() => setTab(key)}>
            <Icon size={14} />{label}{count > 0 && <b>{count}</b>}
          </button>
        ))}</nav>
      </header>
      {message && <p className="pcrm-admin-message">{message}</p>}
      {loading ? <div className="pcrm-admin-empty">협업 내역을 불러오는 중입니다.</div> : (
        <div className="pcrm-admin-collaboration-body">
          {tab === "documents" && (
            publications.length === 0 ? <div className="pcrm-admin-empty">고객에게 공개한 프로젝트 자료가 없습니다.</div> : publications.map((item) => (
              <article key={item.id} className="pcrm-admin-collaboration-row">
                <div><strong>{item.title}</strong><span>{item.related_type}</span></div>
                <p>{item.feedback || (item.status === "approved" ? "고객 승인이 완료되었습니다." : item.status === "viewed" ? "고객이 자료를 열람했습니다." : "고객 확인을 기다리고 있습니다.")}</p>
                <div className="pcrm-admin-row-actions">
                  <b className={`pcrm-admin-status is-${item.status}`}>{item.status === "revision_requested" ? "수정 요청" : item.status === "approved" ? "승인 완료" : item.status === "viewed" ? "열람" : item.status === "published" ? "공개" : item.status}</b>
                  {item.status === "revision_requested" && <button type="button" className="is-primary" disabled={busy === item.id} onClick={() => void republish(item)}>수정본 다시 공개</button>}
                </div>
              </article>
            ))
          )}
          {tab === "preparation" && (
            preparation.length === 0 ? (
              <div className="pcrm-admin-empty"><ClipboardList size={24} /><strong>촬영 준비 항목을 설정해 주세요.</strong><span>기본 8개 항목을 만든 뒤 고객이 입력할 수 있습니다.</span><button type="button" disabled={busy === "initialize"} onClick={() => void initializePreparation()}>{busy ? "생성 중" : "기본 항목 열기"}</button></div>
            ) : preparation.map((item) => (
              <article key={item.id} className="pcrm-admin-collaboration-row">
                <div><strong>{item.title}{item.is_required && <i>필수</i>}</strong><span>{item.status === "confirmed" ? "확인 완료" : item.status === "submitted" ? "고객 제출" : item.status === "revision_requested" ? "보완 요청" : "작성 중"}</span></div>
                <p>{String(item.value?.value ?? "아직 입력되지 않았습니다.")}</p>
                <div className="pcrm-admin-row-actions">
                  <button type="button" disabled={busy === item.id || item.status !== "submitted"} onClick={() => void updatePreparation(item, "request_revision")}>보완 요청</button>
                  <button type="button" className="is-primary" disabled={busy === item.id || item.status !== "submitted"} onClick={() => void updatePreparation(item, "confirm")}><CheckCircle2 size={13} /> 확인</button>
                </div>
              </article>
            ))
          )}
          {tab === "conti" && (
            feedback.length === 0 ? <div className="pcrm-admin-empty">고객이 남긴 콘티 피드백이 없습니다.</div> : feedback.map((item) => (
              <article key={item.id} className="pcrm-admin-feedback">
                <header><div><span>장면 {item.scene_index + 1}</span><strong>{item.scene_title}</strong></div><b className={`is-${item.status}`}>{item.status === "revision_requested" ? "수정 요청" : item.status === "approved" ? "승인" : item.status === "resolved" ? "해결" : "의견"}</b></header>
                {item.feedback && <p>{item.feedback}</p>}
                {item.admin_reply && <blockquote>{item.admin_reply}</blockquote>}
                {item.status !== "approved" && item.status !== "resolved" && <footer><textarea value={replies[item.id] ?? item.admin_reply ?? ""} maxLength={2000} placeholder="고객에게 전달할 답변" onChange={(event) => setReplies((current) => ({ ...current, [item.id]: event.target.value }))} /><button type="button" disabled={busy === item.id} onClick={() => void replyConti(item, true)}>답변·해결</button></footer>}
              </article>
            ))
          )}
          {tab === "inquiries" && (
            inquiries.length === 0 ? <div className="pcrm-admin-empty">고객 문의가 없습니다.</div> : inquiries.map((inquiry) => (
              <article key={inquiry.id} className="pcrm-admin-inquiry">
                <header><div><span>{inquiry.category}</span><strong>{inquiry.title}</strong></div><b className={`is-${inquiry.status}`}>{inquiry.status === "answered" ? "답변 완료" : inquiry.status === "closed" ? "종료" : "답변 필요"}</b></header>
                <div>{(inquiry.messages ?? []).map((entry: any) => <p key={entry.id} className={entry.author_type === "admin" ? "is-admin" : ""}><strong>{entry.author_type === "admin" ? entry.author_name || "담당자" : "고객"}</strong>{entry.content}{(entry.attachments ?? []).map((attachment: any) => attachment.downloadUrl && <a key={attachment.id} href={attachment.downloadUrl} target="_blank" rel="noreferrer">첨부 · {attachment.file_name}</a>)}</p>)}</div>
                {inquiry.status !== "closed" && <footer><textarea value={replies[inquiry.id] ?? ""} maxLength={5000} placeholder="답변을 입력하세요." onChange={(event) => setReplies((current) => ({ ...current, [inquiry.id]: event.target.value }))} /><button type="button" disabled={busy === inquiry.id || !(replies[inquiry.id] ?? "").trim()} onClick={() => void replyInquiry(inquiry)}><Send size={13} /> 답변</button></footer>}
              </article>
            ))
          )}
        </div>
      )}
    </section>
  );
}
