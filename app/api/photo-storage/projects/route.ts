import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdminSession } from "@/lib/passkey";
import { isMissingPhotoNotificationColumns, PHOTO_PROJECT_STATUSES } from "@/lib/photo-storage/server";
import {
  ACTIONABLE_PHOTO_PROJECT_STATUSES,
  ACTIVE_PHOTO_PROJECT_STATUSES,
} from "@/lib/photo-storage/notificationPolicy";
import { loadShootingProgressCards } from "@/lib/photo-storage/shootingProgressCards";
import type { ShootingProgressCard } from "@/lib/photo-storage/shootingProgress";
import type { PhotoStorageProject } from "@/lib/photo-storage/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const db = getSupabaseAdmin();
    const requestedStatus = request.nextUrl.searchParams.get("status")?.toUpperCase();
    let projects: Record<string, unknown>[] = [];
    if (requestedStatus && PHOTO_PROJECT_STATUSES.includes(requestedStatus as (typeof PHOTO_PROJECT_STATUSES)[number])) {
      const { data, error } = await db
        .from("photo_storage_projects")
        .select("*")
        .eq("status", requestedStatus)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      projects = data ?? [];
    } else {
      const now = new Date().toISOString();
      const [activeResult, actionableResult] = await Promise.all([
        db
          .from("photo_storage_projects")
          .select("*")
          // DEFERRED는 3일 뒤 알림 목록에서는 사라져도 촬영 진행 카드에는 남아야 한다.
          .in("status", [...ACTIVE_PHOTO_PROJECT_STATUSES, "CLASSIFY_COMPLETED", "DEFERRED"])
          .order("updated_at", { ascending: false })
          .limit(100),
        db
          .from("photo_storage_projects")
          .select("*")
          .in("status", [...ACTIONABLE_PHOTO_PROJECT_STATUSES])
          .is("notification_dismissed_at", null)
          .or(`notification_deferred_until.is.null,notification_deferred_until.gt.${now}`)
          .order("updated_at", { ascending: false })
          .limit(100),
      ]);
      if (activeResult.error) throw activeResult.error;
      let actionableProjects = actionableResult.data ?? [];
      if (actionableResult.error) {
        if (!isMissingPhotoNotificationColumns(actionableResult.error)) throw actionableResult.error;
        const legacyResult = await db
          .from("photo_storage_projects")
          .select("*")
          .in("status", [...ACTIONABLE_PHOTO_PROJECT_STATUSES])
          .order("updated_at", { ascending: false })
          .limit(100);
        if (legacyResult.error) throw legacyResult.error;
        actionableProjects = (legacyResult.data ?? []).map((project) => ({
          ...project,
          notification_deferred_until: null,
          notification_dismissed_at: null,
        }));
      }
      const byId = new Map<string, Record<string, unknown>>();
      for (const project of [...(activeResult.data ?? []), ...actionableProjects]) {
        if (typeof project.id === "string") byId.set(project.id, project);
      }
      projects = [...byId.values()]
        .sort((left, right) => new Date(String(right.updated_at)).getTime() - new Date(String(left.updated_at)).getTime())
        .slice(0, 100);
    }

    const projectIds = projects.map((project) => project.id);
    const { data: events, error: eventError } = projectIds.length
      ? await db.from("photo_storage_events").select("*").in("project_id", projectIds).order("created_at", { ascending: false })
      : { data: [], error: null };
    if (eventError) throw eventError;
    let shootingProgress: ShootingProgressCard[] = [];
    try {
      shootingProgress = await loadShootingProgressCards(db, projects as unknown as PhotoStorageProject[]);
    } catch (progressError) {
      // 진행 카드 조회가 실패해도 기존 사진 알림과 파이프라인 상태 조회를 깨뜨리지 않는다.
      console.warn("[photo-storage shooting progress]", progressError instanceof Error ? progressError.message : progressError);
    }
    return Response.json({ ok: true, projects, events: events ?? [], shootingProgress });
  } catch (error) {
    console.error("[photo-storage projects GET]", error);
    return Response.json({ ok: false, error: "촬영 프로젝트를 불러오지 못했습니다." }, { status: 500 });
  }
}
