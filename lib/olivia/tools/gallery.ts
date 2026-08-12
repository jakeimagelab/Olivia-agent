import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fuzzyNameSearch, fuzzyNameSearchOne } from "@/lib/olivia/nameSearch";
import { logActivity } from "@/lib/activityLogger";

// lib/assistant/core/legacyOliviaCore.ts의 executeTool()에서 그대로 옮긴 갤러리 조회/생성 —
// 레거시 Claude 경로와 v2 OpenAI 경로가 같은 구현을 공유한다.
export async function getGallery(input: any) {
  const db = getSupabaseAdmin();
  const client = await fuzzyNameSearchOne<any>({
    db, table: "clients", nameColumn: "hospital_name",
    select: "id, hospital_name",
    query: input.clientName,
  });

  const GALLERY_SELECT = "id, hospital_name, nas_link, shoot_date, description, created_at, items:photo_gallery_items(thumbnail_url)";
  let galleries: any[] | null;
  if (client?.id) {
    const { data } = await db
      .from("photo_galleries")
      .select(GALLERY_SELECT)
      .eq("client_id", client.id)
      .order("created_at", { ascending: false })
      .limit(5);
    galleries = data;
  } else {
    galleries = await fuzzyNameSearch<any>({
      db, table: "photo_galleries", nameColumn: "hospital_name",
      select: GALLERY_SELECT,
      query: input.clientName,
      limit: 5,
      filter: (q: any) => q.order("created_at", { ascending: false }),
    });
  }

  if (!galleries || galleries.length === 0) {
    return { action: "done", message: `📷 **${input.clientName}** 갤러리가 아직 없습니다.\n\n갤러리를 등록하려면 create_gallery 도구를 사용해주세요.` };
  }

  const lines = galleries.map((g: any) => {
    const date = g.shoot_date ? new Date(g.shoot_date).toLocaleDateString("ko-KR") : "날짜 미입력";
    const desc = g.description ? ` — ${g.description}` : "";
    return `• [${date}${desc}]\n  NAS: ${g.nas_link}`;
  });

  return {
    action: "done",
    message: `📷 **${client?.hospital_name || input.clientName}** 갤러리 ${galleries.length}건\n\n${lines.join("\n\n")}`,
    galleries,
  };
}

// req는 레거시(Claude) 경로에서만 넘어온다 — v2(OpenAI) 경로는 NextRequest 없이 runTool을 호출한다.
export async function createGallery(input: any, req?: NextRequest | null) {
  const db = getSupabaseAdmin();
  const client = await fuzzyNameSearchOne<any>({
    db, table: "clients", nameColumn: "hospital_name",
    select: "id, hospital_name, contact_name, email",
    query: input.clientName,
  });

  // 활성 워크플로우 조회 (자동 전진용)
  let run: { id: string; current_step_key: string } | undefined;
  if (client?.id) {
    const { data: runs } = await db
      .from("workflow_runs")
      .select("id, current_step_key")
      .eq("client_id", client.id)
      .eq("status", "active")
      .limit(1);
    run = (runs as { id: string; current_step_key: string }[] | null)?.[0];
  }

  const origin =
    req?.headers.get("x-base-url") || req?.headers.get("origin") ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "http://localhost:3000";
  const res = await fetch(`${origin}/api/galleries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hospitalName:  client?.hospital_name || input.clientName,
      contactName:   client?.contact_name  || "",
      contactEmail:  client?.email         || "",
      nasLink:       input.nasLink,
      description:   input.description     || "",
      shootDate:     input.shootDate        || null,
      thumbnailUrl:  input.thumbnailUrl     || "",
      client_id:       client?.id          || null,
      workflow_run_id: run?.id             || null,
    }),
  });
  const d = await res.json();
  if (!d.ok) return { action: "done", message: `❌ 갤러리 생성 실패: ${d.error}` };
  await logActivity("send_workflow_mail", input.clientName, { gallery: true, nasLink: input.nasLink });

  const autoMsg = run?.current_step_key === "retouching"
    ? "\n\n✅ 보정완료 처리 + 메일 draft 자동 생성 + **final_delivery** 단계로 자동 전진됐어요."
    : "\n\n메일링함에 draft가 저장됐습니다.";

  return {
    action: "done",
    message: `📷 **${client?.hospital_name || input.clientName}** 갤러리 등록 완료!\nNAS: ${input.nasLink}${autoMsg}`,
    clientId: client?.id,
  };
}
