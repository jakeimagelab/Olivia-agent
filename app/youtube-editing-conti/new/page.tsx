"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { C, R } from "@/lib/theme";

export default function NewYoutubeEditingProjectPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  const startProject = async () => {
    if (!script.trim() || starting) return;
    setStarting(true);
    setError("");
    try {
      const response = await fetch("/api/youtube-editing/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title || "제목 없음", fullScript: script, videoRatio: "16:9" }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error);
      router.push(`/youtube-editing-conti?project=${data.project.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "프로젝트 생성에 실패했습니다.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <main className="pc-page" style={{ color: C.ink, fontFamily: "'NanumSquare', 'Noto Sans KR', sans-serif" }}>
      <div className="pc-content" style={{ maxWidth: 640 }}>
        <Link href="/youtube-editing-conti" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: C.muted, textDecoration: "none", marginBottom: 12 }}>
          <ArrowLeft size={14} />문서 목록으로
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>새 유튜브 편집 콘티</h1>
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>대본을 장면별로 나누고 손글씨로 카메라, 자막, 자료화면과 편집 효과를 설계합니다.</p>
        <div className="pc-card pc-card--padded" style={{ display: "grid", gap: 12 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="프로젝트 제목 (예: 비염 원인 영상)"
            style={{ height: 40, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 12px", fontSize: 13 }}
          />
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder="유튜브 대본 전체를 붙여넣으세요. 문장 단위로 자동 분리됩니다."
            rows={12}
            style={{ borderRadius: R.sm, border: `1px solid ${C.border}`, padding: 12, fontSize: 13, lineHeight: 1.7, resize: "vertical", fontFamily: "inherit" }}
          />
          {error ? <p style={{ color: C.danger, fontSize: 12 }}>{error}</p> : null}
          <button
            type="button"
            onClick={startProject}
            disabled={!script.trim() || starting}
            style={{
              height: 44, borderRadius: R.md, border: 0, background: C.orange, color: "#fff", fontSize: 13, fontWeight: 800,
              cursor: !script.trim() || starting ? "not-allowed" : "pointer", opacity: !script.trim() || starting ? 0.55 : 1,
            }}
          >
            {starting ? "시작하는 중..." : "콘티 시작하기"}
          </button>
        </div>
      </div>
    </main>
  );
}
