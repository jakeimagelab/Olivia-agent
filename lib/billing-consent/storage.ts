import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { BillingConsentRow } from "./server";
import { BILLING_CONSENT_BUCKET } from "./server";

const MIME_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function uploadBillingConsentEvidence(input: {
  consentId: string;
  file: File;
}) {
  const extension = MIME_EXTENSION[input.file.type];
  if (!extension) throw new Error("PNG, JPG, WEBP 이미지만 첨부할 수 있습니다.");
  if (input.file.size < 1 || input.file.size > 10 * 1024 * 1024) {
    throw new Error("근거 이미지는 파일당 10MB까지 올릴 수 있습니다.");
  }
  const path = `${input.consentId}/evidence/${randomUUID()}.${extension}`;
  const db = getSupabaseAdmin();
  const { error } = await db.storage.from(BILLING_CONSENT_BUCKET).upload(path, input.file, {
    contentType: input.file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}

export async function uploadBillingConsentArtifact(input: {
  path: string;
  data: Buffer;
  contentType: string;
}) {
  const db = getSupabaseAdmin();
  const { error } = await db.storage.from(BILLING_CONSENT_BUCKET).upload(input.path, input.data, {
    contentType: input.contentType,
    upsert: false,
  });
  if (error) throw new Error(error.message);
}

export async function removeBillingConsentArtifacts(paths: string[]) {
  if (!paths.length) return;
  const db = getSupabaseAdmin();
  const { error } = await db.storage.from(BILLING_CONSENT_BUCKET).remove(paths);
  if (error) throw new Error(error.message);
}

export async function downloadBillingConsentArtifact(path: string) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.storage.from(BILLING_CONSENT_BUCKET).download(path);
  if (error) throw new Error(error.message);
  return Buffer.from(await data.arrayBuffer());
}

export async function loadBillingConsentEvidenceImages(consent: BillingConsentRow) {
  const evidence = Array.isArray(consent.evidence) ? consent.evidence : [];
  return Promise.all(evidence.flatMap((item) => {
    const path = typeof item.storagePath === "string" ? item.storagePath : "";
    const mimeType = typeof item.mimeType === "string" ? item.mimeType : "image/jpeg";
    if (item.kind !== "image" || !path) return [];
    return [downloadBillingConsentArtifact(path).then((buffer) => ({
      label: typeof item.label === "string" ? item.label : "첨부 근거",
      dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`,
    }))];
  }));
}
