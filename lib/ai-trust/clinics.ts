export type ClinicCandidate = {
  canonical_name: string;
  normalized_name: string;
  clinic_type: string | null;
  department_code: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  district: string | null;
  website: string | null;
  phone: string | null;
  source: "hira" | "kakao" | "manual" | "merged";
  source_id: string | null;
  source_payload: Record<string, unknown>;
};

export type ClinicSyncScope = {
  centerLat: number;
  centerLng: number;
  radiusM: number;
  departmentCode?: string;
  keyword?: string;
};

export function normalizeClinicName(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, "").replace(/[()（）·.,\-]/g, "");
}

export function clinicDedupKey(clinic: Pick<ClinicCandidate, "normalized_name" | "address" | "phone">) {
  return [clinic.normalized_name, normalizeAddress(clinic.address), normalizePhone(clinic.phone)].join("|");
}

export function mergeClinicCandidates(primary: ClinicCandidate[], supplements: ClinicCandidate[]) {
  const byKey = new Map(primary.map((clinic) => [clinicDedupKey(clinic), clinic]));
  const byNameAddress = new Map(primary.map((clinic) => [`${clinic.normalized_name}|${normalizeAddress(clinic.address)}`, clinic]));
  const byNamePhone = new Map(primary.filter((clinic) => normalizePhone(clinic.phone)).map((clinic) => [`${clinic.normalized_name}|${normalizePhone(clinic.phone)}`, clinic]));
  for (const supplement of supplements) {
    const exact = byKey.get(clinicDedupKey(supplement))
      || byNameAddress.get(`${supplement.normalized_name}|${normalizeAddress(supplement.address)}`)
      || byNamePhone.get(`${supplement.normalized_name}|${normalizePhone(supplement.phone)}`);
    if (exact) {
      exact.website ||= supplement.website;
      exact.phone ||= supplement.phone;
      exact.latitude ??= supplement.latitude;
      exact.longitude ??= supplement.longitude;
      exact.source_payload = { ...exact.source_payload, kakao: supplement.source_payload };
      continue;
    }
    byKey.set(clinicDedupKey(supplement), supplement);
  }
  return Array.from(byKey.values());
}

export async function fetchHiraClinics(scope: ClinicSyncScope): Promise<ClinicCandidate[]> {
  const serviceKey = process.env.DATA_GO_KR_SERVICE_KEY?.trim();
  if (!serviceKey) throw new Error("DATA_GO_KR_SERVICE_KEY가 없습니다.");
  const url = new URL("https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList");
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("xPos", String(scope.centerLng));
  url.searchParams.set("yPos", String(scope.centerLat));
  url.searchParams.set("radius", String(Math.min(scope.radiusM, 20_000)));
  url.searchParams.set("dgsbjtCd", scope.departmentCode || "14");
  url.searchParams.set("numOfRows", "1000");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("_type", "json");
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HIRA 병원 목록 조회 실패 (${res.status})`);
  const data = await res.json() as Record<string, unknown>;
  const response = data.response as Record<string, unknown> | undefined;
  const body = response?.body as Record<string, unknown> | undefined;
  const itemsRoot = body?.items as Record<string, unknown> | undefined;
  const itemValue = itemsRoot?.item;
  const rows = Array.isArray(itemValue) ? itemValue : itemValue ? [itemValue] : [];
  return rows.map((row) => toHiraClinic(row as Record<string, unknown>)).filter((row): row is ClinicCandidate => Boolean(row));
}

export async function fetchKakaoClinics(scope: ClinicSyncScope): Promise<ClinicCandidate[]> {
  const apiKey = process.env.KAKAO_REST_API_KEY?.trim();
  if (!apiKey) return [];
  const all: ClinicCandidate[] = [];
  for (let page = 1; page <= 3; page += 1) {
    const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
    url.searchParams.set("query", scope.keyword || "피부과");
    url.searchParams.set("category_group_code", "HP8");
    url.searchParams.set("x", String(scope.centerLng));
    url.searchParams.set("y", String(scope.centerLat));
    url.searchParams.set("radius", String(Math.min(scope.radiusM, 20_000)));
    url.searchParams.set("page", String(page));
    url.searchParams.set("size", "15");
    url.searchParams.set("sort", "distance");
    const res = await fetch(url, { headers: { Authorization: `KakaoAK ${apiKey}` }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`카카오 병원 목록 조회 실패 (${res.status})`);
    const data = await res.json() as { documents?: Array<Record<string, string>>; meta?: { is_end?: boolean } };
    all.push(...(data.documents || []).map(toKakaoClinic));
    if (data.meta?.is_end) break;
  }
  return all;
}

function toHiraClinic(row: Record<string, unknown>): ClinicCandidate | null {
  const name = String(row.yadmNm || "").trim();
  const address = String(row.addr || "").trim();
  if (!name || !address) return null;
  return {
    canonical_name: name,
    normalized_name: normalizeClinicName(name),
    clinic_type: stringOrNull(row.clCdNm),
    department_code: "14",
    address,
    latitude: numberOrNull(row.YPos),
    longitude: numberOrNull(row.XPos),
    district: districtFromAddress(address),
    website: stringOrNull(row.hospUrl),
    phone: stringOrNull(row.telno),
    source: "hira",
    source_id: stringOrNull(row.ykiho),
    source_payload: row,
  };
}

function toKakaoClinic(row: Record<string, string>): ClinicCandidate {
  const name = (row.place_name || "").trim();
  const address = (row.road_address_name || row.address_name || "").trim();
  return {
    canonical_name: name,
    normalized_name: normalizeClinicName(name),
    clinic_type: row.category_name || null,
    department_code: null,
    address,
    latitude: numberOrNull(row.y),
    longitude: numberOrNull(row.x),
    district: districtFromAddress(address),
    website: row.place_url || null,
    phone: row.phone || null,
    source: "kakao",
    source_id: row.id || null,
    source_payload: row,
  };
}

function normalizeAddress(value: string) {
  return value.normalize("NFKC").replace(/^서울특별시/, "서울").replace(/\s+/g, "").replace(/[()（）]/g, "");
}
function normalizePhone(value: string | null) { return (value || "").replace(/\D/g, ""); }
function districtFromAddress(address: string) { return address.match(/(?:서울(?:특별시)?\s+)?([가-힣]+구)\b/)?.[1] || null; }
function stringOrNull(value: unknown) { const text = String(value || "").trim(); return text || null; }
function numberOrNull(value: unknown) { const number = Number(value); return Number.isFinite(number) ? number : null; }
