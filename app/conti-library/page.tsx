"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, Plus, RefreshCw, Trash2 } from "lucide-react";
import GlobalHeader from "@/components/GlobalHeader";
import { C, R } from "@/lib/theme";
import { SCENE_TYPE_LABELS_KO } from "@/lib/conti-library/config";
import type { ContiCaseDocument } from "@/lib/conti-library/types";

const STATUS_LABEL: Record<string, string> = { uploaded: "업로드됨", analyzing: "분석 중", analyzed: "학습 완료", failed: "분석 실패" };
const STATUS_COLOR: Record<string, string> = { uploaded: C.hint, analyzing: C.orange, analyzed: C.success, failed: C.danger };

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  let data: any = null;
  try { data = await response.json(); } catch { throw new Error(`요청에 실패했습니다. (${response.status})`); }
  if (!data?.ok) throw new Error(data?.error || `요청에 실패했습니다. (${response.status})`);
  return data;
}

export default function ContiLibraryPage() {
  const [documents, setDocuments] = useState<ContiCaseDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson("/api/conti-library", { cache: "no-store" });
      setDocuments(data.documents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadDocuments(); }, [loadDocuments]);

  const patchDocument = (id: string, patch: Partial<ContiCaseDocument>) => {
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const analyze = async (id: string) => {
    patchDocument(id, { status: "analyzing" });
    try {
      const data = await fetchJson(`/api/conti-library/${id}/analyze`, { method: "POST" });
      patchDocument(id, data.document);
    } catch (err) {
      patchDocument(id, { status: "failed", errorMessage: err instanceof Error ? err.message : "분석 실패" });
    }
  };

  const handleFileSelect = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const data = await fetchJson("/api/conti-library/upload", { method: "POST", body: formData });
      if (data.deduped) {
        setError("이미 등록된 콘티 자료입니다.");
        setUploading(false);
        return;
      }
      setDocuments((prev) => [data.document, ...prev]);
      setUploading(false);
      void analyze(data.document.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드에 실패했습니다.");
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("이 사례 자료를 삭제할까요? 추출된 장면 데이터도 함께 삭제됩니다.")) return;
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    try {
      await fetchJson(`/api/conti-library/${id}`, { method: "DELETE" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제에 실패했습니다.");
      void loadDocuments();
    }
  };

  return (
    <>
      <GlobalHeader title="콘티 사례 라이브러리" description="지난 콘티 작성 사례를 모아 참고할 수 있는 라이브러리입니다." />
      <div className="pc-content pc-content--wide">
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18, gap: 12 }}>
          <div>
            <Link href="/conti" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: C.muted, textDecoration: "none", marginBottom: 10 }}>
              <ArrowLeft size={14} />콘티 작성으로
            </Link>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, marginBottom: 6 }}>콘티 학습 자료</h1>
            <p style={{ fontSize: 13, color: C.muted, margin: 0, maxWidth: 520 }}>
              과거에 최종 확정한 콘티 PDF를 등록하면 올리비아가 장면 구성과 촬영 패턴을 분석하여 새 콘티 생성 시 참고합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, height: 40, padding: "0 16px", flexShrink: 0,
              borderRadius: R.md, border: "none", background: C.orange, color: "#fff", fontSize: 13, fontWeight: 800,
              cursor: uploading ? "not-allowed" : "pointer", opacity: uploading ? 0.6 : 1,
            }}
          >
            <Plus size={15} />{uploading ? "업로드 중..." : "PDF 추가"}
          </button>
          <input ref={fileInputRef} type="file" accept="application/pdf" hidden onChange={(e) => { void handleFileSelect(e.target.files?.[0] ?? null); e.target.value = ""; }} />
        </div>

        {error ? <p style={{ fontSize: 12, color: C.danger, marginBottom: 14 }}>{error}</p> : null}

        {loading ? (
          <p style={{ fontSize: 13, color: C.hint }}>불러오는 중...</p>
        ) : documents.length === 0 ? (
          <div className="pc-card pc-card--padded" style={{ textAlign: "center", padding: 40 }}>
            <FileText size={28} color={C.hint} style={{ marginBottom: 10 }} />
            <p style={{ fontSize: 13, color: C.muted }}>아직 등록된 학습 자료가 없습니다. 과거 콘티 PDF를 추가해보세요.</p>
          </div>
        ) : (
          <div className="pc-card" style={{ overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: C.mint, textAlign: "left" }}>
                  {["파일명", "진료과", "촬영 목적", "장면 수", "상태", "등록일", ""].map((h) => (
                    <th key={h} style={{ padding: "10px 14px", fontSize: 10.5, fontWeight: 800, color: C.muted }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: "10px 14px", maxWidth: 240 }}>
                      <Link href={`/conti-library/${doc.id}`} style={{ color: C.ink, fontWeight: 700, textDecoration: "none" }}>{doc.fileName}</Link>
                      {doc.clinicName ? <div style={{ fontSize: 10.5, color: C.hint }}>{doc.clinicName}</div> : null}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      {doc.departments.length ? doc.departments.join(", ") : <span style={{ color: C.hint }}>-</span>}
                    </td>
                    <td style={{ padding: "10px 14px", color: C.muted }}>{doc.shootingType || "-"}</td>
                    <td style={{ padding: "10px 14px" }}>{doc.sceneCount}개</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 800, color: STATUS_COLOR[doc.status] }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_COLOR[doc.status] }} />
                        {STATUS_LABEL[doc.status]}
                      </span>
                      {doc.status === "failed" && doc.errorMessage ? <div style={{ fontSize: 10, color: C.hint, marginTop: 2, maxWidth: 180 }}>{doc.errorMessage}</div> : null}
                    </td>
                    <td style={{ padding: "10px 14px", color: C.hint, fontSize: 11 }}>{new Date(doc.createdAt).toLocaleDateString("ko-KR")}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        {doc.status === "failed" || doc.status === "uploaded" ? (
                          <button type="button" onClick={() => void analyze(doc.id)} title="재분석" aria-label="재분석"
                            style={{ width: 28, height: 28, borderRadius: R.sm, border: `1px solid ${C.border}`, background: "#fff", color: C.teal, cursor: "pointer" }}>
                            <RefreshCw size={13} />
                          </button>
                        ) : null}
                        <button type="button" onClick={() => void handleDelete(doc.id)} title="삭제" aria-label="삭제"
                          style={{ width: 28, height: 28, borderRadius: R.sm, border: `1px solid ${C.border}`, background: "#fff", color: C.danger, cursor: "pointer" }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p style={{ fontSize: 10.5, color: C.hint, marginTop: 14 }}>
          장면 유형: {Object.entries(SCENE_TYPE_LABELS_KO).map(([, label]) => label).join(" · ")}
        </p>
      </div>
    </>
  );
}
