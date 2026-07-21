"use client";

import { useState } from "react";
import { UserPlus, Copy, Check } from "lucide-react";
import { C } from "@/lib/theme";

export default function InviteMemberPanel() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!email.trim() || loading) return;
    setLoading(true);
    setError("");
    setInviteUrl("");
    try {
      const res = await fetch("/api/team-chat/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "초대 생성에 실패했습니다.");
      setInviteUrl(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "초대 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: C.teal, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}
      >
        <UserPlus size={14} /> 팀원 초대
      </button>
    );
  }

  return (
    <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: C.ink, marginBottom: 10 }}>팀원 초대</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일"
          style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 12, outline: "none" }}
        />
        <button onClick={submit} disabled={loading} className="pc-btn pc-btn--primary pc-btn--sm">
          {loading ? "생성 중..." : "초대 만들기"}
        </button>
      </div>
      {error && <div style={{ fontSize: 11, color: C.danger, marginBottom: 8 }}>{error}</div>}
      {inviteUrl && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.mint, borderRadius: 8, padding: "8px 10px" }}>
          <span style={{ fontSize: 11, color: C.teal, flex: 1, wordBreak: "break-all" }}>{inviteUrl}</span>
          <button onClick={copy} style={{ border: "none", background: "transparent", color: C.teal, cursor: "pointer" }}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      )}
      <div style={{ fontSize: 10, color: C.hint, marginTop: 8 }}>
        이메일 발송은 되지 않으니, 링크를 복사해서 카카오톡 등으로 직접 전달해주세요. 7일간 유효합니다.
      </div>
    </div>
  );
}
