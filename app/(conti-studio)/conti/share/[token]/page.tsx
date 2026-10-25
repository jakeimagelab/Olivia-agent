import { notFound } from "next/navigation";
import { BookOpen } from "lucide-react";
import ContiSceneCard from "@/components/conti/ContiSceneCard";
import ContiHospitalShareEditor from "@/components/conti/v2/ContiHospitalShareEditor";
import ContiShootSetupPanels from "@/components/conti/v2/ContiShootSetupPanels";
import ShareViewPrintButton from "@/components/conti/v2/ShareViewPrintButton";
import type { ContiGroupRow, ContiRunRow, ContiSceneRow } from "@/components/conti/v2/types";
import { parsePreparationText } from "@/lib/conti/deriveChecklist";
import { getSupabaseAdmin } from "@/lib/supabase";
import { CONTI_GROUP_COLORS, getDepartmentContiTitle, getDepartmentLabel } from "@/lib/conti/departmentTaxonomy";
import { normalizeContiStudioState } from "@/lib/conti/studioState";
import { getSetups, setupSummary } from "@/lib/shootSetup/rules";
import { resolveContiShotType } from "@/lib/conti/shotType";

export const dynamic = "force-dynamic";

export default async function ContiShareView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getSupabaseAdmin();
  const { data: share, error: shareError } = await db.from("conti_run_shares").select("run_id, audience, can_edit, edited_at, submitted_at, revoked_at").eq("token", token).maybeSingle();
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
  if (share.audience === "hospital" && share.can_edit) {
    return <ContiHospitalShareEditor token={token} hospitalName={hospitalName || getDepartmentLabel(runRow.specialty || "촬영")} run={{ ...runRow, hospital_name: hospitalName }} groups={groupRows} scenes={sceneRows} editedAt={share.edited_at} />;
  }
  const groupById = new Map(groupRows.map((group, index) => [group.id, { name: group.name, color: group.color || CONTI_GROUP_COLORS[index % CONTI_GROUP_COLORS.length] }]));
  const totalMinutes = sceneRows.reduce((sum, scene) => sum + (scene.minutes ?? 0), 0);
  const completed = sceneRows.filter((scene) => scene.completed).length;
  const studioState = normalizeContiStudioState(runRow.studio_state);
  const setups = getSetups(studioState.shootSetup);

  return (
    <main className="share-shell">
      <style>{`
        :root { color-scheme: light; }
        body { margin: 0; background: #edf5f3; }
        .share-shell { min-height: 100vh; padding-bottom: 40px; color: #243f3a; font-family: 'Pretendard', sans-serif; }
        .share-header { position: sticky; z-index: 20; top: 0; display: flex; align-items: center; gap: 15px; min-height: 68px; padding: 0 22px; background: rgba(255,255,255,.96); border-bottom: 1px solid rgba(21,88,85,.1); backdrop-filter: blur(14px); }
        .share-mark { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 11px; background: #155855; color: #fff; font-weight: 600; }
        .share-title { min-width: 0; flex: 1; }.share-title strong { display: block; overflow: hidden; color: #173d38; font-size: 16px; text-overflow: ellipsis; white-space: nowrap; }.share-title span { display: block; margin-top: 3px; color: #829691; font-size: 10px; }
        .share-progress { color: #155855; font-size: 11px; font-weight: 600; }.share-content { max-width: 1300px; margin: 0 auto; padding: 18px; }
        .share-guide { display: inline-flex; min-height: 40px; align-items: center; gap: 6px; border: 1px solid #155855; border-radius: 9px; padding: 0 11px; color: #155855; font-size: 11px; font-weight: 500; text-decoration: none; white-space: nowrap; }
        .share-summary { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 14px; border-radius: 14px; padding: 13px 16px; background: #155855; color: #fff; }.share-summary strong { font-size: 13px; }.share-summary span { color: rgba(255,255,255,.62); font-size: 10px; }
        .share-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 13px; align-items: start; }
        .share-footer { padding: 28px 0; color: #8aa09b; text-align: center; font-size: 10px; }
        @media (max-width: 900px) { .share-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
        @media (max-width: 620px) { .share-header { padding: 0 12px; }.share-content { padding: 12px; }.share-grid { grid-template-columns: 1fr; }.share-progress { display: none; } }
        @media print { .no-print { display: none !important; }.share-shell { padding: 0; background: #fff; }.share-header { position: static; }.share-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }.share-content { max-width: none; }.share-grid > * { break-inside: avoid; } }
      `}</style>
      <header className="share-header no-print">
        <div className="share-mark">O</div>
        <div className="share-title"><strong>{hospitalName || getDepartmentContiTitle(runRow.specialty || "촬영")}</strong><span>{isStaff ? "현장팀용 · 준비사항 포함" : "고객 확인용"} · 읽기 전용</span></div>
        <div className="share-progress">{completed} / {sceneRows.length} 완료</div>
        {isStaff ? <a className="share-guide" href="/staff-guide" target="_blank" rel="noreferrer"><BookOpen size={15} aria-hidden="true" />스텝 가이드</a> : null}
        <ShareViewPrintButton />
      </header>
      <div className="share-content">
        <section className="share-summary"><strong>{sceneRows.length} Scene · 예상 {formatMinutes(totalMinutes)}</strong><span>표시된 순서가 최신 촬영 순서입니다.</span></section>
        {isStaff ? <ContiShootSetupPanels input={studioState.shootSetup} checked={studioState.equipmentChecked} /> : null}
        <div className="share-grid">
          {sceneRows.map((scene, index) => {
            const group = scene.group_id ? groupById.get(scene.group_id) : undefined;
            const shotType = resolveContiShotType({ shotType: scene.shot_type, name: scene.name, groupName: group?.name });
            return <ContiSceneCard key={scene.id} index={index + 1} category={scene.name || "이름 없는 Scene"} duration={scene.minutes != null ? `${scene.minutes}분` : undefined} keyword={isStaff ? scene.keyword || group?.name : group?.name} description={scene.description} location={scene.space_text} personnel={scene.people_text} patientRole={scene.patient_role_text} media={scene.media === "photo_video" ? "사진 + 영상" : scene.media === "none" ? "—" : "사진"} preparationItems={isStaff ? parsePreparationText(scene.preparation_text) : undefined} setup={isStaff ? setupSummary(setups[shotType]) || undefined : undefined} completed={scene.completed} color={{ bg: `${group?.color || "#155855"}18`, text: group?.color || "#155855" }} />;
          })}
        </div>
        <footer className="share-footer no-print">OLIVIA OS · {isStaff ? "현장팀" : "고객"} 공유뷰</footer>
      </div>
    </main>
  );
}

function formatMinutes(minutes: number) { const hours = Math.floor(minutes / 60); const rest = minutes % 60; return hours ? `${hours}시간${rest ? ` ${rest}분` : ""}` : `${rest}분`; }
