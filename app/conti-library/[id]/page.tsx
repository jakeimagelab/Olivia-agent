"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import GlobalHeader from "@/components/GlobalHeader";
import { C, R } from "@/lib/theme";
import { SCENE_TYPE_LABELS_KO } from "@/lib/conti-library/config";
import type { ContiCaseDocument, ContiCaseScene } from "@/lib/conti-library/types";

const STATUS_LABEL: Record<string, string> = { uploaded: "업로드됨", analyzing: "분석 중", analyzed: "학습 완료", failed: "분석 실패" };
const STATUS_COLOR: Record<string, string> = { uploaded: C.hint, analyzing: C.orange, analyzed: C.success, failed: C.danger };

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  let data: any = null;
  try { data = await response.json(); } catch { throw new Error(`요청에 실패했습니다. (${response.status})`); }
  if (!data?.ok) throw new Error(data?.error || `요청에 실패했습니다. (${response.status})`);
  return data;
}

export default function ContiLibraryDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [caseDoc, setCaseDoc] = useState<ContiCaseDocument | null>(null);
  const [scenes, setScenes] = useState<ContiCaseScene[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);

  const [clinicName, setClinicName] = useState("");
  const [departmentsText, setDepartmentsText] = useState("");
  const [shootingType, setShootingType] = useState("");
  const [doctorCount, setDoctorCount] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson(`/api/conti-library/${id}`, { cache: "no-store" });
      setCaseDoc(data.document);
      setScenes(data.scenes);
      setClinicName(data.document.clinicName ?? "");
      setDepartmentsText((data.document.departments ?? []).join(", "));
      setShootingType(data.document.shootingType ?? "");
      setDoctorCount(data.document.doctorCount != null ? String(data.document.doctorCount) : "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const data = await fetchJson(`/api/conti-library/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinicName,
          departments: departmentsText.split(",").map((s) => s.trim()).filter(Boolean),
          shootingType,
          doctorCount: doctorCount ? Number(doctorCount) : undefined,
        }),
      });
      setCaseDoc(data.document);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleReanalyze = async () => {
    setReanalyzing(true);
    setError("");
    try {
      await fetchJson(`/api/conti-library/${id}/analyze`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "재분석에 실패했습니다.");
    } finally {
      setReanalyzing(false);
    }
  };

  if (loading) return <><GlobalHeader title="콘티 사례 라이브러리" description="지난 콘티 작성 사례를 모아 참고할 수 있는 라이브러리입니다." /><div className="pc-content"><p style={{ fontSize: 13, color: C.hint }}>불러오는 중...</p></div></>;
  if (!caseDoc) return <><GlobalHeader title="콘티 사례 라이브러리" description="지난 콘티 작성 사례를 모아 참고할 수 있는 라이브러리입니다." /><div className="pc-content"><p style={{ fontSize: 13, color: C.danger }}>{error || "사례를 찾을 수 없습니다."}</p></div></>;

  return (
    <>
      <GlobalHeader title="콘티 사례 라이브러리" description="지난 콘티 작성 사례를 모아 참고할 수 있는 라이브러리입니다." />
      <div className="pc-content pc-content--wide">
        <Link href="/conti-library" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: C.muted, textDecoration: "none", marginBottom: 12 }}>
          <ArrowLeft size={14} />목록으로
        </Link>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, marginBottom: 4 }}>{caseDoc.fileName}</h1>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 800, color: STATUS_COLOR[caseDoc.status] }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_COLOR[caseDoc.status] }} />
              {STATUS_LABEL[caseDoc.status]}
            </span>
          </div>
          {caseDoc.status === "failed" || caseDoc.status === "uploaded" ? (
            <button type="button" onClick={handleReanalyze} disabled={reanalyzing}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", borderRadius: R.md, border: `1px solid ${C.teal}`, background: C.mint, color: C.teal, fontSize: 12.5, fontWeight: 800, cursor: reanalyzing ? "not-allowed" : "pointer" }}>
              <RefreshCw size={13} />{reanalyzing ? "재분석 중..." : "재분석"}
            </button>
          ) : null}
        </div>

        {error ? <p style={{ fontSize: 12, color: C.danger, marginBottom: 12 }}>{error}</p> : null}
        {caseDoc.status === "failed" && caseDoc.errorMessage ? (
          <p style={{ fontSize: 12, color: C.danger, marginBottom: 12, padding: 10, background: "#FEF2F2", borderRadius: R.sm }}>{caseDoc.errorMessage}</p>
        ) : null}

        <div className="pc-card pc-card--padded" style={{ marginBottom: 16, display: "grid", gap: 12, maxWidth: 640 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.ink }}>분석 결과 확인</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted }}>병원명</span>
              <input value={clinicName} onChange={(e) => setClinicName(e.target.value)} style={{ height: 34, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 10px", fontSize: 12.5 }} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted }}>원장 수</span>
              <input type="number" min={0} value={doctorCount} onChange={(e) => setDoctorCount(e.target.value)} style={{ height: 34, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 10px", fontSize: 12.5 }} />
            </label>
          </div>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted }}>진료과 (쉼표로 구분)</span>
            <input value={departmentsText} onChange={(e) => setDepartmentsText(e.target.value)} placeholder="예: 피부과, 웰니스"
              style={{ height: 34, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 10px", fontSize: 12.5 }} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted }}>촬영 목적</span>
            <input value={shootingType} onChange={(e) => setShootingType(e.target.value)} placeholder="예: 홈페이지 브랜드 촬영"
              style={{ height: 34, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 10px", fontSize: 12.5 }} />
          </label>
          <button type="button" onClick={handleSave} disabled={saving}
            style={{ height: 38, borderRadius: R.md, border: "none", background: C.teal, color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}>
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>

        <div style={{ fontSize: 12, fontWeight: 800, color: C.ink, marginBottom: 8 }}>추출된 장면 ({scenes.length}개)</div>
        {scenes.length === 0 ? (
          <p style={{ fontSize: 12.5, color: C.hint }}>아직 추출된 장면이 없습니다.</p>
        ) : (
          <div className="pc-card" style={{ overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.mint, textAlign: "left" }}>
                  {["#", "장면", "유형", "장소", "구도", "행동/연출"].map((h) => (
                    <th key={h} style={{ padding: "8px 12px", fontSize: 10, fontWeight: 800, color: C.muted, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scenes.map((scene) => (
                  <tr key={scene.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ padding: "8px 12px", color: C.hint }}>{scene.sceneOrder}</td>
                    <td style={{ padding: "8px 12px", fontWeight: 700 }}>{scene.sceneName}</td>
                    <td style={{ padding: "8px 12px" }}>{SCENE_TYPE_LABELS_KO[scene.sceneType] ?? scene.sceneType}</td>
                    <td style={{ padding: "8px 12px", color: C.muted }}>{scene.location || "-"}</td>
                    <td style={{ padding: "8px 12px", color: C.muted }}>{scene.cameraAngle || "-"}</td>
                    <td style={{ padding: "8px 12px", color: C.muted, maxWidth: 320 }}>{scene.action || scene.direction || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
