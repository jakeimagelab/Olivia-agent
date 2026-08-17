import { getSupabaseAdmin } from "@/lib/supabase";
import { fuzzyIncludes, fuzzyNameSearch } from "@/lib/olivia/nameSearch";
import { resolveWorkflowRunId } from "@/lib/workflowRunLookup";
import { logActivity } from "@/lib/activityLogger";

// 견적서/계약서/콘티를 고객 등록·프로젝트 생성 전에 미리 만들면(예: 독립 /quote, /conti 페이지),
// 병원명을 정확히 일치하게 타이핑하지 못하면(오타, 지점명 표기 차이 등) lib/clientLookup.ts의
// resolveClientId가 "정확히 일치 + 후보 유일"할 때만 연결하는 안전장치 때문에 client_id/
// workflow_run_id가 비어 저장된다. 화면(각 빌더의 "저장된 목록")엔 보이는데 워크플로우 완료
// 처리나 정합성 점검에서는 영원히 못 찾는 문제가 생긴다 — 2026-08-17 실제 재현 사례(더힐피부과
// 신사점/신사본점 콘티) 참고. 이 도구는 사용자가 채팅으로 그 자료를 실제 고객에 직접 연결하게
// 한다 — 사람이 명시적으로 확인한 연결이라 resolveClientId의 엄격한 자동매칭 제약을 적용하지
// 않는다(견적번호 충돌 버그 같은 자동 오판 위험이 없음).
const DOCUMENT_TABLE: Record<string, string> = {
  quote: "quotes",
  contract: "contracts",
  conti: "conti_saves",
};

// quotes/contracts는 created_at을 쓰는데 conti_saves만 saved_at이다 — 처음에 created_at으로
// 통일해서 짰다가 conti_saves에서 컬럼이 없어 조회 자체가 조용히 빈 배열로 실패했다(2026-08-17,
// "페이버요양병원 콘티를 연결해줘"가 실제 재현된 데이터인데도 못 찾는 버그로 발견).
const DOCUMENT_TIMESTAMP_COLUMN: Record<string, string> = {
  quote: "created_at",
  contract: "created_at",
  conti: "saved_at",
};

const DOCUMENT_LABEL: Record<string, string> = {
  quote: "견적서",
  contract: "계약서",
  conti: "콘티",
};

export async function linkDocumentToClient(input: any) {
  const documentType = String(input?.documentType || "").trim();
  const table = DOCUMENT_TABLE[documentType];
  const label = DOCUMENT_LABEL[documentType];
  if (!table) {
    return { action: "done", message: `"${input?.documentType}"는 지원하는 자료 종류가 아니에요. 견적서·계약서·콘티 중 하나로 다시 말씀해주세요.` };
  }

  const query = String(input?.documentQuery || "").trim();
  if (!query) {
    return { action: "done", message: "어떤 자료를 연결할지 저장할 때 썼던 병원명이나 제목을 알려주세요." };
  }

  const db = getSupabaseAdmin();

  // fuzzyNameSearch(ilike)는 "저장된 값이 query를 포함"하는 방향만 본다 — 채팅에서 사용자가
  // "OOO 콘티를 OOO에 연결해줘"처럼 documentQuery에 "콘티"/"견적서" 같은 군더더기 단어를
  // 함께 넘기면(모델이 그대로 옮겨 적는 경우가 흔함) 정작 저장된 병원명(예: "페이버요양병원")엔
  // 없는 단어가 섞여 한쪽 방향 ilike로는 아예 안 걸린다 — 양방향(포함하거나 포함되거나)으로 본다.
  // select("*")를 쓰고 정렬은 JS에서 한다 — 테이블마다 타임스탬프 컬럼명이 달라(quotes/
  // contracts는 created_at, conti_saves는 saved_at) 동적 문자열을 .select()/.order()에
  // 그대로 넣으면 supabase-js의 정적 타입 추론이 깨진다.
  const timestampColumn = DOCUMENT_TIMESTAMP_COLUMN[documentType];
  const { data: unlinked, error: fetchError } = await db
    .from(table)
    .select("*")
    .is("client_id", null)
    .limit(200);
  if (fetchError) {
    return { action: "done", message: `자료를 조회하다 오류가 났어요: ${fetchError.message}` };
  }
  const rows = (unlinked ?? []) as Record<string, any>[];
  rows.sort((a, b) => new Date(b[timestampColumn] ?? 0).getTime() - new Date(a[timestampColumn] ?? 0).getTime());
  const candidates = rows.filter(
    (row) => fuzzyIncludes(row.hospital_name, query) || fuzzyIncludes(query, row.hospital_name)
  ) as { id: string; hospital_name: string }[];

  if (candidates.length === 0) {
    return {
      action: "done",
      message: `"${query}"와(과) 일치하는, 고객 미연결 ${label}를 못 찾았어요. 이미 연결돼 있거나, 저장된 적이 없거나, 다른 이름으로 저장됐을 수 있어요.`,
    };
  }
  if (candidates.length > 1) {
    const list = candidates.map((c) => `- ${c.hospital_name}`).join("\n");
    return {
      action: "done",
      message: `"${query}"와(과) 일치하는 미연결 ${label}가 여러 개예요. 어떤 걸 말씀하시는지 정확한 이름으로 다시 알려주세요:\n${list}`,
    };
  }

  // 문서 쪽(candidates)은 여러 개면 되묻는데 고객 쪽은 fuzzyNameSearchOne으로 하나만 뽑아
  // 조용히 확정하고 있었다 — "더힐피부과"처럼 짧게 말하면 실제로 비슷한 이름의 다른 고객이
  // 있을 때 엉뚱한 고객에 연결될 위험이 있다(문서를 잘못 고르는 것보다 더 나쁘다: 자료가
  // 통째로 다른 병원 소유가 됨). 고객 쪽도 똑같이 유일할 때만 확정한다.
  const clientName = String(input?.clientName || "").trim();
  const clientMatches = await fuzzyNameSearch<{ id: string; hospital_name: string }>({
    db, table: "clients", nameColumn: "hospital_name", select: "id, hospital_name", query: clientName, limit: 5,
  });
  if (clientMatches.length === 0) {
    return { action: "done", message: `"${clientName}" 고객을 찾을 수 없어요. 고객관리에 등록된 정확한 병원명으로 다시 말씀해주세요.` };
  }
  if (clientMatches.length > 1) {
    const list = clientMatches.map((c) => `- ${c.hospital_name}`).join("\n");
    return {
      action: "done",
      message: `"${clientName}"와(과) 일치하는 고객이 여러 명이에요. 어떤 고객인지 정확한 이름으로 다시 알려주세요:\n${list}`,
    };
  }
  const client = clientMatches[0];

  const document = candidates[0];
  const workflowRunId = await resolveWorkflowRunId(db, undefined, client.id);
  const { error } = await db.from(table)
    .update({ client_id: client.id, workflow_run_id: workflowRunId, hospital_name: client.hospital_name })
    .eq("id", document.id);
  if (error) {
    return { action: "done", message: `연결 처리에 실패했어요: ${error.message}` };
  }

  await logActivity("link_document_to_client", client.hospital_name, {
    documentType, documentId: document.id, previousHospitalName: document.hospital_name, workflowRunId,
  });

  const workflowNote = workflowRunId
    ? " 이제 워크플로우에서도 인식돼요."
    : " 다만 이 고객은 아직 진행 중인 프로젝트가 없어서, 프로젝트가 시작되면 그때 자동으로 잡힐 거예요.";

  return {
    action: "done",
    message: `✅ "${document.hospital_name}" ${label}를 **${client.hospital_name}**에 연결했어요.${workflowNote}`,
    clientName: client.hospital_name,
    documentType,
    documentId: document.id,
    workflowRunId,
  };
}
