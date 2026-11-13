import type {
  PersonSelectDeliveryDownloadFile,
  PersonSelectDeliveryResponse,
} from "@/components/person-select/personSelectDeliveryTypes";

export async function readPersonSelectDeliveryJson<T>(response: Response) {
  const body = await response.json().catch(() => ({})) as { error?: string } & Partial<T>;
  if (!response.ok || !body) throw new Error(body.error || "요청을 처리하지 못했습니다.");
  return body as T;
}

export function loadPersonSelectDeliveries(apiBase: string) {
  return fetch(`${apiBase}/deliveries`, { cache: "no-store" })
    .then((response) => readPersonSelectDeliveryJson<PersonSelectDeliveryResponse>(response));
}

export function updatePersonSelectDelivery({
  apiBase,
  deliveryId,
  action,
  memo,
}: {
  apiBase: string;
  deliveryId: string;
  action: "approve" | "request_revision";
  memo: string;
}) {
  return fetch(`${apiBase}/deliveries/${deliveryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, memo }),
  }).then(readPersonSelectDeliveryJson);
}

export function submitPersonSelectDeliveries(
  apiBase: string,
  action: "submit_revisions" | "finalize",
) {
  return fetch(`${apiBase}/deliveries/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  }).then(readPersonSelectDeliveryJson);
}

export function loadPersonSelectDeliveryDownloadUrls(apiBase: string) {
  return fetch(`${apiBase}/deliveries/download-urls`, { cache: "no-store" })
    .then((response) => readPersonSelectDeliveryJson<{
      ok: true;
      files: PersonSelectDeliveryDownloadFile[];
    }>(response));
}
