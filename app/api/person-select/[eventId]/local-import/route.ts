import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createUniquePin } from "@/lib/person-select/core";
import { normalizeLoginName } from "@/lib/person-select/folderRules";
import { deriveLocalImportRecord, type PersonSelectImportLayout } from "@/lib/person-select/localImport";
import { readAllPersonSelectRows } from "@/lib/person-select/paging";
import { ensurePersonSelectBucket, PERSON_SELECT_BUCKET } from "@/lib/person-select/server";
import { PERSON_FOLDER_CATEGORY, type PersonSelectCategory } from "@/lib/person-select/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_MANIFEST_FILES = 5_000;
const MAX_THUMB_BYTES = 1_000_000;
const MAX_PREVIEW_BYTES = 3_500_000;

type ManifestItem = { relativePath: string; fileName: string };

function layoutValue(value: unknown): PersonSelectImportLayout | null {
  return value === "school" || value === "person-folders" ? value : null;
}

function parseManifest(value: unknown, layout: PersonSelectImportLayout) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MANIFEST_FILES) {
    throw new Error(`가져올 JPG는 한 번에 1장부터 ${MAX_MANIFEST_FILES.toLocaleString()}장까지 선택할 수 있습니다.`);
  }
  const seen = new Set<string>();
  const items: ManifestItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") throw new Error("사진 목록 형식이 올바르지 않습니다.");
    const item = raw as Record<string, unknown>;
    const relativePath = typeof item.relativePath === "string" ? item.relativePath.normalize("NFC") : "";
    const fileName = typeof item.fileName === "string" ? item.fileName.normalize("NFC") : "";
    const derived = deriveLocalImportRecord(layout, relativePath);
    if (!derived || derived.fileName !== fileName) throw new Error(`안전하지 않거나 지원하지 않는 사진 경로입니다: ${relativePath || fileName || "빈 경로"}`);
    if (seen.has(derived.relativePath)) continue;
    seen.add(derived.relativePath);
    items.push({ relativePath: derived.relativePath, fileName: derived.fileName });
  }
  if (!items.length) throw new Error("가져올 JPG가 없습니다.");
  return items;
}

export async function PUT(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId } = await context.params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const layout = layoutValue(body?.layout);
  if (!layout) return Response.json({ ok: false, error: "사진 폴더 방식을 확인해 주세요." }, { status: 400 });

  let items: ManifestItem[];
  try { items = parseManifest(body?.files, layout); }
  catch (error) { return Response.json({ ok: false, error: error instanceof Error ? error.message : "사진 목록을 확인해 주세요." }, { status: 400 }); }

  const db = getSupabaseAdmin();
  const [{ data: event, error: eventError }, existingRows, { data: peopleRows }] = await Promise.all([
    db.from("person_select_events").select("id,categories").eq("id", eventId).maybeSingle(),
    readAllPersonSelectRows((from, to) => db.from("person_select_images")
      .select("id,source_rel_path")
      .eq("event_id", eventId)
      .order("id")
      .range(from, to)),
    db.from("person_select_people").select("id,display_name,login_name,pin_code").eq("event_id", eventId),
  ]);
  if (eventError || !event) return Response.json({ ok: false, error: eventError?.message || "행사를 찾을 수 없습니다." }, { status: 404 });

  await ensurePersonSelectBucket();
  const people = new Map((peopleRows ?? []).map((person) => [person.login_name, person]));
  const usedPins = new Set((peopleRows ?? []).map((person) => person.pin_code).filter((pin): pin is string => typeof pin === "string"));
  const ownerNames = [...new Set(items.flatMap((item) => {
    const derived = deriveLocalImportRecord(layout, item.relativePath);
    return derived?.ownerName ? [derived.ownerName] : [];
  }))];
  const createdPeople: { name: string; pin: string }[] = [];
  for (const displayName of ownerNames) {
    const loginName = normalizeLoginName(displayName);
    if (people.has(loginName)) continue;
    const pin = createUniquePin(usedPins);
    usedPins.add(pin);
    const { data: person, error } = await db.from("person_select_people")
      .insert({ event_id: eventId, display_name: displayName, login_name: loginName, pin_code: pin })
      .select("id,display_name,login_name,pin_code")
      .single();
    if (error || !person) return Response.json({ ok: false, error: error?.message || `${displayName} 등록에 실패했습니다.` }, { status: 500 });
    people.set(loginName, person);
    createdPeople.push({ name: displayName, pin });
  }

  const eventUpdate: Record<string, unknown> = { source_layout: layout, updated_at: new Date().toISOString() };
  if (layout === "person-folders") {
    const categories = (Array.isArray(event.categories) ? event.categories : []) as PersonSelectCategory[];
    if (!categories.some((category) => category.key === PERSON_FOLDER_CATEGORY.key)) {
      const { count } = await db.from("person_select_images").select("id", { count: "exact", head: true }).eq("event_id", eventId);
      eventUpdate.categories = (count ?? 0) === 0 ? [PERSON_FOLDER_CATEGORY] : [...categories, PERSON_FOLDER_CATEGORY];
    }
  }
  const { error: updateError } = await db.from("person_select_events").update(eventUpdate).eq("id", eventId);
  if (updateError) return Response.json({ ok: false, error: updateError.message }, { status: 500 });

  const existingPaths = new Set((existingRows ?? []).map((row) => String(row.source_rel_path)));
  return Response.json({
    ok: true,
    peopleCount: people.size,
    createdPeople,
    existingPaths: items.map((item) => item.relativePath).filter((path) => existingPaths.has(path)),
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId } = await context.params;
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ ok: false, error: "사진 업로드 내용을 읽지 못했습니다." }, { status: 400 });
  const layout = layoutValue(form.get("layout"));
  const relativePath = String(form.get("relativePath") ?? "").normalize("NFC");
  const sortOrder = Number(form.get("sortOrder"));
  const sourceWidth = Number(form.get("sourceWidth"));
  const sourceHeight = Number(form.get("sourceHeight"));
  const thumb = form.get("thumb");
  const preview = form.get("preview");
  if (!layout || !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder >= MAX_MANIFEST_FILES) return Response.json({ ok: false, error: "사진 업로드 정보가 올바르지 않습니다." }, { status: 400 });
  const derived = deriveLocalImportRecord(layout, relativePath);
  if (!derived) return Response.json({ ok: false, error: "안전하지 않거나 지원하지 않는 사진 경로입니다." }, { status: 400 });
  if (!(thumb instanceof File) || !(preview instanceof File) || thumb.type !== "image/jpeg" || preview.type !== "image/jpeg") return Response.json({ ok: false, error: "썸네일과 미리보기는 JPEG 형식이어야 합니다." }, { status: 400 });
  if (thumb.size <= 0 || thumb.size > MAX_THUMB_BYTES || preview.size <= 0 || preview.size > MAX_PREVIEW_BYTES) return Response.json({ ok: false, error: "썸네일 또는 미리보기 파일 크기를 확인해 주세요." }, { status: 413 });

  const [thumbBuffer, previewBuffer] = await Promise.all([Buffer.from(await thumb.arrayBuffer()), Buffer.from(await preview.arrayBuffer())]);
  const [thumbMetadata, previewMetadata] = await Promise.all([sharp(thumbBuffer).metadata(), sharp(previewBuffer).metadata()]);
  if (thumbMetadata.format !== "jpeg" || previewMetadata.format !== "jpeg"
    || !thumbMetadata.width || !thumbMetadata.height || Math.max(thumbMetadata.width, thumbMetadata.height) > 480
    || !previewMetadata.width || !previewMetadata.height || Math.max(previewMetadata.width, previewMetadata.height) > 1600) {
    return Response.json({ ok: false, error: "썸네일 또는 미리보기 해상도가 올바르지 않습니다." }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const [{ data: event }, { data: existing }] = await Promise.all([
    db.from("person_select_events").select("id").eq("id", eventId).maybeSingle(),
    db.from("person_select_images").select("id").eq("event_id", eventId).eq("source_rel_path", derived.relativePath).maybeSingle(),
  ]);
  if (!event) return Response.json({ ok: false, error: "행사를 찾을 수 없습니다." }, { status: 404 });
  if (existing) return Response.json({ ok: true, skipped: true, imageId: existing.id });

  let ownerPersonId: string | null = null;
  if (derived.ownerName) {
    const { data: person } = await db.from("person_select_people")
      .select("id")
      .eq("event_id", eventId)
      .eq("login_name", normalizeLoginName(derived.ownerName))
      .limit(1)
      .maybeSingle();
    if (!person) return Response.json({ ok: false, error: `${derived.ownerName} 등록 정보를 찾지 못했습니다.` }, { status: 409 });
    ownerPersonId = person.id;
  }

  const imageId = randomUUID();
  const thumbPath = `${eventId}/${imageId}_thumb.jpg`;
  const previewPath = `${eventId}/${imageId}_preview.jpg`;
  const storage = db.storage.from(PERSON_SELECT_BUCKET);
  const [thumbUpload, previewUpload] = await Promise.all([
    storage.upload(thumbPath, thumbBuffer, { contentType: "image/jpeg" }),
    storage.upload(previewPath, previewBuffer, { contentType: "image/jpeg" }),
  ]);
  const uploaded = [
    ...(!thumbUpload.error ? [thumbPath] : []),
    ...(!previewUpload.error ? [previewPath] : []),
  ];
  if (thumbUpload.error || previewUpload.error) {
    await storage.remove(uploaded);
    return Response.json({ ok: false, error: thumbUpload.error?.message || previewUpload.error?.message || "사진 저장에 실패했습니다." }, { status: 500 });
  }

  const { error: insertError } = await db.from("person_select_images").insert({
    id: imageId,
    event_id: eventId,
    category_key: derived.category,
    owner_person_id: ownerPersonId,
    owner_group: derived.ownerGroup,
    original_file_name: derived.fileName,
    source_rel_path: derived.relativePath,
    thumb_path: thumbPath,
    preview_path: previewPath,
    width: Number.isInteger(sourceWidth) && sourceWidth > 0 && sourceWidth <= 100_000 ? sourceWidth : previewMetadata.width,
    height: Number.isInteger(sourceHeight) && sourceHeight > 0 && sourceHeight <= 100_000 ? sourceHeight : previewMetadata.height,
    sort_order: sortOrder,
  });
  if (insertError) {
    await storage.remove(uploaded);
    return Response.json({ ok: false, error: insertError.message }, { status: 500 });
  }
  return Response.json({ ok: true, imageId });
}
