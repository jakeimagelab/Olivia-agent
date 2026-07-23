import { getSupabaseAdmin } from "@/lib/supabase";

// 팀챗 첨부파일은 스튜디오 대표 Google 계정 하나(chat_drive_connection, id=1 싱글턴)의
// Drive에 저장한다. 앱 자체의 Gmail 연동(app/api/auth/google/*)과 같은 GOOGLE_CLIENT_ID/SECRET을
// 재사용하되, 이 연결은 완전히 별개 목적(drive.file 스코프)이라 토큰을 따로 보관한다.
// googleapis 패키지는 추가하지 않고, 이 앱의 기존 관례(app/api/auth/google/callback/route.ts)와
// 동일하게 raw fetch로 Google REST API를 직접 호출한다.

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ROOT_FOLDER_NAME = "포토클리닉 팀챗";

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(data.error_description || "Google Drive 토큰 갱신 실패");
  return { accessToken: data.access_token as string, expiresIn: (data.expires_in as number) ?? 3600 };
}

async function getDriveAccessToken(): Promise<string> {
  const db = getSupabaseAdmin();
  const { data: connection } = await db.from("chat_drive_connection").select("*").eq("id", 1).maybeSingle();
  if (!connection) throw new Error("Drive 연결이 안 되어 있습니다. 관리자가 /admin/team-chat-settings에서 먼저 연결해야 합니다.");

  const expiresAt = connection.access_token_expires_at ? new Date(connection.access_token_expires_at).getTime() : 0;
  if (connection.access_token && expiresAt - Date.now() > 60_000) {
    return connection.access_token as string;
  }

  const { accessToken, expiresIn } = await refreshAccessToken(connection.refresh_token);
  await db
    .from("chat_drive_connection")
    .update({
      access_token: accessToken,
      access_token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  return accessToken;
}

async function driveFetch(path: string, accessToken: string, init?: RequestInit) {
  const res = await fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Drive API 오류(${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function ensureRootFolder(accessToken: string): Promise<string> {
  const db = getSupabaseAdmin();
  const { data: connection } = await db.from("chat_drive_connection").select("root_folder_id").eq("id", 1).maybeSingle();
  if (connection?.root_folder_id) return connection.root_folder_id;

  const created = await driveFetch("/files", accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: ROOT_FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
  });
  await db.from("chat_drive_connection").update({ root_folder_id: created.id }).eq("id", 1);
  return created.id as string;
}

export async function ensureRoomDriveFolder(roomId: string, roomName: string): Promise<string> {
  const db = getSupabaseAdmin();
  const { data: room } = await db.from("chat_rooms").select("drive_folder_id").eq("id", roomId).maybeSingle();
  if (room?.drive_folder_id) return room.drive_folder_id;

  const accessToken = await getDriveAccessToken();
  const rootFolderId = await ensureRootFolder(accessToken);
  const created = await driveFetch("/files", accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: roomName, mimeType: "application/vnd.google-apps.folder", parents: [rootFolderId] }),
  });
  await db.from("chat_rooms").update({ drive_folder_id: created.id }).eq("id", roomId);
  return created.id as string;
}

// 방에 새 멤버가 추가될 때 그 사람 이메일에 Drive 폴더 접근권한을 준다 — 실패해도(예: 아직
// 폴더가 없거나 Google 쪽 일시 오류) 채팅 자체를 막으면 안 되므로 호출부에서 항상 베스트에포트로 다룬다.
export async function grantRoomDriveAccessForRoom(roomId: string, memberId: string): Promise<void> {
  const db = getSupabaseAdmin();
  const [{ data: room }, { data: member }] = await Promise.all([
    db.from("chat_rooms").select("drive_folder_id").eq("id", roomId).maybeSingle(),
    db.from("chat_members").select("email").eq("id", memberId).maybeSingle(),
  ]);
  if (!room?.drive_folder_id || !member?.email) return;

  const accessToken = await getDriveAccessToken();
  await driveFetch(`/files/${room.drive_folder_id}/permissions`, accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "user", role: "writer", emailAddress: member.email }),
  });
}

// Vercel 서버리스 함수는 요청 바디가 4.5MB로 제한돼 있어 대용량 파일은 우리 서버를 거칠 수 없다.
// 그래서 서버는 Drive의 resumable upload 세션만 열어주고, 브라우저가 그 URL로 파일을 직접 PUT한다.
export async function createResumableUploadSession(params: {
  roomId: string;
  roomName: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}): Promise<string> {
  const folderId = await ensureRoomDriveFolder(params.roomId, params.roomName);
  const accessToken = await getDriveAccessToken();

  const res = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=resumable`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": params.mimeType,
      "X-Upload-Content-Length": String(params.fileSize),
    },
    body: JSON.stringify({ name: params.fileName, parents: [folderId] }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`업로드 세션 생성 실패(${res.status}): ${text.slice(0, 300)}`);
  }
  const uploadUrl = res.headers.get("Location");
  if (!uploadUrl) throw new Error("업로드 URL을 받지 못했습니다.");
  return uploadUrl;
}

// 브라우저가 Drive에 직접 올린 파일이 실제로 이 방의 폴더 안에 있는지 검증한 뒤에만
// chat_attachments에 기록한다 — 그렇지 않으면 다른 방/다른 폴더의 파일 ID를 흉내내서
// 첨부인 척 끼워넣을 수 있다.
export async function verifyAndRecordAttachment(params: {
  roomId: string;
  messageId: string;
  driveFileId: string;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
}): Promise<void> {
  const db = getSupabaseAdmin();
  const { data: room } = await db.from("chat_rooms").select("drive_folder_id").eq("id", params.roomId).maybeSingle();
  const accessToken = await getDriveAccessToken();
  const meta = await driveFetch(`/files/${params.driveFileId}?fields=id,parents,name,mimeType,size`, accessToken);

  const parents: string[] = meta.parents ?? [];
  if (!room?.drive_folder_id || !parents.includes(room.drive_folder_id)) {
    throw new Error("첨부파일이 이 방의 Drive 폴더 안에 없습니다.");
  }

  const { error } = await db.from("chat_attachments").insert({
    message_id: params.messageId,
    room_id: params.roomId,
    drive_file_id: params.driveFileId,
    file_name: params.fileName,
    mime_type: params.mimeType ?? meta.mimeType ?? null,
    size_bytes: params.sizeBytes ?? (meta.size ? Number(meta.size) : null),
  });
  if (error) throw new Error(error.message);
}

export async function getDriveConnectionStatus(): Promise<{ connected: boolean; email: string | null }> {
  const db = getSupabaseAdmin();
  const { data } = await db.from("chat_drive_connection").select("google_email").eq("id", 1).maybeSingle();
  return { connected: Boolean(data), email: data?.google_email ?? null };
}

// 팀 워크스페이스 업무 첨부는 기존 방 폴더/업로드 검증 체계를 그대로 사용한다.
// 기존 채팅 첨부 함수는 변경하지 않고, 업무 테이블 기록만 별도 wrapper로 분리한다.
export async function createTaskAttachmentUploadSession(params: {
  taskId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}): Promise<{ uploadUrl: string; roomId: string }> {
  const db = getSupabaseAdmin();
  const { data: task } = await db
    .from("team_tasks")
    .select("room_id,project_id")
    .eq("id", params.taskId)
    .maybeSingle();
  if (!task) throw new Error("업무를 찾을 수 없습니다.");
  let roomId = task.room_id as string | null;
  if (!roomId && task.project_id) {
    const { data: projectRoom } = await db
      .from("chat_rooms")
      .select("id")
      .eq("project_id", task.project_id)
      .maybeSingle();
    roomId = projectRoom?.id ?? null;
  }
  if (!roomId) throw new Error("결과물을 첨부하려면 업무를 채팅방 또는 프로젝트에 연결해주세요.");
  const { data: room } = await db.from("chat_rooms").select("id,name").eq("id", roomId).maybeSingle();
  if (!room) throw new Error("연결된 채팅방을 찾을 수 없습니다.");
  const uploadUrl = await createResumableUploadSession({
    roomId,
    roomName: room.name,
    fileName: params.fileName,
    mimeType: params.mimeType,
    fileSize: params.fileSize,
  });
  return { uploadUrl, roomId };
}

export async function verifyAndRecordTaskAttachment(params: {
  taskId: string;
  uploadedBy: string;
  driveFileId: string;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
}): Promise<Record<string, unknown>> {
  const db = getSupabaseAdmin();
  const { data: task } = await db
    .from("team_tasks")
    .select("room_id,project_id")
    .eq("id", params.taskId)
    .maybeSingle();
  if (!task) throw new Error("업무를 찾을 수 없습니다.");
  let roomId = task.room_id as string | null;
  if (!roomId && task.project_id) {
    const { data: projectRoom } = await db.from("chat_rooms").select("id").eq("project_id", task.project_id).maybeSingle();
    roomId = projectRoom?.id ?? null;
  }
  if (!roomId) throw new Error("연결된 채팅방을 찾을 수 없습니다.");
  const { data: room } = await db.from("chat_rooms").select("drive_folder_id").eq("id", roomId).maybeSingle();
  const accessToken = await getDriveAccessToken();
  const meta = await driveFetch(`/files/${params.driveFileId}?fields=id,parents,name,mimeType,size`, accessToken);
  if (!room?.drive_folder_id || !(meta.parents ?? []).includes(room.drive_folder_id)) {
    throw new Error("첨부파일이 연결된 업무 폴더 안에 없습니다.");
  }
  const { data: attachment, error } = await db.from("team_task_attachments").insert({
    task_id: params.taskId,
    uploaded_by: params.uploadedBy,
    drive_file_id: params.driveFileId,
    file_name: params.fileName,
    mime_type: params.mimeType ?? meta.mimeType ?? null,
    size_bytes: params.sizeBytes ?? (meta.size ? Number(meta.size) : null),
  }).select("*").single();
  if (error) throw new Error(error.message);
  return attachment;
}
