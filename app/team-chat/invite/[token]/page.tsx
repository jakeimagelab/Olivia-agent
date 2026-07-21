"use client";

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { C } from "@/lib/theme";

export default function TeamChatInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = usePromise(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [invalidReason, setInvalidReason] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/team-chat/invites/${token}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setEmail(d.email); else setInvalidReason(d.error || "초대를 확인할 수 없습니다."); })
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/team-chat/invites/${token}/accept`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName, password }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "가입에 실패했습니다.");
      router.push("/team-chat");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "가입에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: "var(--mesh-bg)", display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 360, background: "#fff", borderRadius: 20, padding: 32, boxShadow: "0 18px 50px rgba(21,88,85,.12)" }}>
        <div style={{ width: 52, height: 52, borderRadius: 16, background: C.mint, display: "grid", placeItems: "center", margin: "0 auto 16px" }}>
          <MessageCircle size={24} color={C.teal} />
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 900, color: C.ink, textAlign: "center", margin: "0 0 20px" }}>팀 채팅 초대</h1>

        {loading ? (
          <p style={{ fontSize: 13, color: C.muted, textAlign: "center" }}>확인 중...</p>
        ) : invalidReason ? (
          <p style={{ fontSize: 13, color: C.danger, textAlign: "center", fontWeight: 700 }}>{invalidReason}</p>
        ) : (
          <form onSubmit={submit}>
            <p style={{ fontSize: 12, color: C.muted, textAlign: "center", marginBottom: 20 }}>
              <strong style={{ color: C.ink }}>{email}</strong>로 초대받았습니다. 이름과 비밀번호를 설정해주세요.
            </p>

            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 4 }}>이름</label>
            <input
              required value={displayName} onChange={(e) => setDisplayName(e.target.value)}
              style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 14, outline: "none" }}
            />
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 4 }}>비밀번호 (8자 이상)</label>
            <input
              type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
              style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 16, outline: "none" }}
            />

            {error && <div style={{ fontSize: 12, color: C.danger, fontWeight: 700, marginBottom: 12 }}>{error}</div>}

            <button type="submit" disabled={submitting} className="pc-btn pc-btn--primary" style={{ width: "100%" }}>
              {submitting ? "가입 중..." : "가입하고 시작하기"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
