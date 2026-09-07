import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase";
import ShareViewPrintButton from "@/components/conti/v2/ShareViewPrintButton";

export const dynamic = "force-dynamic";

interface SceneRow {
  id: string;
  group_id: string | null;
  sort: number;
  name: string;
  space_text: string;
  minutes: number | null;
  keyword: string;
  description: string;
  procedures: string[];
  people_text: string;
  patient_role_text: string;
  note: string;
}

interface GroupRow { id: string; name: string; sort: number; }

const GROUP_COLORS = ["#155855", "#E85D2C", "#3B6FB4", "#8A5EC2", "#B4823B", "#4C9E6E", "#B1477D", "#5C7CBE"];

// 고객용 링크에는 촬영자용 정보(키워드·연출 방향, 환자역할 캐스팅)를 넣지 않는다 —
// DB에는 전체가 그대로 있고 이 페이지에서만 audience로 필터링한다.
export default async function ContiV2ShareView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getSupabaseAdmin();

  const { data: share, error: shareError } = await db
    .from("conti_run_shares")
    .select("run_id, audience, revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (shareError || !share || share.revoked_at) notFound();

  const isStaff = share.audience === "staff";

  const [{ data: run }, { data: groups }, { data: scenes }] = await Promise.all([
    db.from("conti_runs").select("*").eq("id", share.run_id).maybeSingle(),
    db.from("conti_groups").select("*").eq("run_id", share.run_id).order("sort"),
    db.from("conti_scenes").select("*").eq("run_id", share.run_id).order("sort"),
  ]);
  if (!run) notFound();

  const groupRows = (groups ?? []) as GroupRow[];
  const sceneRows = (scenes ?? []) as SceneRow[];
  const groupNameById = new Map(groupRows.map((g) => [g.id, g.name]));
  const groupColorByName = new Map(groupRows.map((g, i) => [g.name, GROUP_COLORS[i % GROUP_COLORS.length]]));

  const totalMinutes = sceneRows.reduce((sum, s) => sum + (s.minutes ?? 0), 0);

  return (
    <div style={{ background: "#EDF5F3", minHeight: "100vh", fontFamily: "'Pretendard', sans-serif" }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
        }
      `}</style>

      <div className="no-print" style={{
        background: "#155855", padding: "14px 20px", display: "flex", alignItems: "center", gap: 12,
        boxShadow: "0 2px 12px rgba(21,88,85,.15)", position: "sticky", top: 0, zIndex: 100,
      }}>
        <span style={{ fontSize: 22 }}>📋</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#fff", fontWeight: 900, fontSize: 17, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {run.specialty || "촬영"} 콘티
          </div>
          <div style={{ color: "rgba(255,255,255,.6)", fontSize: 12, marginTop: 1 }}>
            {isStaff ? "현장팀용 · 준비사항 포함" : "고객용"} · 읽기 전용
          </div>
        </div>
        <ShareViewPrintButton />
      </div>

      <div style={{ padding: "16px 14px", maxWidth: 1000, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ background: "#155855", color: "#fff", fontWeight: 900, fontSize: 14, padding: "8px 14px", borderRadius: "8px 8px 0 0" }}>
            총 {sceneRows.length}장면 · 예상 {Math.floor(totalMinutes / 60)}시간 {totalMinutes % 60}분
          </div>
          <div style={{ overflowX: "auto", background: "#fff", borderRadius: "0 0 8px 8px", border: "1px solid rgba(21,88,85,.12)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#155855" }}>
                  {(["#", "그룹", "장면", "장소", "시간", ...(isStaff ? ["키워드"] : []), "설명·시술", "필요인원", ...(isStaff ? ["환자역할"] : []), "비고"]).map((h) => (
                    <th key={h} style={{ color: "#fff", padding: "9px 10px", fontWeight: 800, fontSize: 12, textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sceneRows.map((scene, i) => {
                  const groupName = (scene.group_id && groupNameById.get(scene.group_id)) || "미지정";
                  const accent = groupColorByName.get(groupName) ?? "#9aa8a4";
                  return (
                    <tr key={scene.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafaf9" }}>
                      <td style={{ padding: "8px 10px", color: "#a9998a", fontWeight: 700, borderBottom: "1px solid rgba(21,88,85,.07)" }}>{i + 1}</td>
                      <td style={{ padding: "8px 10px", color: accent, fontWeight: 800, whiteSpace: "nowrap", borderBottom: "1px solid rgba(21,88,85,.07)" }}>{groupName}</td>
                      <td style={{ padding: "8px 10px", fontWeight: 700, borderBottom: "1px solid rgba(21,88,85,.07)" }}>{scene.name || "-"}</td>
                      <td style={{ padding: "8px 10px", whiteSpace: "nowrap", borderBottom: "1px solid rgba(21,88,85,.07)" }}>{scene.space_text || "-"}</td>
                      <td style={{ padding: "8px 10px", whiteSpace: "nowrap", borderBottom: "1px solid rgba(21,88,85,.07)" }}>{scene.minutes != null ? `${scene.minutes}분` : "-"}</td>
                      {isStaff ? (
                        <td style={{ padding: "8px 10px", color: "#E85D2C", fontWeight: 800, whiteSpace: "nowrap", borderBottom: "1px solid rgba(21,88,85,.07)" }}>{scene.keyword || "-"}</td>
                      ) : null}
                      <td style={{ padding: "8px 10px", lineHeight: 1.6, minWidth: 200, borderBottom: "1px solid rgba(21,88,85,.07)" }}>
                        {scene.description || "-"}
                        {scene.procedures.length > 0 ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                            {scene.procedures.map((p) => (
                              <span key={p} style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "#EFEBE3", color: "#6b6355" }}>{p}</span>
                            ))}
                          </div>
                        ) : null}
                      </td>
                      <td style={{ padding: "8px 10px", fontSize: 12, color: "#374151", borderBottom: "1px solid rgba(21,88,85,.07)" }}>{scene.people_text || "-"}</td>
                      {isStaff ? (
                        <td style={{ padding: "8px 10px", fontSize: 12, color: "#374151", borderBottom: "1px solid rgba(21,88,85,.07)" }}>{scene.patient_role_text || "-"}</td>
                      ) : null}
                      <td style={{ padding: "8px 10px", fontSize: 12, color: "#666", borderBottom: "1px solid rgba(21,88,85,.07)" }}>{scene.note || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="no-print" style={{ textAlign: "center", padding: "20px 0", color: "#aaa", fontSize: 12 }}>
          포토클리닉 AI 비서 · {isStaff ? "현장팀" : "고객"} 공유뷰
        </div>
      </div>
    </div>
  );
}
