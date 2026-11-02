import { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { extraPickCount, priceOrder } from "@/lib/person-select/core";
import type { PersonSelectCategory, PersonSelectOffer, PersonSelectOrderItem } from "@/lib/person-select/types";

function csvCell(value: unknown) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
function csvResponse(rows: unknown[][], fileName: string) {
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}` } });
}

export async function GET(request: NextRequest, context: { params: Promise<{ eventId: string; kind: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId, kind } = await context.params; const db = getSupabaseAdmin();
  const { data: event } = await db.from("person_select_events").select("title,retouch_options,categories,offers,extra_price").eq("id", eventId).single();
  if (!event) return Response.json({ ok: false, error: "행사를 찾을 수 없습니다." }, { status: 404 });
  const { data: people } = await db.from("person_select_people").select("id,display_name,group_label,pin_code,submitted_at,orders").eq("event_id", eventId).order("display_name");
  if (kind === "pins") return csvResponse([["이름", "담임반", "비밀번호"], ...(people ?? []).map((item) => [item.display_name, item.group_label ?? "", item.pin_code])], `${event.title}-비밀번호.csv`);
  if (kind === "orders") {
    // 사람마다 추가 주문 한 줄씩 (추가 보정 포함). 주문이 없는 사람은 빼고 맨 아래에 합계를 둔다.
    const { data: picks } = await db.from("person_select_choices").select("person_id,category_key,image_id,person_select_images(original_file_name)").eq("event_id", eventId);
    const rows: unknown[][] = [];
    let total = 0;
    for (const person of people ?? []) {
      const own = (picks ?? []).filter((pick) => pick.person_id === person.id);
      const chosenCounts = own.reduce<Record<string, number>>((acc, pick) => { acc[pick.category_key] = (acc[pick.category_key] ?? 0) + 1; return acc; }, {});
      const photoNames = Object.fromEntries(own.map((pick) => [pick.image_id, (pick.person_select_images as unknown as { original_file_name?: string } | null)?.original_file_name ?? ""]));
      const priced = priceOrder({ offers: (event.offers ?? []) as PersonSelectOffer[], items: (person.orders ?? []) as PersonSelectOrderItem[], extraCount: extraPickCount((event.categories ?? []) as PersonSelectCategory[], chosenCounts), extraPrice: Number(event.extra_price) || 0, photoNames });
      for (const line of priced.lines) rows.push([person.display_name, person.submitted_at ? "제출 완료" : "제출 전", line.label, line.detail, line.qty, line.unitPrice, line.amount]);
      total += priced.total;
    }
    return csvResponse([["이름", "제출", "상품", "내용", "수량", "단가(원)", "금액(원)"], ...rows, ["합계", "", "", "", "", "", total]], `${event.title}-추가주문.csv`);
  }
  if (kind !== "retouch") return Response.json({ ok: false, error: "없는 내보내기 형식입니다." }, { status: 404 });
  const { data: choices } = await db.from("person_select_choices").select("person_id,category_key,retouch_keys,memo,updated_at,person_select_images(original_file_name,source_rel_path)").eq("event_id", eventId).order("updated_at");
  const names = new Map((people ?? []).map((item) => [item.id, item])); const labels = new Map((event.retouch_options as { key: string; label: string }[]).map((item) => [item.key, item.label])); const categoryLabels = new Map(((event.categories ?? []) as { key: string; label: string }[]).map((item) => [item.key, item.label]));
  const rows = (choices ?? []).map((choice) => {
    const image = choice.person_select_images as unknown as { original_file_name: string; source_rel_path: string } | null; const person = names.get(choice.person_id);
    const state = person?.submitted_at ? (new Date(choice.updated_at) > new Date(person.submitted_at) ? "제출 후 수정됨" : "제출 완료") : "저장 중";
    return [person?.display_name ?? "", categoryLabels.get(choice.category_key) ?? choice.category_key, image?.original_file_name ?? "", image?.source_rel_path ?? "", (choice.retouch_keys as string[]).map((key) => labels.get(key) ?? key).join(" / "), choice.memo, state, choice.updated_at];
  });
  return csvResponse([["이름", "항목", "원본파일명", "원본경로(source_rel_path)", "보정요청", "메모", "상태", "최종수정시각"], ...rows], `${event.title}-보정작업.csv`);
}
