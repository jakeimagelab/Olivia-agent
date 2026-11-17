export type PersonSelectDeliveryItem = {
  id: string;
  linked_image_id?: string | null;
  group_label: string | null;
  display_name: string;
  current_version: number;
  status: "pending" | "revision_requested" | "revised" | "approved";
  customer_memo: string;
  preview_url: string;
  width: number | null;
  height: number | null;
  uploaded_at: string | null;
};

export type PersonSelectDeliveryResponse = {
  ok: true;
  event: { title: string; retentionDays: number };
  download: { mode: "storage" | "nas"; photoCount: number };
  viewer: { displayName: string; canFinalize: boolean };
  access: {
    state: "none" | "reviewing" | "revision_sent" | "approved";
    approvedAt: string | null;
    downloadedAt: string | null;
    expiresAt: string | null;
    expired: boolean;
    downloadAvailable: boolean;
  };
  items: PersonSelectDeliveryItem[];
};

export type PersonSelectDeliveryDownloadFile = {
  id: string;
  fileName: string;
  url: string;
};

export type PersonSelectDeliveryNasDownload = {
  ok: true;
  job: {
    id: string;
    status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELED";
    progress?: { current?: number; total?: number; message?: string } | null;
    downloadUrl?: string;
    fileName?: string;
    error?: string;
  };
};

export function personSelectDeliveryStatusLabel(status: PersonSelectDeliveryItem["status"]) {
  if (status === "approved") return "확인";
  if (status === "revision_requested") return "수정 요청";
  if (status === "revised") return "수정됨";
  return "확인 전";
}
