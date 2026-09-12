import { notFound } from "next/navigation";
import ContiSceneCard from "@/components/conti/ContiSceneCard";
import ShareViewPrintButton from "@/components/conti/v2/ShareViewPrintButton";
import type { ContiGroupRow, ContiRunRow, ContiSceneRow } from "@/components/conti/v2/types";
import { parsePreparationText } from "@/lib/conti/deriveChecklist";
import { resolveSceneVisual } from "@/lib/conti/sceneVisualLibrary";
import { normalizeContiStudioState } from "@/lib/conti/studioState";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
const GROUP_COLORS = ["#155855", "#E85D2C", "#3B6FB4", "#8A5EC2", "#B4823B", "#4C9E6E", "#B1477D", "#5C7CBE"];

export default async function ContiShareView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getSupabaseAdmin();
  const { data: share, error: shareError } = await db.from("conti_run_shares").select("run_id, audience, revoked_at").eq("token", token).maybeSingle();
  if (shareError || !share || share.revoked_at) notFound();
  const isStaff = share.audience === "staff";
  const [{ data: run }, { data: groups }, { data: scenes }] = await Promise.all([
    db.from("conti_runs").select("*").eq("id", share.run_id).maybeSingle(),
    db.from("conti_groups").select("*").eq("run_id", share.run_id).order("sort"),
    db.from("conti_scenes").select("*").eq("run_id", share.run_id).order("sort"),
  ]);
  if (!run) notFound();

  const runRow = run as ContiRunRow;
  let hospitalName = "";
  if (runRow.hospital_id) {
    const client = await db.from("clients").select("hospital_name").eq("id", runRow.hospital_id).maybeSingle();
    if (!client.error) hospitalName = client.data?.hospital_name?.trim() ?? "";
  }
  const groupRows = (groups ?? []) as ContiGroupRow[];
  const sceneRows = (scenes ?? []) as ContiSceneRow[];
  const studioState = normalizeContiStudioState(runRow.studio_state);
  const groupById = new Map(groupRows.map((group, index) => [group.id, { name: group.name, color: group.color || GROUP_COLORS[index % GROUP_COLORS.length] }]));
  const totalMinutes = sceneRows.reduce((sum, scene) => sum + (scene.minutes ?? 0), 0);
  const completed = sceneRows.filter((scene) => scene.completed).length;

  return (
    <main className="share-shell">
      <style>{`
        :root { color-scheme: light; }
        body { margin: 0; background: #edf5f3; }
        .share-shell { min-height: 100vh; padding-bottom: 40px; color: #243f3a; font-family: 'Pretendard', sans-serif; }
        .share-header { position: sticky; z-index: 20; top: 0; display: flex; align-items: center; gap: 15px; min-height: 68px; padding: 0 22px; background: rgba(255,255,255,.96); border-bottom: 1px solid rgba(21,88,85,.1); backdrop-filter: blur(14px); }
        .share-mark { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 11px; background: #155855; color: #fff; font-weight: 900; }
        .share-title { min-width: 0; flex: 1; }.share-title strong { display: block; overflow: hidden; color: #173d38; font-size: 16px; text-overflow: ellipsis; white-space: nowrap; }.share-title span { display: block; margin-top: 3px; color: #829691; font-size: 10px; }
        .share-progress { color: #155855; font-size: 11px; font-weight: 850; }.share-content { max-width: 1300px; margin: 0 auto; padding: 18px; }
        .share-summary { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 14px; border-radius: 14px; padding: 13px 16px; background: #155855; color: #fff; }.share-summary strong { font-size: 13px; }.share-summary span { color: rgba(255,255,255,.62); font-size: 10px; }
        .share-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 13px; align-items: start; }
        .share-footer { padding: 28px 0; color: #8aa09b; text-align: center; font-size: 10px; }
        @media (max-width: 900px) { .share-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
        @media (max-width: 620px) { .share-header { padding: 0 12px; }.share-content { padding: 12px; }.share-grid { grid-template-columns: 1fr; }.share-progress { display: none; } }
        @media print { .no-print { display: none !important; }.share-shell { padding: 0; background: #fff; }.share-header { position: static; }.share-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }.share-content { max-width: none; }.share-grid > * { break-inside: avoid; } }
      `}</style>
      <header className="share-header no-print">
        <div className="share-mark">O</div>
        <div className="share-title"><strong>{hospitalName || specialtyLabel(runRow.specialty)}</strong><span>{isStaff ? "현장팀용 · 준비사항 포함" : "고객 확인용"} · 읽기 전용</span></div>
        <div className="share-progress">{completed} / {sceneRows.length} 완료</div>
        <ShareViewPrintButton />
      </header>
      <div className="share-content">
        <section className="share-summary"><strong>{sceneRows.length} Scene · 예상 {formatMinutes(totalMinutes)}</strong><span>표시된 순서가 최신 촬영 순서입니다.</span></section>
        <div className="share-grid">
          {sceneRows.map((scene, index) => {
            const group = scene.group_id ? groupById.get(scene.group_id) : undefined;
            const visual = studioState.sceneMeta[scene.id]?.visual ?? resolveSceneVisual({ specialty: runRow.specialty, name: scene.name, keyword: scene.keyword, procedures: scene.procedures });
            return <ContiSceneCard key={scene.id} index={index + 1} category={scene.name || "이름 없는 Scene"} duration={scene.minutes != null ? `${scene.minutes}분` : undefined} keyword={isStaff ? scene.keyword || group?.name : group?.name} description={scene.description} location={scene.space_text} cameraAngle={isStaff ? studioState.sceneMeta[scene.id]?.cameraAngle : undefined} personnel={scene.people_text} imageUrl={visual.imageUrl} preparationItems={isStaff ? parsePreparationText(scene.preparation_text) : undefined} completed={scene.completed} color={{ bg: `${group?.color || "#155855"}18`, text: group?.color || "#155855" }} />;
          })}
        </div>
        <footer className="share-footer no-print">OLIVIA OS · {isStaff ? "현장팀" : "고객"} 공유뷰</footer>
      </div>
    </main>
  );
}

function formatMinutes(minutes: number) { const hours = Math.floor(minutes / 60); const rest = minutes % 60; return hours ? `${hours}시간${rest ? ` ${rest}분` : ""}` : `${rest}분`; }
function specialtyLabel(value?: string | null) {
  const labels: Record<string, string> = { dermatology: "피부과 촬영 콘티", orthopedics: "정형외과 촬영 콘티", ophthalmology: "안과 촬영 콘티", "plastic-surgery": "성형외과 촬영 콘티", rehabilitation: "재활의학과 촬영 콘티", dental: "치과 촬영 콘티", internal: "내과 촬영 콘티", pediatrics: "소아과 촬영 콘티", gynecology: "산부인과 촬영 콘티", imported: "가져온 촬영 콘티" };
  return value ? labels[value] || `${value} 촬영 콘티` : "촬영 콘티";
}
