"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";

const C = {
  teal: "#155855", orange: "#E85D2C", green: "#22876A", red: "#DC2626",
  white: "#FFFFFF", border: "rgba(21,88,85,.12)", muted: "#5A7470",
  hint: "#9BB5B0", txt: "#1C2B28", light: "#EAF4F2", bg: "#EDF5F3",
};

type FeatureOption = { path: string; label: string };
type FeatureGroup = { group: string; items: FeatureOption[] };

const FEATURE_GROUPS: FeatureGroup[] = [
  {
    group: "업무 서포트",
    items: [
      { path: "/memo", label: "상담 메모" },
      { path: "/calendar", label: "업무 캘린더" },
      { path: "/quote", label: "견적서 생성" },
      { path: "/conti", label: "촬영 콘티 생성" },
      { path: "/mailing", label: "통합 메일링" },
      { path: "/report", label: "업무 리포트" },
      { path: "/video-conti", label: "영상 콘티 생성" },
      { path: "/prompter", label: "프롬프터" },
    ],
  },
  {
    group: "사진 작업실",
    items: [
      { path: "/photo-sorting", label: "사진 분류" },
      { path: "/video-sorting", label: "영상 분류" },
      { path: "/raw-select", label: "AI 컷 정리 & RAW" },
      { path: "/select-match", label: "셀렉 & 매칭" },
      { path: "/photo-retouching", label: "색감·보정" },
    ],
  },
  {
    group: "홍보 & 분석",
    items: [
      { path: "/daily-ideas", label: "아이디어 제안" },
      { path: "/sns-manager", label: "홍보 콘텐츠 제작" },
      { path: "/review-studio", label: "리뷰컨텐츠" },
      { path: "/brand-analysis", label: "홈페이지 브랜드 분석" },
      { path: "/ai-trust-gap", label: "AI 추천 병원 역분석" },
      { path: "/diagnosis", label: "병원이미지 진단" },
      { path: "/channel-analyzer", label: "병원 채널 분석" },
      { path: "/image-generator", label: "리얼 이미지 디렉터" },
      { path: "/website-builder", label: "홈페이지 제작" },
      { path: "/seo-delivery", label: "AI 검색 최적화" },
    ],
  },
];

const FEATURE_LABEL: Record<string, string> = Object.fromEntries(
  FEATURE_GROUPS.flatMap((g) => g.items.map((i) => [i.path, i.label]))
);

interface ShareLink {
  id: string;
  token: string;
  feature_path: string;
  label: string;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  last_used_at: string | null;
  use_count: number;
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden", marginBottom: 16 }}>
      {children}
    </div>
  );
}

function linkStatus(link: ShareLink): { label: string; color: string } {
  if (link.revoked_at) return { label: "취소됨", color: C.red };
  if (link.expires_at && new Date(link.expires_at) < new Date()) return { label: "만료됨", color: C.hint };
  return { label: "활성", color: C.green };
}

export default function LinkGeneratorPage() {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [featurePath, setFeaturePath] = useState(FEATURE_GROUPS[0].items[0].path);
  const [label, setLabel] = useState("");
  const [expiresInDays, setExpiresInDays] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copyMsg, setCopyMsg] = useState("");

  const loadLinks = () => {
    setLoading(true);
    fetch("/api/share-links")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setLinks(d.links); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadLinks(); }, []);

  const createLink = async () => {
    setCreating(true);
    setGeneratedUrl(null);
    try {
      const res = await fetch("/api/share-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featurePath, label, expiresInDays }),
      });
      const data = await res.json();
      if (data.ok) {
        setGeneratedUrl(`${window.location.origin}/s/${data.token}`);
        setLabel("");
        loadLinks();
      } else {
        alert(data.error ?? "링크 생성 실패");
      }
    } catch {
      alert("링크 생성 실패 — 네트워크 오류");
    } finally {
      setCreating(false);
    }
  };

  const revokeLink = async (id: string) => {
    if (!confirm("이 링크를 취소하시겠습니까? 취소하면 더 이상 접근할 수 없습니다.")) return;
    await fetch(`/api/share-links/${id}/revoke`, { method: "POST" });
    loadLinks();
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopyMsg("복사되었습니다");
      setTimeout(() => setCopyMsg(""), 1500);
    });
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'NanumSquare', 'Noto Sans KR', sans-serif" }}>
      <PageHeader title="외부 공유 링크" />
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "24px 20px 80px" }}>
        <Card>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, fontSize: 13, fontWeight: 900, color: C.teal }}>
            새 링크 생성
          </div>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>공유할 기능</div>
              <select
                value={featurePath}
                onChange={(e) => setFeaturePath(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
              >
                {FEATURE_GROUPS.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.items.map((i) => (
                      <option key={i.path} value={i.path}>{i.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>메모 (선택)</div>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="예: OO 프리랜서 리터처용"
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
              />
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>만료 기간</div>
              <div style={{ display: "flex", gap: 8 }}>
                {([["무기한", null], ["7일", 7], ["30일", 30]] as const).map(([lbl, val]) => (
                  <button
                    key={lbl}
                    onClick={() => setExpiresInDays(val)}
                    style={{
                      flex: 1, padding: "9px 0", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                      border: `1.5px solid ${expiresInDays === val ? C.teal : C.border}`,
                      background: expiresInDays === val ? C.light : C.white,
                      color: expiresInDays === val ? C.teal : C.muted,
                      fontSize: 13, fontWeight: expiresInDays === val ? 900 : 600,
                    }}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <button
                onClick={createLink}
                disabled={creating}
                style={{
                  height: 42, padding: "0 22px", border: "none", borderRadius: 10, fontFamily: "inherit",
                  fontSize: 13, fontWeight: 800, cursor: creating ? "not-allowed" : "pointer",
                  background: C.teal, color: "#fff", opacity: creating ? 0.6 : 1,
                }}
              >
                {creating ? "생성 중..." : "🔗 링크 생성"}
              </button>
            </div>

            {generatedUrl && (
              <div style={{ background: C.light, borderRadius: 8, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: C.teal, fontWeight: 700, flex: 1, wordBreak: "break-all" }}>{generatedUrl}</span>
                <button
                  onClick={() => copyUrl(generatedUrl)}
                  style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.teal, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}
                >
                  {copyMsg || "복사"}
                </button>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, fontSize: 13, fontWeight: 900, color: C.teal }}>
            생성된 링크 목록 {links.length > 0 && `(${links.length})`}
          </div>
          <div style={{ padding: loading || links.length === 0 ? 20 : 0 }}>
            {loading ? (
              <div style={{ fontSize: 12, color: C.hint, textAlign: "center" }}>불러오는 중...</div>
            ) : links.length === 0 ? (
              <div style={{ fontSize: 12, color: C.hint, textAlign: "center" }}>아직 생성된 링크가 없습니다.</div>
            ) : (
              links.map((link, i) => {
                const status = linkStatus(link);
                return (
                  <div key={link.id} style={{ padding: "14px 20px", borderBottom: i < links.length - 1 ? `1px solid ${C.border}` : "none", display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: C.txt }}>{FEATURE_LABEL[link.feature_path] ?? link.feature_path}</span>
                        <span style={{ fontSize: 10, fontWeight: 800, color: status.color, background: status.color + "18", padding: "2px 8px", borderRadius: 99 }}>{status.label}</span>
                      </div>
                      {link.label && <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>{link.label}</div>}
                      <div style={{ fontSize: 10, color: C.hint }}>
                        생성 {new Date(link.created_at).toLocaleDateString("ko-KR")}
                        {link.expires_at && ` · 만료 ${new Date(link.expires_at).toLocaleDateString("ko-KR")}`}
                        {` · 사용 ${link.use_count}회`}
                        {link.last_used_at && ` · 최근 ${new Date(link.last_used_at).toLocaleDateString("ko-KR")}`}
                      </div>
                    </div>
                    {!link.revoked_at && (
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={() => copyUrl(`${window.location.origin}/s/${link.token}`)}
                          style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.teal, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                        >
                          복사
                        </button>
                        <button
                          onClick={() => revokeLink(link.id)}
                          style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, color: C.red, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                        >
                          취소
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
