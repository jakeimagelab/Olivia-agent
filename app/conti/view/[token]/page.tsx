import { getSupabaseAdmin } from "@/lib/supabase";
import { notFound } from "next/navigation";
import { getContiCategoryColor } from "@/components/conti/contiColors";
import ContiSceneCard from "@/components/conti/ContiSceneCard";
import ContiChecklistRow from "@/components/conti/ContiChecklistRow";
import ContiScheduleBlock from "@/components/conti/ContiScheduleBlock";
import ShareLinkCopyButton from "@/components/conti/ShareLinkCopyButton";

export const dynamic = "force-dynamic";

interface ContiRow {
  category: string; duration: string; location: string;
  cameraAngle: string; keyword: string; description: string;
  personnel: string; notes: string;
}
interface ChecklistRow { number: number; category: string; item: string; notes: string; }
interface ScheduleRow { time: string; duration?: string; activity: string; type: string; requirements: string; notes: string; }
interface ContiResult { conti: ContiRow[]; checklist: ChecklistRow[]; schedule: ScheduleRow[]; }

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
        <ShareLinkCopyButton />
      </div>

      <div style={{ padding: "16px 14px", maxWidth: 1000, margin: "0 auto" }}>

        {/* ── 촬영 콘티 ── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{
            background: "#155855", color: "#fff", fontWeight: 900, fontSize: 14,
            padding: "8px 14px", borderRadius: "8px 8px 0 0", letterSpacing: "0.05em",
          }}>촬영 콘티</div>
          <div style={{
            background: "#EDF5F3", padding: 14, borderRadius: "0 0 8px 8px",
            border: "1px solid rgba(21,88,85,0.12)", borderTop: "none",
            display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14,
          }}>
            {result.conti?.map((row, i) => (
              <ContiSceneCard
                key={i}
                index={i + 1}
                category={row.category}
                duration={row.duration}
                keyword={row.keyword}
                description={row.description}
                location={row.location}
                cameraAngle={row.cameraAngle}
                personnel={row.personnel}
                color={getContiCategoryColor(row.category)}
              />
            ))}
          </div>
        </div>

        {/* ── 체크리스트 ── */}
        {result.checklist?.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ background: "#E85D2C", color: "#fff", fontWeight: 900, fontSize: 14, padding: "8px 14px", borderRadius: "8px 8px 0 0", letterSpacing: "0.05em" }}>
              촬영 준비 체크리스트
            </div>
            <div style={{
              background: "#EDF5F3", padding: 14, borderRadius: "0 0 8px 8px",
              border: "1px solid rgba(21,88,85,0.12)", borderTop: "none",
              display: "grid", gap: 10,
            }}>
              {result.checklist.map((row, i) => (
                <ContiChecklistRow key={i} category={row.category} item={row.item} notes={row.notes} />
              ))}
            </div>
          </div>
        )}

        {/* ── 타임테이블 ── */}
        {result.schedule?.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ background: "#1d4ed8", color: "#fff", fontWeight: 900, fontSize: 14, padding: "8px 14px", borderRadius: "8px 8px 0 0" }}>
              당일 타임테이블
            </div>
            <div style={{
              background: "#EDF5F3", padding: 14, borderRadius: "0 0 8px 8px",
              border: "1px solid rgba(21,88,85,0.12)", borderTop: "none",
              display: "grid", gap: 10,
            }}>
              {result.schedule.map((row, i) => (
                <ContiScheduleBlock key={i} time={row.time} activity={row.activity} type={row.type} requirements={row.requirements} />
              ))}
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
