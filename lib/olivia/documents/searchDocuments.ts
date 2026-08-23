import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fuzzyIncludes } from "@/lib/olivia/nameSearch";
import type { OliviaDocumentRef, OliviaDocumentType } from "./types";

export type SearchDocumentsInput = {
  query?: string;
  clientId?: string | null;
  clientName?: string | null;
  projectId?: string | null;
  types?: OliviaDocumentType[];
  limit?: number;
  // 현재 채팅이 보고 있는 고객/프로젝트 — 랭킹 1순위(현재 선택과 정확히 일치)를 계산하는 데만 쓴다.
  currentClientId?: string | null;
  currentProjectId?: string | null;
};

const ALL_SEARCHABLE_TYPES: OliviaDocumentType[] = ["quote", "contract", "storyboard", "memo", "gallery"];
const CANDIDATE_LIMIT = 200;
const DEFAULT_LIMIT = 10;

type Row = Record<string, any>;

function pick(row: Row, key: string): string | undefined {
  const value = row?.[key];
  return typeof value === "string" && value ? value : undefined;
}

async function resolveClient(db: SupabaseClient, clientId?: string | null, clientName?: string | null) {
  if (clientId) {
    const { data } = await db.from("clients").select("id, hospital_name").eq("id", clientId).maybeSingle();
    if (data) return { id: data.id as string, name: data.hospital_name as string };
  }
  if (clientName) {
    const { data } = await db.from("clients").select("id, hospital_name").ilike("hospital_name", `%${clientName}%`).limit(1).maybeSingle();
    if (data) return { id: data.id as string, name: data.hospital_name as string };
  }
  return null;
}

// clientId가 안 풀렸는데(등록 안 된 고객명 등) clientNameFilter가 있으면 hospital_name ilike로
// 최소한의 구조적 필터라도 건다 — 안 그러면 "모르는 고객명"이 그냥 "필터 없음"이 되어 버려서
// 전체 문서가 다 나오는(=존재하지 않는 고객인데 결과가 나오는) 오류가 생긴다.
function applyClientFilter(q: any, clientId: string | undefined, clientNameFilter: string | null | undefined) {
  if (clientId) return q.eq("client_id", clientId);
  if (clientNameFilter) return q.ilike("hospital_name", `%${clientNameFilter}%`);
  return q;
}

async function fetchQuotes(db: SupabaseClient, clientId?: string, projectId?: string | null, clientNameFilter?: string | null): Promise<OliviaDocumentRef[]> {
  let q = db.from("quotes").select("id, quote_number, title, hospital_name, client_id, workflow_run_id, status, created_at, updated_at").order("updated_at", { ascending: false }).limit(CANDIDATE_LIMIT);
  q = applyClientFilter(q, clientId, clientNameFilter);
  if (projectId) q = q.eq("workflow_run_id", projectId);
  const { data } = await q;
  return (data || []).map((row: Row): OliviaDocumentRef => ({
    id: `quote:${row.id}`,
    type: "quote",
    title: pick(row, "title") || `${row.hospital_name || "고객"} 견적서${row.quote_number ? ` (${row.quote_number})` : ""}`,
    clientId: row.client_id ?? null,
    clientName: row.hospital_name ?? null,
    projectId: row.workflow_run_id ?? null,
    sourceType: "quotes",
    sourceId: row.id,
    status: row.status ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? row.created_at ?? null,
    searchableText: [row.title, row.hospital_name, row.quote_number].filter(Boolean).join(" "),
    route: row.client_id ? `/clients?clientId=${row.client_id}` : null,
  }));
}

async function fetchContracts(db: SupabaseClient, clientId?: string, projectId?: string | null, clientNameFilter?: string | null): Promise<OliviaDocumentRef[]> {
  let q = db.from("contracts").select("id, quote_number, hospital_name, client_id, workflow_run_id, signature_data_url, created_at, updated_at").order("updated_at", { ascending: false }).limit(CANDIDATE_LIMIT);
  q = applyClientFilter(q, clientId, clientNameFilter);
  if (projectId) q = q.eq("workflow_run_id", projectId);
  const { data } = await q;
  return (data || []).map((row: Row): OliviaDocumentRef => ({
    id: `contract:${row.id}`,
    type: "contract",
    title: `${row.hospital_name || "고객"} 계약서${row.quote_number ? ` (${row.quote_number})` : ""}`,
    clientId: row.client_id ?? null,
    clientName: row.hospital_name ?? null,
    projectId: row.workflow_run_id ?? null,
    sourceType: "contracts",
    sourceId: row.id,
    status: row.signature_data_url ? "서명완료" : "서명대기",
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? row.created_at ?? null,
    searchableText: [row.hospital_name, row.quote_number].filter(Boolean).join(" "),
    route: row.client_id ? `/clients?clientId=${row.client_id}` : null,
  }));
}

async function fetchConti(db: SupabaseClient, clientId?: string, projectId?: string | null, clientNameFilter?: string | null): Promise<OliviaDocumentRef[]> {
  let q = db.from("conti_saves").select("id, hospital_name, title, client_id, workflow_run_id, saved_at").order("saved_at", { ascending: false }).limit(CANDIDATE_LIMIT);
  q = applyClientFilter(q, clientId, clientNameFilter);
  if (projectId) q = q.eq("workflow_run_id", projectId);
  const { data } = await q;
  return (data || []).map((row: Row): OliviaDocumentRef => ({
    id: `conti:${row.id}`,
    type: "storyboard",
    title: pick(row, "title") || `${row.hospital_name || "고객"} 콘티`,
    clientId: row.client_id ?? null,
    clientName: row.hospital_name ?? null,
    projectId: row.workflow_run_id ?? null,
    sourceType: "conti_saves",
    sourceId: row.id,
    status: null,
    createdAt: row.saved_at ?? null,
    updatedAt: row.saved_at ?? null,
    searchableText: [row.title, row.hospital_name].filter(Boolean).join(" "),
    route: row.client_id ? `/clients?clientId=${row.client_id}` : null,
  }));
}

async function fetchMemos(db: SupabaseClient, clientId?: string, resolvedClientName?: string | null): Promise<OliviaDocumentRef[]> {
  // consultation_memos엔 hospital_name 컬럼이 없다(hospital_id FK만 있음) — 고객 스코프 없이
  // 부르면(clientId 없음) 전체를 다 훑는 게 비효율적이라 이 타입은 clientId가 있을 때만 조회한다.
  if (!clientId) return [];
  const { data } = await db.from("consultation_memos").select("id, hospital_id, summary, raw_memo, created_at").eq("hospital_id", clientId).order("created_at", { ascending: false }).limit(CANDIDATE_LIMIT);
  return (data || []).map((row: Row): OliviaDocumentRef => ({
    id: `memo:${row.id}`,
    type: "memo",
    title: pick(row, "summary") || String(row.raw_memo || "").slice(0, 40) || "상담 메모",
    clientId: row.hospital_id ?? null,
    clientName: resolvedClientName ?? null,
    projectId: null,
    sourceType: "consultation_memos",
    sourceId: row.id,
    status: null,
    createdAt: row.created_at ?? null,
    updatedAt: row.created_at ?? null,
    searchableText: [row.summary, row.raw_memo].filter(Boolean).join(" "),
    route: row.hospital_id ? `/clients?clientId=${row.hospital_id}` : null,
  }));
}

async function fetchGalleries(db: SupabaseClient, clientId?: string, projectId?: string | null, clientNameFilter?: string | null): Promise<OliviaDocumentRef[]> {
  const [photoRes, selectRes] = await Promise.all([
    (() => {
      let q = db.from("photo_galleries").select("id, hospital_name, client_id, workflow_run_id, gallery_type, created_at").order("created_at", { ascending: false }).limit(CANDIDATE_LIMIT);
      q = applyClientFilter(q, clientId, clientNameFilter);
      if (projectId) q = q.eq("workflow_run_id", projectId);
      return q;
    })(),
    (() => {
      let q = db.from("select_galleries").select("id, title, hospital_name, client_id, workflow_run_id, created_at").order("created_at", { ascending: false }).limit(CANDIDATE_LIMIT);
      q = applyClientFilter(q, clientId, clientNameFilter);
      if (projectId) q = q.eq("workflow_run_id", projectId);
      return q;
    })(),
  ]);
  const photos = (photoRes.data || []).map((row: Row): OliviaDocumentRef => ({
    id: `photo_gallery:${row.id}`,
    type: "gallery",
    title: `${row.hospital_name || "고객"} 사진 갤러리`,
    clientId: row.client_id ?? null,
    clientName: row.hospital_name ?? null,
    projectId: row.workflow_run_id ?? null,
    sourceType: "photo_galleries",
    sourceId: row.id,
    status: row.gallery_type ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.created_at ?? null,
    searchableText: [row.hospital_name, row.gallery_type].filter(Boolean).join(" "),
    route: row.client_id ? `/clients?clientId=${row.client_id}` : null,
  }));
  const selects = (selectRes.data || []).map((row: Row): OliviaDocumentRef => ({
    id: `select_gallery:${row.id}`,
    type: "gallery",
    title: pick(row, "title") || `${row.hospital_name || "고객"} 셀렉 갤러리`,
    clientId: row.client_id ?? null,
    clientName: row.hospital_name ?? null,
    projectId: row.workflow_run_id ?? null,
    sourceType: "select_galleries",
    sourceId: row.id,
    status: null,
    createdAt: row.created_at ?? null,
    updatedAt: row.created_at ?? null,
    searchableText: [row.title, row.hospital_name].filter(Boolean).join(" "),
    route: `/select-galleries/${row.id}`,
  }));
  return [...photos, ...selects];
}

const FETCHERS: Partial<Record<OliviaDocumentType, (db: SupabaseClient, clientId?: string, projectId?: string | null, clientName?: string | null) => Promise<OliviaDocumentRef[]>>> = {
  quote: (db, clientId, projectId, clientName) => fetchQuotes(db, clientId, projectId, clientName),
  contract: (db, clientId, projectId, clientName) => fetchContracts(db, clientId, projectId, clientName),
  storyboard: (db, clientId, projectId, clientName) => fetchConti(db, clientId, projectId, clientName),
  memo: (db, clientId, _projectId, clientName) => fetchMemos(db, clientId, clientName),
  gallery: (db, clientId, projectId, clientName) => fetchGalleries(db, clientId, projectId, clientName),
};

function scoreDocument(doc: OliviaDocumentRef, params: {
  query: string;
  clientName?: string | null;
  currentClientId?: string | null;
  currentProjectId?: string | null;
}): number {
  let score = 0;
  if (params.currentClientId && doc.clientId && doc.clientId === params.currentClientId) score += 1000;
  if (params.currentProjectId && doc.projectId && doc.projectId === params.currentProjectId) score += 500;
  if (params.clientName) {
    const name = (doc.clientName || "").trim();
    if (name && name.toLowerCase() === params.clientName.trim().toLowerCase()) score += 200;
    else if (fuzzyIncludes(doc.clientName, params.clientName)) score += 100;
  }
  if (params.query) {
    if ((doc.title || "").trim().toLowerCase() === params.query.trim().toLowerCase()) score += 80;
    else if (fuzzyIncludes(doc.title, params.query)) score += 50;
    else if (fuzzyIncludes(doc.searchableText, params.query)) score += 15;
  }
  return score;
}

// 채팅의 search_documents 도구와 /admin/tools 문서함 검색 UI(app/api/documents/search)가 반드시
// 이 함수 하나만 거치도록 한다 — 검색 로직이 두 곳으로 갈라지지 않게 하는 게 요구사항의 핵심이다.
// 새 통합 인덱스 테이블을 만들지 않고, 기존 테이블들을 매 요청마다 병렬 조회해서 합친다(요청서
// 6·48절 — "가능한 경우 기존 DB 그대로 사용", 마이그레이션/백필 없이 진행).
export async function searchDocuments(input: SearchDocumentsInput): Promise<OliviaDocumentRef[]> {
  const db = getSupabaseAdmin();
  const query = String(input.query || "").trim();
  const limit = Math.min(50, Math.max(1, input.limit || DEFAULT_LIMIT));
  const types = input.types?.length ? input.types : ALL_SEARCHABLE_TYPES;

  const resolvedClient = await resolveClient(db, input.clientId, input.clientName);
  const clientId = resolvedClient?.id;
  const clientName = resolvedClient?.name || input.clientName || undefined;
  const projectId = input.projectId || undefined;

  const results = await Promise.all(
    types
      .map((type) => FETCHERS[type])
      .filter((fetcher): fetcher is NonNullable<typeof fetcher> => Boolean(fetcher))
      .map((fetcher) => fetcher(db, clientId, projectId, clientName)),
  );

  let docs = results.flat();

  // 검색어가 있으면 제목/고객명/본문 요약 중 하나라도 걸리는 것만 남긴다(전체 본문을 매번 읽지
  // 않도록 이미 select에서 무거운 jsonb 컬럼은 애초에 가져오지 않는다).
  if (query) {
    docs = docs.filter((doc) =>
      fuzzyIncludes(doc.title, query) ||
      fuzzyIncludes(doc.clientName, query) ||
      fuzzyIncludes(doc.searchableText, query),
    );
  }

  const scored = docs
    .map((doc) => ({ doc, score: scoreDocument(doc, { query, clientName, currentClientId: input.currentClientId, currentProjectId: input.currentProjectId }) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const at = a.doc.updatedAt ? new Date(a.doc.updatedAt).getTime() : 0;
      const bt = b.doc.updatedAt ? new Date(b.doc.updatedAt).getTime() : 0;
      return bt - at;
    });

  const top = scored.slice(0, limit).map((entry) => entry.doc);
  await attachProjectNames(db, top);
  return top;
}

// 문서함 표에 "프로젝트" 컬럼을 보여주려고 workflow_runs.project_name을 붙인다 — 최종 결과(limit
// 적용 후)에만 한 번 배치 조회한다(검색 도중 매 후보마다 조회하지 않음).
async function attachProjectNames(db: SupabaseClient, docs: OliviaDocumentRef[]) {
  const projectIds = [...new Set(docs.map((doc) => doc.projectId).filter((id): id is string => Boolean(id)))];
  if (!projectIds.length) return;
  const { data } = await db.from("workflow_runs").select("id, project_name").in("id", projectIds);
  const names = new Map((data || []).map((row: Row) => [row.id, row.project_name]));
  for (const doc of docs) {
    if (doc.projectId && names.has(doc.projectId)) doc.projectName = names.get(doc.projectId) || undefined;
  }
}
