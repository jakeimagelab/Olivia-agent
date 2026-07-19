import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeSearchText } from "@/lib/olivia/nameSearch";

// 견적/계약/메일 등 새 레코드를 저장할 때 병원명으로 clients.id를 자동 연결하기 위한 조회.
// 챗봇 검색(fuzzyNameSearchOne)과 달리 이 값은 곧바로 DB에 저장되므로 부분일치가 아니라
// "공백/대소문자 무시 후 정확히 일치 + 후보가 유일"할 때만 연결한다.
// 동명이인(같은 이름의 병원이 여러 건)이거나 매칭이 없으면 null — 잘못 연결하는 것보다 안전하다.
export async function resolveClientId(
  db: SupabaseClient,
  hospitalName: string | null | undefined
): Promise<string | null> {
  const name = String(hospitalName ?? "").trim();
  if (!name) return null;

  const target = normalizeSearchText(name);
  const { data } = await db.from("clients").select("id, hospital_name");
  const matches = (data ?? []).filter((c: any) => normalizeSearchText(c.hospital_name) === target);
  return matches.length === 1 ? matches[0].id : null;
}
