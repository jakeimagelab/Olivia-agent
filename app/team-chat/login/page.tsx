"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { C } from "@/lib/theme";

export default function TeamChatLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/team-chat/login", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "로그인에 실패했습니다.");
      router.push("/team-chat");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: "var(--mesh-bg)", display: "grid", placeItems: "center", padding: 20 }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 360, background: "#fff", borderRadius: 20, padding: 32, boxShadow: "0 18px 50px rgba(21,88,85,.12)" }}>
        <div style={{ width: 52, height: 52, borderRadius: 16, background: C.mint, display: "grid", placeItems: "center", margin: "0 auto 16px" }}>
          <MessageCircle size={24} color={C.teal} />
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 900, color: C.ink, textAlign: "center", margin: "0 0 4px" }}>팀 채팅 로그인</h1>
        <p style={{ fontSize: 12, color: C.muted, textAlign: "center", margin: "0 0 24px" }}>포토클리닉 팀원 계정으로 로그인하세요.</p>

        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 4 }}>이메일</label>
        <input
          type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 14, outline: "none" }}
        />
        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 4 }}>비밀번호</label>
        <input
          type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 16, outline: "none" }}
        />

        {error && <div style={{ fontSize: 12, color: C.danger, fontWeight: 700, marginBottom: 12 }}>{error}</div>}

        <button type="submit" disabled={loading} className="pc-btn pc-btn--primary" style={{ width: "100%" }}>
          {loading ? "로그인 중..." : "로그인"}
        </button>
      </form>
    </main>
  );
}
