"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, HardDrive, CheckCircle2, AlertTriangle } from "lucide-react";
import { C } from "@/lib/theme";

function DriveStatusCard() {
  const searchParams = useSearchParams();
  const driveResult = searchParams.get("drive");
  const [status, setStatus] = useState<{ connected: boolean; email: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/team-chat/drive/status");
      const data = await res.json().catch(() => null);
      if (data?.ok) setStatus({ connected: data.connected, email: data.email });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: C.mint, display: "grid", placeItems: "center" }}>
          <HardDrive size={20} color={C.teal} />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>팀 채팅 파일 저장소</div>
          <div style={{ fontSize: 12, color: C.muted }}>채팅에 올리는 사진·영상·파일을 저장할 대표 Google Drive 계정</div>
        </div>
      </div>

      {driveResult === "success" && (
        <div style={{ marginBottom: 14, padding: "10px 12px", background: "#EAFAF4", border: "1px solid #B2E2CF", borderRadius: 8, fontSize: 12, color: C.success, fontWeight: 700 }}>
          ✓ Google Drive 연결이 완료됐습니다.
        </div>
      )}
      {(driveResult === "error" || driveResult === "unauthorized") && (
        <div style={{ marginBottom: 14, padding: "10px 12px", background: "#FFF0EB", border: "1px solid #FACCB8", borderRadius: 8, fontSize: 12, color: C.orange, fontWeight: 700 }}>
          ⚠ 연결에 실패했습니다. 다시 시도해주세요.
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: C.muted }}>확인 중...</div>
      ) : status?.connected ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.ink, fontWeight: 700, marginBottom: 16 }}>
          <CheckCircle2 size={16} color={C.success} /> 연결됨 — {status.email}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.muted, marginBottom: 16 }}>
          <AlertTriangle size={16} color={C.orange} /> 아직 연결되지 않았습니다. 연결 전까지 채팅에서 파일 첨부를 사용할 수 없습니다.
        </div>
      )}

      <a
        href="/api/team-chat/drive/connect"
        className="pc-btn pc-btn--primary"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}
      >
        {status?.connected ? "다른 계정으로 다시 연결" : "Google Drive 연결하기"}
      </a>
    </div>
  );
}

export default function TeamChatSettingsPage() {
  return (
    <main style={{ minHeight: "100vh", background: C.bg, padding: "32px 20px 80px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <Link href="/team-chat" style={{
          display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700,
          color: C.muted, textDecoration: "none", marginBottom: 20,
        }}>
          <ArrowLeft size={15} /> 팀 채팅으로
        </Link>

        <h1 style={{ fontSize: 22, fontWeight: 900, color: C.ink, margin: "0 0 6px" }}>팀 채팅 설정</h1>
        <p style={{ fontSize: 13, color: C.muted, margin: "0 0 24px" }}>관리자만 볼 수 있는 팀 채팅 관리 화면입니다.</p>

        <DriveStatusCard />
      </div>
    </main>
  );
}
