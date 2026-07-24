"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquareText, Paperclip, Send } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { PortalCard, PortalError, PortalLoading, PortalPageShell } from "../_components/PortalShell";
import { usePortalSession } from "../_hooks/usePortalSession";

const CATEGORIES = [
  ["schedule", "일정"], ["quote", "견적"], ["contract", "계약"], ["preparation", "촬영 준비"],
  ["conti", "콘티"], ["gallery", "갤러리"], ["revision", "수정"], ["delivery", "납품"], ["other", "기타"],
];

export default function PortalInquiriesPage() {
  const { session, token, loading, error } = usePortalSession();
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [form, setForm] = useState({ category: "other", title: "", content: "" });
  const [reply, setReply] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setDataLoading(true);
    try {
      const response = await fetch("/api/client-portal/inquiries", { headers: { "x-portal-token": token } });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "문의 내역을 불러오지 못했습니다.");
      setInquiries(payload.inquiries ?? []);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "문의 내역을 불러오지 못했습니다.");
    } finally {
      setDataLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const uploadFiles = async (messageId: string, selected: File[]) => {
    for (const file of selected) {
      const sessionResponse = await fetch("/api/client-portal/attachments/upload-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-portal-token": token },
        body: JSON.stringify({
          entityType: "inquiry_message",
          entityId: messageId,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          fileSize: file.size,
        }),
      });
      const uploadSession = await sessionResponse.json();
      if (!sessionResponse.ok || !uploadSession.ok) throw new Error(uploadSession.error || "파일 업로드를 시작하지 못했습니다.");
      const { error: uploadError } = await getSupabase().storage.from(uploadSession.bucket)
        .uploadToSignedUrl(uploadSession.storagePath, uploadSession.token, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
      if (uploadError) throw uploadError;
      const registerResponse = await fetch("/api/client-portal/attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-portal-token": token },
        body: JSON.stringify({
          entityType: "inquiry_message",
          entityId: messageId,
          storagePath: uploadSession.storagePath,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        }),
      });
      const registered = await registerResponse.json();
      if (!registerResponse.ok || !registered.ok) throw new Error(registered.error || "파일 정보를 등록하지 못했습니다.");
    }
  };

  const send = async (inquiryId?: string) => {
    if (busy) return;
    const isReply = Boolean(inquiryId);
    setBusy(inquiryId || "new");
    setMessage("");
    try {
      const response = await fetch("/api/client-portal/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-portal-token": token },
        body: JSON.stringify(isReply
          ? { inquiryId, content: reply[inquiryId!] ?? "" }
          : { ...form }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "문의를 보내지 못했습니다.");
      if (!isReply && files.length) await uploadFiles(payload.message.id, files);
      setForm({ category: "other", title: "", content: "" });
      setReply((current) => inquiryId ? { ...current, [inquiryId]: "" } : current);
      setFiles([]);
      setMessage("담당자에게 문의를 전달했습니다.");
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "문의를 보내지 못했습니다.");
    } finally {
      setBusy("");
    }
  };

  if (loading || dataLoading) return <PortalLoading />;
  if (!session || error) return <PortalError message={error || "프로젝트를 불러오지 못했습니다."} />;

  return (
    <PortalPageShell session={session} active="문의">
      <main className="pcrm-portal-subpage">
        <div className="pcrm-portal-subpage-title"><span>PCRM · INQUIRIES</span><h1>담당자 문의</h1><p>프로젝트에 관한 질문과 자료를 한곳에서 주고받습니다.</p></div>
        <div className="pcrm-inquiry-layout">
          <PortalCard className="pcrm-inquiry-new">
            <header><MessageSquareText size={18} /><div><h2>새 문의</h2><p>담당 매니저가 확인 후 이 화면에서 답변합니다.</p></div></header>
            <div className="pcrm-inquiry-form">
              <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>
                {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <input value={form.title} maxLength={200} placeholder="문의 제목" onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
              <textarea value={form.content} maxLength={5000} placeholder="궁금한 내용을 적어주세요." onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} />
              <label className="pcrm-file-picker"><Paperclip size={14} /><span>{files.length ? `${files.length}개 파일 선택됨` : "파일 첨부 (최대 50MB)"}</span><input type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></label>
              <button type="button" disabled={busy === "new" || !form.title.trim() || !form.content.trim()} onClick={() => void send()}><Send size={14} />{busy === "new" ? "전송 중" : "문의 보내기"}</button>
              {message && <p>{message}</p>}
            </div>
          </PortalCard>
          <div className="pcrm-inquiry-list">
            {inquiries.length === 0 ? <PortalCard><div className="pcrm-client-empty">등록된 문의가 없습니다.</div></PortalCard> : inquiries.map((inquiry) => (
              <PortalCard key={inquiry.id} className="pcrm-inquiry-thread">
                <header><div><span>{CATEGORIES.find(([value]) => value === inquiry.category)?.[1] ?? "기타"}</span><h2>{inquiry.title}</h2></div><b className={`is-${inquiry.status}`}>{inquiry.status === "answered" ? "답변 완료" : inquiry.status === "closed" ? "종료" : "확인 대기"}</b></header>
                <div className="pcrm-inquiry-messages">
                  {(inquiry.messages ?? []).map((entry: any) => (
                    <article key={entry.id} className={entry.author_type === "admin" ? "is-admin" : "is-client"}>
                      <strong>{entry.author_type === "admin" ? entry.author_name || "담당 매니저" : "고객"}</strong>
                      <p>{entry.content}</p>
                      {(entry.attachments ?? []).map((attachment: any) => attachment.downloadUrl && (
                        <a key={attachment.id} href={attachment.downloadUrl} target="_blank" rel="noreferrer"><Paperclip size={11} />{attachment.file_name}</a>
                      ))}
                      <span>{new Date(entry.created_at).toLocaleString("ko-KR")}</span>
                    </article>
                  ))}
                </div>
                {inquiry.status !== "closed" && (
                  <footer>
                    <textarea value={reply[inquiry.id] ?? ""} maxLength={5000} placeholder="추가 메시지를 적어주세요." onChange={(event) => setReply((current) => ({ ...current, [inquiry.id]: event.target.value }))} />
                    <button type="button" disabled={busy === inquiry.id || !(reply[inquiry.id] ?? "").trim()} onClick={() => void send(inquiry.id)}>보내기</button>
                  </footer>
                )}
              </PortalCard>
            ))}
          </div>
        </div>
      </main>
    </PortalPageShell>
  );
}
