import { getSupabaseAdmin } from "@/lib/supabase";
import { fuzzyNameSearch } from "@/lib/olivia/nameSearch";

// components/conti/ContiBuilder.tsx의 "이전 콘티 불러오기" 모달이 보여주는 것과 같은 conti_saves
// 테이블을 채팅으로 조회한다 — 기존엔 create_conti(새로 만들기)만 있고 기존 저장분을 확인하는
// 도구가 없어서, 이미 저장된 콘티가 있어도 채팅이 "찾지 못했다"고 잘못 답하는 버그가 있었다
// (2026-08-14 사용자 리포트: "더힐피부과신사본점" 콘티가 실제로 있는데 채팅이 못 찾음).
export async function getContiStatus(input: any) {
  const db = getSupabaseAdmin();
  const query = String(input.hospitalName || "").trim();
  if (!query) {
    return { action: "done", message: "어느 병원의 콘티를 찾아드릴까요?" };
  }

  const matches = await fuzzyNameSearch<any>({
    db, table: "conti_saves", nameColumn: "hospital_name",
    select: "id, hospital_name, title, specialties, saved_at, result",
    query,
    limit: 5,
  });

  if (!matches.length) {
    return {
      action: "done",
      message: `⚠️ **${query}**로 저장된 콘티를 찾지 못했어요. /conti 화면의 "이전 콘티 불러오기" 목록에서 다른 이름으로 저장돼 있는지 직접 확인해주세요.`,
    };
  }

  if (matches.length > 1) {
    const list = matches
      .map((m) => `- ${m.hospital_name} (${new Date(m.saved_at).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })} 저장)`)
      .join("\n");
    return { action: "done", message: `"${query}"와 비슷한 콘티가 여러 개 있어요:\n${list}\n\n어느 병원인지 정확한 이름으로 다시 물어봐주세요.` };
  }

  const m = matches[0];
  const shotCount = Array.isArray(m.result?.conti) ? m.result.conti.length : 0;
  const checklistCount = Array.isArray(m.result?.checklist) ? m.result.checklist.length : 0;
  const saved = new Date(m.saved_at).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
  return {
    action: "done",
    message: `🎬 **${m.hospital_name}** 콘티가 저장돼 있어요 — ${saved} 저장, 컷 ${shotCount}개 · 체크리스트 ${checklistCount}개.\n/conti 화면에서 "이전 콘티 불러오기"를 누르면 바로 열 수 있어요.`,
    contiId: m.id,
    hospitalName: m.hospital_name,
    shotCount,
    checklistCount,
  };
}
