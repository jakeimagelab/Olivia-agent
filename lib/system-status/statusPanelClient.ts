import type { StatusPanelData } from "./panelTypes";

const STATUS_PANEL_CLIENT_TTL_MS = 15_000;

let cached: { expiresAt: number; data: StatusPanelData } | null = null;
let inFlight: Promise<StatusPanelData> | null = null;

/**
 * 한 OS 화면 안의 여러 위젯이 같은 상태 API를 동시에 호출하지 않게 한다.
 * 서버 캐시와 별개로 브라우저 탭 안에서도 요청 하나만 유지한다.
 */
export function loadStatusPanelData(options: { force?: boolean } = {}) {
  const now = Date.now();
  if (!options.force && cached && cached.expiresAt > now) return Promise.resolve(cached.data);
  if (inFlight) return inFlight;

  inFlight = fetch("/api/olivia-os/status-panel", {
    cache: "no-store",
  }).then(async (response) => {
    const body = await response.json().catch(() => null) as (StatusPanelData & { error?: string }) | null;
    if (!response.ok || !body?.ok) throw new Error(body?.error || "상태를 불러오지 못했습니다.");
    cached = { expiresAt: Date.now() + STATUS_PANEL_CLIENT_TTL_MS, data: body };
    return body;
  }).finally(() => {
    inFlight = null;
  });

  return inFlight;
}

export function clearStatusPanelClientCache() {
  cached = null;
}
