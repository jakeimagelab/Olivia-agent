#!/usr/bin/env node

import path from "node:path";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

import { ensurePersonSelectDownloadBucket, PERSON_SELECT_DOWNLOAD_BUCKET } from "@/lib/person-select/downloads";
import { PERSON_SELECT_BUCKET } from "@/lib/person-select/server";
import { resolvePersonSelectSourceFile } from "@/lib/person-select/sourceRoots";
import { getSupabaseAdmin } from "@/lib/supabase";

function arg(name: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
function progress(current: number, total: number, message: string) {
  process.stderr.write(`OLIVIA_REMOTE_PROGRESS ${JSON.stringify({ stage: "DELIVERY_DOWNLOAD", current, total, message })}\n`);
}
function safeName(value: string, fallback: string) {
  const next = path.basename(value).normalize("NFC").replace(/[/:]/gu, "_").trim();
  return next || fallback;
}
function uniqueDestination(folder: string, fileName: string, used: Set<string>) {
  const extension = path.extname(fileName);
  const stem = path.basename(fileName, extension);
  let candidate = fileName;
  let suffix = 2;
  while (used.has(path.join(folder, candidate).toLocaleLowerCase("ko-KR"))) candidate = `${stem} (${suffix++})${extension}`;
  used.add(path.join(folder, candidate).toLocaleLowerCase("ko-KR"));
  return path.join(folder, candidate);
}
async function dittoCopy(source: string, destination: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("/usr/bin/ditto", [source, destination], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr || `ditto 종료 코드 ${code}`)));
  });
}
async function createZip(source: string, destination: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("/usr/bin/ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", source, destination], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr || `ditto 종료 코드 ${code}`)));
  });
}

async function main() {
  const eventId = arg("--event-id");
  const personId = arg("--person-id");
  const fingerprint = arg("--fingerprint");
  if (!eventId || !fingerprint) throw new Error("event_id와 다운로드 묶음 식별자가 필요합니다.");
  const db = getSupabaseAdmin();
  const { data: event, error: eventError } = await db.from("person_select_events").select("id,title").eq("id", eventId).single();
  if (eventError || !event) throw new Error(eventError?.message ?? "프로젝트를 찾지 못했습니다.");
  let deliveryQuery = db.from("person_select_deliveries")
    .select("id,display_name,group_label,current_version")
    .eq("event_id", eventId)
    .order("sort_order").order("id");
  deliveryQuery = personId ? deliveryQuery.eq("person_id", personId) : deliveryQuery.is("person_id", null);
  const { data: deliveries, error: deliveryError } = await deliveryQuery;
  if (deliveryError) throw deliveryError;
  if (!deliveries?.length) throw new Error("전달할 보정본이 없습니다.");
  const versions: Array<{ delivery_id: string; version: number; storage_path_original: string | null; source_virtual_path: string | null }> = [];
  for (let index = 0; index < deliveries.length; index += 200) {
    const chunk = deliveries.slice(index, index + 200).map((delivery) => delivery.id);
    const { data, error } = await db.from("person_select_delivery_versions")
      .select("delivery_id,version,storage_path_original,source_virtual_path").in("delivery_id", chunk);
    if (error) throw error;
    versions.push(...(data ?? []));
  }
  const current = new Map(versions.map((version) => [`${version.delivery_id}:${version.version}`, version]));
  const temporary = await mkdtemp(path.join(tmpdir(), "olivia-delivery-download-"));
  const staging = path.join(temporary, safeName(event.title, "보정본"));
  const archive = path.join(temporary, "delivery.zip");
  const used = new Set<string>();
  await mkdir(staging, { recursive: true });
  try {
    for (let index = 0; index < deliveries.length; index += 1) {
      const delivery = deliveries[index];
      const version = current.get(`${delivery.id}:${delivery.current_version}`);
      if (!version) throw new Error(`${delivery.display_name}의 현재 원본 정보를 찾지 못했습니다.`);
      const group = personId || !delivery.group_label ? staging : path.join(staging, safeName(delivery.group_label, "기타"));
      await mkdir(group, { recursive: true });
      const destination = uniqueDestination(group, safeName(delivery.display_name, `${index + 1}.jpg`), used);
      if (version.source_virtual_path) {
        const source = await resolvePersonSelectSourceFile(version.source_virtual_path);
        await stat(source.canonicalPath);
        await dittoCopy(source.canonicalPath, destination);
      } else if (version.storage_path_original) {
        const { data, error } = await db.storage.from(PERSON_SELECT_BUCKET).download(version.storage_path_original);
        if (error || !data) throw new Error(error?.message ?? `${delivery.display_name} 원본을 읽지 못했습니다.`);
        await writeFile(destination, new Uint8Array(await data.arrayBuffer()));
      } else {
        throw new Error(`${delivery.display_name} 원본 위치가 없습니다.`);
      }
      progress(index + 1, deliveries.length, `${index + 1}/${deliveries.length}장 준비`);
    }
    await createZip(staging, archive);
    await ensurePersonSelectDownloadBucket();
    const storagePath = `deliveries/${eventId}/${personId ?? "shared"}/${fingerprint}.zip`;
    const { error: uploadError } = await db.storage.from(PERSON_SELECT_DOWNLOAD_BUCKET)
      .upload(storagePath, await readFile(archive), { contentType: "application/zip", upsert: true });
    if (uploadError) throw uploadError;
    const prefix = `deliveries/${eventId}/${personId ?? "shared"}`;
    const { data: olderArchives } = await db.storage.from(PERSON_SELECT_DOWNLOAD_BUCKET).list(prefix, { limit: 1_000 });
    const stalePaths = (olderArchives ?? [])
      .filter((item) => item.name.endsWith(".zip") && item.name !== `${fingerprint}.zip`)
      .map((item) => `${prefix}/${item.name}`);
    if (stalePaths.length) {
      const { error: cleanupError } = await db.storage.from(PERSON_SELECT_DOWNLOAD_BUCKET).remove(stalePaths);
      if (cleanupError) process.stderr.write(`[delivery-download] 이전 ZIP 정리 실패: ${cleanupError.message}\n`);
    }
    process.stdout.write(`${JSON.stringify({
      ok: true,
      storagePath,
      photoCount: deliveries.length,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
    })}\n`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.env.NODE_ENV !== "test") main().catch((error) => {
  process.stdout.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "보정본 ZIP 준비 실패", stage: "delivery_download" })}\n`);
  process.exitCode = 1;
});
