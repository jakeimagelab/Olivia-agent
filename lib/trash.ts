import type { SupabaseClient } from "@supabase/supabase-js";

export const TRASH_RETENTION_DAYS = 30;

export type TrashSourceType =
  | "consultation_memo"
  | "calendar_task"
  | "client"
  | "mailing"
  | "conti_save"
  | "conti_drawing"
  | "video_conti"
  | "reward_product"
  | "trend_competitor"
  | "olivia_chat";

type RecordValue = Record<string, unknown>;

type SourceConfig = {
  label: string;
  table: string;
  title: (row: RecordValue) => string;
  preview: (row: RecordValue) => string;
  assets?: (row: RecordValue) => string[];
  multiple?: boolean;
};

const text = (value: unknown) => typeof value === "string" ? value : "";
const clipped = (value: unknown, length = 120) => text(value).replace(/\s+/g, " ").trim().slice(0, length);

export const TRASH_SOURCES: Record<TrashSourceType, SourceConfig> = {
  consultation_memo: {
    label: "메모",
    table: "consultation_memos",
    title: row => text(row.title) || clipped(row.summary, 60) || clipped(row.raw_memo, 60) || "제목 없는 메모",
    preview: row => clipped(row.raw_memo || row.summary),
    assets: row => [row.canvas_path, row.ai_image_path, row.audio_path]
      .filter((v): v is string => typeof v === "string" && Boolean(v))
      .map(path => `consultation-assets:${path}`),
  },
  calendar_task: {
    label: "캘린더 일정",
    table: "calendar_tasks",
    title: row => text(row.title) || "제목 없는 일정",
    preview: row => clipped([row.date, row.time, row.memo].filter(Boolean).join(" · ")),
  },
  client: {
    label: "고객",
    table: "clients",
    title: row => text(row.hospital_name) || text(row.name) || "이름 없는 고객",
    preview: row => clipped([row.contact_name, row.phone, row.email].filter(Boolean).join(" · ")),
  },
  mailing: {
    label: "메일",
    table: "mailing_queue",
    title: row => text(row.subject) || "제목 없는 메일",
    preview: row => clipped([row.to_email, row.body].filter(Boolean).join(" · ")),
  },
  conti_save: {
    label: "저장 콘티",
    table: "conti_saves",
    title: row => text(row.title) || text(row.hospital_name) || "제목 없는 콘티",
    preview: row => clipped(row.hospital_name),
  },
  conti_drawing: {
    label: "콘티 드로잉",
    table: "storage.objects",
    title: row => `${text(row.hospital) || "병원"} 드로잉`,
    preview: () => "콘티 현장 드로잉 이미지",
  },
  video_conti: {
    label: "영상 콘티",
    table: "video_conti",
    title: row => text(row.title) || text(row.hospital_name) || "제목 없는 영상 콘티",
    preview: row => clipped(row.bgm_filename || row.status),
    assets: row => [row.bgm_storage_path]
      .filter((v): v is string => typeof v === "string" && Boolean(v))
      .map(path => `video-conti-bgm:${path}`),
  },
  reward_product: {
    label: "리워드 상품",
    table: "reward_products",
    title: row => text(row.name) || "이름 없는 상품",
    preview: row => clipped([row.category, row.description].filter(Boolean).join(" · ")),
  },
  trend_competitor: {
    label: "트렌드 경쟁사",
    table: "trend_competitors",
    title: row => text(row.hospital_name) || "이름 없는 경쟁사",
    preview: row => clipped([row.industry, row.instagram_handle, row.homepage_url].filter(Boolean).join(" · ")),
  },
  olivia_chat: {
    label: "Olivia 대화",
    table: "olivia_chat_messages",
    title: () => "Olivia 대화 기록",
    preview: row => clipped(Array.isArray(row.records) ? (row.records[0] as RecordValue | undefined)?.content : row.content),
    multiple: true,
  },
};

export type TrashItem = {
  id: string;
  source_type: TrashSourceType;
  source_label: string;
  source_table: string;
  source_id: string | null;
  title: string;
  preview: string;
  payload: RecordValue;
  asset_paths: string[];
  deleted_at: string;
  expires_at: string;
};

export async function moveRecordToTrash(
  db: SupabaseClient,
  sourceType: TrashSourceType,
  id: string,
): Promise<TrashItem> {
  const config = TRASH_SOURCES[sourceType];
  if (!config || config.multiple || config.table === "storage.objects") throw new Error("지원하지 않는 휴지통 이동 방식입니다.");

  const { data: row, error: readError } = await db.from(config.table).select("*").eq("id", id).maybeSingle();
  if (readError) throw readError;
  if (!row) throw new Error("삭제할 데이터를 찾을 수 없습니다.");

  const { data: item, error: trashError } = await db.from("trash_items").insert({
    source_type: sourceType,
    source_label: config.label,
    source_table: config.table,
    source_id: id,
    title: config.title(row),
    preview: config.preview(row),
    payload: row,
    asset_paths: config.assets?.(row) ?? [],
  }).select("*").single();
  if (trashError) throw trashError;

  const { error: deleteError } = await db.from(config.table).delete().eq("id", id);
  if (deleteError) {
    await db.from("trash_items").delete().eq("id", item.id);
    throw deleteError;
  }
  return item as TrashItem;
}

export async function moveAllRecordsToTrash(
  db: SupabaseClient,
  sourceType: "olivia_chat",
): Promise<TrashItem | null> {
  const config = TRASH_SOURCES[sourceType];
  const { data: rows, error: readError } = await db.from(config.table).select("*").order("created_at", { ascending: true });
  if (readError) throw readError;
  if (!rows?.length) return null;
  const payload = { records: rows };
  const { data: item, error: trashError } = await db.from("trash_items").insert({
    source_type: sourceType,
    source_label: config.label,
    source_table: config.table,
    source_id: null,
    title: config.title(payload),
    preview: config.preview(payload),
    payload,
  }).select("*").single();
  if (trashError) throw trashError;

  const { error: deleteError } = await db.from(config.table).delete().not("id", "is", null);
  if (deleteError) {
    await db.from("trash_items").delete().eq("id", item.id);
    throw deleteError;
  }
  return item as TrashItem;
}

export async function createStorageTrashItem(
  db: SupabaseClient,
  sourceType: "conti_drawing",
  payload: RecordValue,
  assetPaths: string[],
): Promise<TrashItem> {
  const config = TRASH_SOURCES[sourceType];
  const { data, error } = await db.from("trash_items").insert({
    source_type: sourceType,
    source_label: config.label,
    source_table: config.table,
    source_id: text(payload.path) || null,
    title: config.title(payload),
    preview: config.preview(payload),
    payload,
    asset_paths: assetPaths,
  }).select("*").single();
  if (error) throw error;
  return data as TrashItem;
}

export async function restoreTrashItem(db: SupabaseClient, item: TrashItem): Promise<void> {
  const config = TRASH_SOURCES[item.source_type];
  if (!config) throw new Error("지원하지 않는 휴지통 항목입니다.");

  if (item.source_type === "conti_drawing") {
    const bucket = text(item.payload.bucket);
    const originalPath = text(item.payload.path);
    const trashPath = text(item.payload.trash_path);
    if (!bucket || !originalPath || !trashPath) throw new Error("드로잉 복원 정보가 없습니다.");
    const { error } = await db.storage.from(bucket).move(trashPath, originalPath);
    if (error) throw error;
  } else if (config.multiple) {
    const records = Array.isArray(item.payload.records) ? item.payload.records : [];
    if (!records.length) throw new Error("복원할 대화가 없습니다.");
    const { error } = await db.from(config.table).insert(records);
    if (error) throw error;
  } else {
    if (item.source_id) {
      const { data: conflict } = await db.from(config.table).select("id").eq("id", item.source_id).maybeSingle();
      if (conflict) throw new Error("같은 ID의 데이터가 이미 있어 복원할 수 없습니다.");
    }
    const { error } = await db.from(config.table).insert(item.payload);
    if (error) throw error;
  }

  const { error: clearError } = await db.from("trash_items").delete().eq("id", item.id);
  if (clearError) throw clearError;
}

export async function permanentlyDeleteTrashItem(db: SupabaseClient, item: TrashItem): Promise<void> {
  const paths = Array.isArray(item.asset_paths) ? item.asset_paths : [];
  const grouped = new Map<string, string[]>();
  for (const asset of paths) {
    const separator = asset.indexOf(":");
    if (separator <= 0) continue;
    const bucket = asset.slice(0, separator);
    const path = asset.slice(separator + 1);
    if (!bucket || !path) continue;
    grouped.set(bucket, [...(grouped.get(bucket) ?? []), path]);
  }
  for (const [bucket, bucketPaths] of grouped) {
    const { error } = await db.storage.from(bucket).remove(bucketPaths);
    if (error) throw error;
  }
  const { error } = await db.from("trash_items").delete().eq("id", item.id);
  if (error) throw error;
}
