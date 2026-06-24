import { getSupabaseAdmin } from "@/lib/supabase";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface ContiRow {
  category: string; duration: string; location: string;
  cameraAngle: string; keyword: string; description: string;
  personnel: string; notes: string;
}
interface ChecklistRow { number: number; category: string; item: string; notes: string; }
interface ScheduleRow { time: string; duration?: string; activity: string; type: string; requirements: string; notes: string; }
interface ContiResult { conti: ContiRow[]; checklist: ChecklistRow[]; schedule: ScheduleRow[]; }

const CAT_COLORS: { key: string; bg: string; text: string }[] = [
  { key: "하모니", bg: "#FEF3C7", text: "#92400E" },
  { key: "공통",   bg: "#FEF3C7", text: "#92400E" },
  { key: "인포데스크", bg: "#FEF3C7", text: "#92400E" },
  { key: "C-ARM",  bg: "#FEE2E2", text: "#991B1B" },
  { key: "씨암",   bg: "#FEE2E2", text: "#991B1B" },
  { key: "시술",   bg: "#FEE2E2", text: "#991B1B" },
  { key: "초음파", bg: "#DBEAFE", text: "#1E40AF" },
  { key: "주사",   bg: "#DBEAFE", text: "#1E40AF" },
  { key: "외래",   bg: "#FCE7F3", text: "#9D174D" },
  { key: "진료",   bg: "#FCE7F3", text: "#9D174D" },
  { key: "상담",   bg: "#FCE7F3", text: "#9D174D" },
  { key: "병동",   bg: "#EDE9FE", text: "#5B21B6" },
  { key: "재활",   bg: "#D1FAE5", text: "#065F46" },
  { key: "물리치료", bg: "#D1FAE5", text: "#065F46" },
  { key: "수술",   bg: "#FEE2E2", text: "#991B1B" },
];
const getColor = (cat: string) =>
  CAT_COLORS.find(c => cat.includes(c.key)) ?? { bg: "#E6F4F1", text: "#155855" };

export default async function ContiShareView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("conti_shares")
    .select("*")
    .eq("token", token)
    .single();

  if (error || !data) notFound();

  const result = data.result as ContiResult;
  const title = data.title || data.hospital || "촬영 콘티";

  return (
    <div style={{ background: "#EDF5F3", minHeight: "100vh", fontFamily: "'Pretendard', sans-serif" }}>
      {/* 헤더 */}
      <div style={{
        background: "#155855", padding: "14px 20px",
        display: "flex", alignItems: "center", gap: 12,
        boxShadow: "0 2px 12px rgba(21,88,85,0.15)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <span style={{ fontSize: 22 }}>📋</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#fff", fontWeight: 900, fontSize: 17, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title} 촬영 콘티
          </div>
          {data.specialties && (
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 1 }}>{data.specialties}</div>
          )}
        </div>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, flexShrink: 0 }}>현장뷰 (읽기 전용)</div>
      </div>

      <div style={{ padding: "16px 14px", maxWidth: 900, margin: "0 auto" }}>

        {/* ── 촬영 콘티 ── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{
            background: "#155855", color: "#fff", fontWeight: 900, fontSize: 14,
            padding: "8px 14px", borderRadius: "8px 8px 0 0", letterSpacing: "0.05em",
          }}>촬영 콘티</div>
          <div style={{ overflowX: "auto", background: "#fff", borderRadius: "0 0 8px 8px", border: "1px solid rgba(21,88,85,0.12)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#155855" }}>
                  {["카테고리", "소요시간", "장소", "카메라 구도", "키워드", "촬영 설명", "인원", "비고"].map(h => (
                    <th key={h} style={{ color: "#fff", padding: "9px 10px", fontWeight: 800, fontSize: 12, textAlign: "left", whiteSpace: "nowrap", borderRight: "1px solid rgba(255,255,255,0.1)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.conti?.map((row, i) => {
                  const c = getColor(row.category);
                  return (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafaf9" }}>
                      <td style={{ background: c.bg, color: c.text, fontWeight: 900, fontSize: 12, padding: "8px 10px", whiteSpace: "nowrap", borderBottom: "1px solid rgba(21,88,85,0.07)", verticalAlign: "top" }}>{row.category}</td>
                      <td style={{ padding: "8px 10px", whiteSpace: "nowrap", borderBottom: "1px solid rgba(21,88,85,0.07)", verticalAlign: "top" }}>{row.duration || "-"}</td>
                      <td style={{ padding: "8px 10px", borderBottom: "1px solid rgba(21,88,85,0.07)", verticalAlign: "top" }}>{row.location || "-"}</td>
                      <td style={{ padding: "8px 10px", fontSize: 12, color: "#4b5563", borderBottom: "1px solid rgba(21,88,85,0.07)", verticalAlign: "top" }}>{row.cameraAngle || "-"}</td>
                      <td style={{ padding: "8px 10px", color: "#E85D2C", fontWeight: 800, whiteSpace: "nowrap", borderBottom: "1px solid rgba(21,88,85,0.07)", verticalAlign: "top" }}>{row.keyword || "-"}</td>
                      <td style={{ padding: "8px 10px", lineHeight: 1.6, borderBottom: "1px solid rgba(21,88,85,0.07)", verticalAlign: "top", minWidth: 200, whiteSpace: "pre-line" }}>{row.description || "-"}</td>
                      <td style={{ padding: "8px 10px", fontSize: 12, color: "#374151", borderBottom: "1px solid rgba(21,88,85,0.07)", verticalAlign: "top" }}>{row.personnel || "-"}</td>
                      <td style={{ padding: "8px 10px", fontSize: 12, color: "#666", borderBottom: "1px solid rgba(21,88,85,0.07)", verticalAlign: "top" }}>{row.notes || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── 체크리스트 ── */}
        {result.checklist?.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ background: "#E85D2C", color: "#fff", fontWeight: 900, fontSize: 14, padding: "8px 14px", borderRadius: "8px 8px 0 0", letterSpacing: "0.05em" }}>
              촬영 준비 체크리스트
            </div>
            <div style={{ overflowX: "auto", background: "#fff", borderRadius: "0 0 8px 8px", border: "1px solid rgba(21,88,85,0.12)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#E85D2C" }}>
                    {["#", "카테고리", "준비 항목", "비고", "✓"].map(h => (
                      <th key={h} style={{ color: "#fff", padding: "9px 10px", fontWeight: 800, fontSize: 12, textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.checklist.map((row, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafaf9" }}>
                      <td style={{ padding: "8px 10px", fontWeight: 900, color: "#155855", textAlign: "center", borderBottom: "1px solid rgba(21,88,85,0.07)" }}>{row.number}</td>
                      <td style={{ padding: "8px 10px", fontWeight: 700, color: "#155855", whiteSpace: "nowrap", borderBottom: "1px solid rgba(21,88,85,0.07)" }}>{row.category}</td>
                      <td style={{ padding: "8px 10px", borderBottom: "1px solid rgba(21,88,85,0.07)" }}>{row.item}</td>
                      <td style={{ padding: "8px 10px", fontSize: 12, color: "#888", borderBottom: "1px solid rgba(21,88,85,0.07)" }}>{row.notes || "-"}</td>
                      <td style={{ padding: "8px 10px", textAlign: "center", borderBottom: "1px solid rgba(21,88,85,0.07)" }}>
                        <div style={{ width: 20, height: 20, border: "2px solid #155855", borderRadius: 4, margin: "0 auto" }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── 타임테이블 ── */}
        {result.schedule?.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ background: "#1d4ed8", color: "#fff", fontWeight: 900, fontSize: 14, padding: "8px 14px", borderRadius: "8px 8px 0 0" }}>
              당일 타임테이블
            </div>
            <div style={{ overflowX: "auto", background: "#fff", borderRadius: "0 0 8px 8px", border: "1px solid rgba(21,88,85,0.12)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#1d4ed8" }}>
                    {["시간", "소요", "활동", "유형", "필요사항", "비고"].map(h => (
                      <th key={h} style={{ color: "#fff", padding: "9px 10px", fontWeight: 800, fontSize: 12, textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.schedule.map((row, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f8f9ff" }}>
                      <td style={{ padding: "8px 10px", fontWeight: 800, color: "#1d4ed8", whiteSpace: "nowrap", borderBottom: "1px solid rgba(29,78,216,0.07)" }}>{row.time}</td>
                      <td style={{ padding: "8px 10px", whiteSpace: "nowrap", borderBottom: "1px solid rgba(29,78,216,0.07)" }}>{row.duration || "-"}</td>
                      <td style={{ padding: "8px 10px", borderBottom: "1px solid rgba(29,78,216,0.07)" }}>{row.activity}</td>
                      <td style={{ padding: "8px 10px", whiteSpace: "nowrap", borderBottom: "1px solid rgba(29,78,216,0.07)" }}>
                        {row.type && (
                          <span style={{ background: row.type === "사진" ? "#dbeafe" : "#fce7f3", color: row.type === "사진" ? "#1d4ed8" : "#9d174d", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                            {row.type}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: "1px solid rgba(29,78,216,0.07)" }}>{row.requirements || "-"}</td>
                      <td style={{ padding: "8px 10px", fontSize: 12, color: "#888", borderBottom: "1px solid rgba(29,78,216,0.07)" }}>{row.notes || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ textAlign: "center", padding: "20px 0", color: "#aaa", fontSize: 12 }}>
          포토클리닉 AI 비서 · 현장뷰
        </div>
      </div>
    </div>
  );
}
