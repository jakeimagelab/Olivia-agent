import { DEFAULT_PRICING } from "@/lib/ai-trust/costs";
import type { GeoRadarOverview } from "./types";

const previewRegion = { id: "preview-eonju", name: "언주역 부근", region_type: "radius" as const, center_lat: 37.507287, center_lng: 127.033868, radius_m: 1000, districts: [], region_terms: ["언주역", "논현동", "신논현", "선릉", "역삼"] };
const previewProject = { id: "preview-project", client_id: "preview-glory", project_name: "글로리의원 GEO 레이더", client_hospital_name: "글로리의원", region: "언주역 부근", region_id: previewRegion.id, scope_label: "언주역 부근 1km", department: "피부과", treatments: ["울쎄라", "써마지", "세르프", "리쥬란"], status: "COMPLETED", created_at: "2026-11-11T00:00:00.000Z", region_config: previewRegion };

export const GEO_RADAR_PREVIEW: GeoRadarOverview = {
  ok: true,
  clients: [{ id: "preview-glory", hospital_name: "글로리의원", specialty: "피부과", address: "서울 강남구 봉은사로 207 KJ빌딩 3층" }],
  projects: [previewProject],
  regions: [
    previewRegion,
    { id: "preview-gangnam", name: "강남권", region_type: "districts", center_lat: 37.514575, center_lng: 127.049555, radius_m: null, districts: ["강남구", "서초구", "송파구"], region_terms: ["강남", "신사", "압구정", "청담", "신논현", "선릉", "잠실"], boundary_geojson_path: "/geo/seoul-south-east-districts.geojson" },
    { id: "preview-seoul", name: "서울", region_type: "city", center_lat: 37.566535, center_lng: 126.977969, radius_m: null, districts: ["서울특별시"], region_terms: ["서울"], boundary_geojson_path: "/geo/seoul-boundary.geojson" },
  ],
  providers: [
    { provider: "openai", label: "ChatGPT", status: "CONNECTED", envKey: "OPENAI_API_KEY", note: "연결됨" },
    { provider: "gemini", label: "Gemini", status: "NOT_CONNECTED", envKey: "GEMINI_API_KEY", note: "키 없음" },
    { provider: "anthropic", label: "Claude", status: "CONNECTED", envKey: "ANTHROPIC_API_KEY", note: "연결됨" },
    { provider: "perplexity", label: "Perplexity", status: "NOT_CONNECTED", envKey: "PERPLEXITY_API_KEY", note: "키 없음" },
  ],
  review_count: 0, jobs: [], costs: [],
  pricing: DEFAULT_PRICING,
  budgets: { project_monthly_usd: 20, global_monthly_usd: 100, warning_ratio: 0.8 },
  map: { connected: false }, clinic_sources: { hira: false, kakao: false },
};

const previewHospitals = [
  ["A피부과", 0.41, 0.33, 3], ["B의원", 0.3, 0.21, 3], ["C피부과의원", 0.22, 0.12, 2],
  ["D클리닉", 0.15, 0.08, 2], ["글로리의원", 0.08, 0, 1],
] as const;

export const GEO_RADAR_PREVIEW_SUMMARY = {
  ok: true,
  project: previewProject,
  prompts: Array.from({ length: 12 }, (_, index) => ({ id: `preview-prompt-${index + 1}`, source_keyword: "미리보기", source: "GEO_RADAR_V1", intent: index % 3 === 0 ? "LOCATION" : index % 3 === 1 ? "RECOMMENDATION" : "TRUST", question: `언주역 부근 피부과 추천 질문 ${index + 1}`, language: "ko", region: "언주역 부근", department: "피부과", demand_score: null })),
  runs: [{ id: "preview-run", status: "COMPLETED", providers: ["openai", "anthropic"], repeat_count: 3, question_count: 12, completed_requests: 72, total_requests: 72, created_at: "2026-11-11T00:00:00.000Z" }],
  responses: [
    { id: "preview-response-1", provider: "openai", prompt_id: "preview-prompt-1", question: "언주역 부근 피부과 추천", raw_response: "여러 공개 출처를 확인하면 A피부과, B의원, 글로리의원 등을 비교할 수 있습니다. 의료진 정보와 접근성을 함께 확인하세요.", source_urls: ["https://example.com/a"], executed_at: "2026-11-11T00:00:00.000Z" },
    { id: "preview-response-2", provider: "anthropic", prompt_id: "preview-prompt-2", question: "언주역 피부과 비교", raw_response: "A피부과와 C피부과의원은 공개 정보가 비교적 충분하며 글로리의원은 의료진·FAQ 정보 보강이 필요합니다.", source_urls: ["https://example.com/b"], executed_at: "2026-11-11T00:01:00.000Z" },
  ],
  hospitals: previewHospitals.map(([name], index) => ({ id: `preview-hospital-${index + 1}`, canonical_name: name })),
  consensusTop10: previewHospitals.map(([name, mentionRate, top3Rate, consensus], index) => ({ id: `preview-consensus-${index + 1}`, hospital_id: `preview-hospital-${index + 1}`, mention_rate: mentionRate, top3_rate: top3Rate, provider_consensus: consensus, hospital: { id: `preview-hospital-${index + 1}`, canonical_name: name } })),
  mentions: [
    { id: "preview-mention-1", response_id: "preview-response-1", hospital_id: "preview-hospital-1", raw_name: "A피부과", rank: 1, mention_context: "RECOMMENDED", hospital: { id: "preview-hospital-1", canonical_name: "A피부과" } },
    { id: "preview-mention-2", response_id: "preview-response-1", hospital_id: "preview-hospital-5", raw_name: "글로리의원", rank: 3, mention_context: "COMPARISON", hospital: { id: "preview-hospital-5", canonical_name: "글로리의원" } },
    { id: "preview-mention-3", response_id: "preview-response-2", hospital_id: "preview-hospital-3", raw_name: "C피부과의원", rank: 2, mention_context: "RECOMMENDED", hospital: { id: "preview-hospital-3", canonical_name: "C피부과의원" } },
  ],
  gaps: [{ schema_key: "의료진 정보 · FAQ", gap: 34, rank: 1 }],
  strategies: [{ id: "preview-strategy", title: "의료진 근거 구조화", summary: "진료 철학, 경력, 시술 판단 기준을 질문별로 정리합니다." }],
  shootPlan: [{ id: "preview-shoot", title: "상담 판단 장면", description: "원장이 환자 상태를 확인하고 시술 여부를 설명하는 장면" }],
  projectClinics: [
    { is_client: true, clinic: { id: "preview-clinic-client", canonical_name: "글로리의원", address: "서울 강남구 봉은사로 207", latitude: 37.507287, longitude: 127.033868, mention_rate: 0.08, rank: 9, is_client: true } },
    { is_client: false, clinic: { id: "preview-clinic-a", canonical_name: "A피부과", address: "서울 강남구 논현동", latitude: 37.5102, longitude: 127.0298, mention_rate: 0.41, rank: 1 } },
  ],
  reviewQueue: [], jobs: [], costs: [], history: [], historyConsensus: [],
  dataSources: [
    { source_key: "hira", source_name: "건강보험심사평가원", status: "CONNECTED", message: "병원 목록 기준", checked_at: "2026-11-11T00:00:00.000Z" },
    { source_key: "provider-api", source_name: "AI Provider API", status: "API_REQUIRED", message: "환경변수 연결 필요", checked_at: "2026-11-11T00:00:00.000Z" },
  ],
};

