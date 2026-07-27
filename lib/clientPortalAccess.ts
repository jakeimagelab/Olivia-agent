"use client";

export async function getOrCreatePortalAccessToken(clientId: string, workflowRunId: string): Promise<string> {
  const existing = await fetch(`/api/admin/client-portal/access?clientId=${clientId}&workflowRunId=${workflowRunId}`).then((r) => r.json());
  const activeToken = existing?.activeAccess?.access_token;
  if (activeToken) return activeToken;

  const created = await fetch("/api/admin/client-portal/access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, workflowRunId }),
  }).then((r) => r.json());
  if (!created?.ok) throw new Error(created?.error || "고객 포털을 열 수 없습니다.");
  return created.token as string;
}

export function portalUrlFromToken(token: string): string {
  return `${window.location.origin}/client-portal/access/${token}`;
}
