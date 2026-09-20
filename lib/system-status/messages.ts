import type { SystemStatusGroup } from "./types";

export const SYSTEM_STATUS_GROUP_LABELS: Record<SystemStatusGroup, string> = {
  cloud: "클라우드",
  mac_studio: "맥스튜디오",
  database: "데이터베이스",
};

export const SYSTEM_STATUS_GUIDANCE = {
  hermesOffline: "Vercel에서 Hermes 서버에 도달하지 못합니다. Hermes 서버와 공개 Tunnel 주소를 확인하세요.",
  hermesPrivateUrl: "HERMES_BASE_URL이 사설 주소입니다. Cloudflare Tunnel 같은 공개 HTTPS 주소로 교체하세요.",
  hermesUrlMissing: "Vercel 환경변수 HERMES_BASE_URL을 설정하세요.",
  legacyEngine: "Hermes를 사용할 예정이면 OLIVIA_AGENT_ENGINE을 hermes로 설정하세요.",
  mcpDisconnected: "맥스튜디오에서 `hermes mcp list`로 등록 여부를 확인하고, 없으면 Olivia의 `/api/hermes/mcp`를 등록하세요. 인증 키는 HERMES_TOOL_SHARED_SECRET과 같아야 합니다.",
  mcpSignalUnavailable: "시스템 진단 migration을 적용한 뒤 Hermes MCP 연결을 다시 확인하세요.",
  workerOffline: "Mac Studio의 Olivia Worker와 Remote Bridge가 실행 중인지 확인하세요.",
  workerMissing: "Mac Studio Worker를 한 번 실행해 서버에 heartbeat를 보내세요.",
  workstationNotMounted: "Mac Studio에서 Workstation 볼륨이 마운트되어 있는지 확인하세요.",
  workstationPermission: "시스템 설정 → 개인정보 보호 및 보안 → 전체 디스크 접근 권한에서 OliviaWorker.app 권한을 확인하세요.",
  agentstationNotMounted: "Mac Studio에서 Agentstation 볼륨이 마운트되어 있는지 확인하세요.",
  agentstationPermission: "시스템 설정 → 개인정보 보호 및 보안 → 전체 디스크 접근 권한에서 OliviaWorker.app 권한을 확인하세요.",
  workerDiagnosticsMissing: "Worker가 마운트·접근 상태를 보고하도록 최신 Remote Bridge 설정을 적용하세요.",
  watcherMissing: "Mac Studio의 Photo Storage Watcher 실행 상태와 상태 보고 설정을 확인하세요.",
  databaseUnavailable: "Supabase 연결과 service role 환경변수를 확인하세요.",
  requiredTableMissing: (table: string) => `${table} 테이블을 만드는 Supabase migration을 적용하세요.`,
  envMissing: (name: string) => `Vercel 환경변수 ${name}을 설정하세요. 값은 이 진단 결과에 노출되지 않습니다.`,
} as const;
