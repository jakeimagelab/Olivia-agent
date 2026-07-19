import type { SupabaseClient } from "@supabase/supabase-js";
import { buildNextAction, createStepTasks, ensureStepRun, logAgent } from "@/lib/workflowAutomation";
import { createEventDeduplicationKey, emitOliviaEventSafely } from "@/lib/olivia/events";
import { generateShareToken, getFileExpiresAt } from "@/lib/selectGallery";
import { validateOliviaCrudRequest } from "@/lib/olivia/crud/validation";
import {
  OliviaCrudError,
  type OliviaCrudDomain,
  type OliviaCrudExecutionResult,
  type OliviaCrudOperation,
  type OliviaCrudRequest,
  type OliviaCrudTarget,
} from "@/lib/olivia/crud/types";

type Row = Record<string, any>;

const TARGETS: Record<OliviaCrudDomain, { table: string; nameColumns: string[]; naturalColumns?: string[] }> = {
  client: { table: "clients", nameColumns: ["hospital_name"] },
  workflow: { table: "workflow_runs", nameColumns: ["client_name", "project_name"] },
  memo: { table: "consultation_memos", nameColumns: ["title"] },
  calendar: { table: "calendar_tasks", nameColumns: ["title"], naturalColumns: ["date"] },
  quote: { table: "quotes", nameColumns: ["hospital_name", "title"], naturalColumns: ["quote_number"] },
  contract: { table: "contracts", nameColumns: ["hospital_name"], naturalColumns: ["quote_number"] },
  conti: { table: "conti_saves", nameColumns: ["hospital_name", "title"] },
  photo_gallery: { table: "photo_galleries", nameColumns: ["hospital_name"] },
  select_gallery: { table: "select_galleries", nameColumns: ["hospital_name", "title"] },
  review: { table: "client_reviews", nameColumns: ["writer_name"] },
  mail_draft: { table: "mailing_queue", nameColumns: ["hospital_name", "subject"] },
  agent_task: { table: "agent_tasks", nameColumns: ["title"] },
};

function dbError(error: { message?: string } | null, fallback: string): never {
  throw new OliviaCrudError(error?.message || fallback, "DATABASE_ERROR");
}

function uniqueRows(rows: Row[]) {
  return [...new Map(rows.map((row) => [String(row.id), row])).values()];
}

async function findRows(db: SupabaseClient, table: string, columns: string[], value: string) {
  const exactResults = await Promise.all(columns.map((column) => db.from(table).select("*").eq(column, value).limit(6)));
  const exactError = exactResults.find((result) => result.error)?.error;
  if (exactError) dbError(exactError, `${table} 조회에 실패했습니다.`);
  const exact = uniqueRows(exactResults.flatMap((result) => result.data ?? []));
  if (exact.length) return exact;

  const safeValue = value.replaceAll("%", "").replaceAll("_", "").trim();
  const partialResults = await Promise.all(columns.map((column) => db.from(table).select("*").ilike(column, `%${safeValue}%`).limit(6)));
  const partialError = partialResults.find((result) => result.error)?.error;
  if (partialError) dbError(partialError, `${table} 조회에 실패했습니다.`);
  return uniqueRows(partialResults.flatMap((result) => result.data ?? []));
}

async function resolveTarget(db: SupabaseClient, domain: OliviaCrudDomain, target: OliviaCrudTarget | undefined) {
  if (!target) throw new OliviaCrudError("수정할 대상이 필요합니다.", "INVALID_INPUT");
  const config = TARGETS[domain];

  if (target.id) {
    const { data, error } = await db.from(config.table).select("*").eq("id", target.id).maybeSingle();
    if (error) dbError(error, "수정 대상을 조회하지 못했습니다.");
    if (!data) throw new OliviaCrudError("수정할 대상을 찾지 못했습니다.", "TARGET_NOT_FOUND", { id: target.id });
    return data as Row;
  }

  const value = target.naturalKey || target.name;
  const columns = target.naturalKey && config.naturalColumns?.length ? config.naturalColumns : config.nameColumns;
  if (!value) throw new OliviaCrudError("수정할 대상의 이름이나 식별값이 필요합니다.", "INVALID_INPUT");
  const rows = await findRows(db, config.table, columns, value);
  if (rows.length === 0) throw new OliviaCrudError(`"${value}"에 해당하는 대상을 찾지 못했습니다.`, "TARGET_NOT_FOUND");
  if (rows.length > 1) {
    throw new OliviaCrudError(`"${value}"에 해당하는 대상이 여러 개입니다. ID를 선택해주세요.`, "AMBIGUOUS_TARGET", {
      candidates: rows.slice(0, 6).map((row) => ({ id: row.id, name: row.hospital_name || row.client_name || row.title || row.subject || row.quote_number })),
    });
  }
  return rows[0];
}

async function resolveClient(db: SupabaseClient, clientId?: unknown, hospitalName?: unknown) {
  if (typeof clientId === "string" && clientId) {
    const { data } = await db.from("clients").select("id,hospital_name,contact_name,email").eq("id", clientId).maybeSingle();
    if (data) return data as Row;
  }
  if (typeof hospitalName === "string" && hospitalName.trim()) {
    const rows = await findRows(db, "clients", ["hospital_name"], hospitalName.trim());
    if (rows.length === 1) return rows[0];
    if (rows.length > 1) throw new OliviaCrudError(`"${hospitalName}" 고객이 여러 명입니다. 고객 ID를 선택해주세요.`, "AMBIGUOUS_TARGET");
  }
  return null;
}

function quoteNumber() {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now).replaceAll("-", "");
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(now).replaceAll(":", "");
  return `Q-${date}-${time}`;
}

async function createRecord(db: SupabaseClient, domain: OliviaCrudDomain, data: Row) {
  if (domain === "client") {
    const duplicates = await findRows(db, "clients", ["hospital_name"], data.hospitalName);
    if (duplicates.length) throw new OliviaCrudError(`"${data.hospitalName}" 고객이 이미 존재합니다. 기존 고객을 수정해주세요.`, "INVALID_INPUT", { candidates: duplicates.map((row) => row.id) });
    const { data: client, error } = await db.from("clients").insert({
      hospital_name: data.hospitalName,
      contact_name: data.contactName || null,
      phone: data.phone || null,
      email: data.email || null,
      specialty: data.specialty || null,
      memo: data.memo || null,
      original_photos_link: data.originalPhotosLink || null,
      retouched_photos_link: data.retouchedPhotosLink || null,
    }).select("*").single();
    if (error || !client) dbError(error, "고객 생성에 실패했습니다.");

    const firstStep = "consult_meeting";
    const { data: run, error: runError } = await db.from("workflow_runs").insert({
      client_id: client.id,
      client_name: data.hospitalName,
      project_name: `${data.hospitalName} 촬영 프로젝트`,
      current_step_key: firstStep,
      next_action: buildNextAction(firstStep),
      status: "active",
      started_at: new Date().toISOString(),
    }).select("*").single();
    if (!runError && run?.id) {
      await ensureStepRun(db, run.id, firstStep, "in_progress");
      await createStepTasks(db, run.id, firstStep);
    }
    return { row: client as Row, clientId: client.id, workflowRunId: run?.id ?? null };
  }

  if (domain === "workflow") {
    const client = await resolveClient(db, data.clientId, data.clientName);
    if (!client && !data.clientName) throw new OliviaCrudError("워크플로우를 연결할 고객이 필요합니다.", "INVALID_INPUT");
    const firstStep = data.currentStepKey || "consult_meeting";
    const { data: row, error } = await db.from("workflow_runs").insert({
      client_id: client?.id || data.clientId || null,
      project_id: data.projectId || null,
      template_id: "11111111-1111-1111-1111-111111111111",
      client_name: client?.hospital_name || data.clientName,
      project_name: data.projectName || `${client?.hospital_name || data.clientName} 촬영 프로젝트`,
      manager_name: data.managerName || "",
      contact_name: data.contactName || client?.contact_name || "",
      contact_email: data.contactEmail || client?.email || "",
      shoot_date: data.shootDate || null,
      current_step_key: firstStep,
      next_action: data.nextAction || buildNextAction(firstStep),
      status: data.status || "active",
    }).select("*").single();
    if (error || !row) dbError(error, "워크플로우 생성에 실패했습니다.");
    await ensureStepRun(db, row.id, firstStep, "in_progress");
    await createStepTasks(db, row.id, firstStep);
    return { row: row as Row, clientId: row.client_id, workflowRunId: row.id };
  }

  if (domain === "memo") {
    const client = await resolveClient(db, data.clientId, data.hospitalName);
    const { data: row, error } = await db.from("consultation_memos").insert({
      hospital_id: client?.id || data.clientId || null,
      title: data.title || data.hospitalName || "메모",
      template_type: data.templateType || "text",
      template_data: data.templateData || {},
      raw_memo: data.rawMemo,
      summary: data.summary || "",
      recommended_package: data.recommendedPackage || "",
      next_action: data.nextAction || "",
    }).select("*").single();
    if (error || !row) dbError(error, "메모 생성에 실패했습니다.");
    return { row: row as Row, clientId: row.hospital_id };
  }

  if (domain === "calendar") {
    const { data: row, error } = await db.from("calendar_tasks").insert({
      date: data.date,
      title: data.title,
      memo: data.memo || "",
      category: data.category || "general",
      time: data.time || null,
      end_time: data.endTime || null,
      location: data.location || null,
      completed: data.completed || false,
    }).select("*").single();
    if (error || !row) dbError(error, "일정 생성에 실패했습니다.");
    return { row: row as Row };
  }

  if (domain === "quote") {
    const client = await resolveClient(db, undefined, data.hospitalName);
    const number = data.quoteNumber || quoteNumber();
    const { data: existingQuote, error: existingQuoteError } = await db.from("quotes").select("id").eq("quote_number", number).limit(1).maybeSingle();
    if (existingQuoteError) dbError(existingQuoteError, "견적번호 중복 확인에 실패했습니다.");
    if (existingQuote) throw new OliviaCrudError(`견적번호 ${number}이 이미 존재합니다. 기존 견적을 수정해주세요.`, "INVALID_INPUT", { id: existingQuote.id });
    const { data: row, error } = await db.from("quotes").insert({
      quote_number: number,
      title: data.title || "",
      hospital_name: client?.hospital_name || data.hospitalName,
      client_id: client?.id || null,
      contact_name: data.contactName || client?.contact_name || "",
      phone: data.phone || "",
      email: data.email || client?.email || "",
      quote_date: data.quoteDate || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()),
      shoot_date: data.shootDate || null,
      valid_until: data.validUntil || "",
      items: data.items || [],
      supply_amount: data.supplyAmount || 0,
      discount_amount: data.discountAmount || 0,
      vat: data.vat || 0,
      total_amount: data.totalAmount || 0,
      deposit_amount: data.depositAmount || 0,
      balance_amount: data.balanceAmount || 0,
      deposit_rate: data.depositRate ?? 50,
      memos: data.memos || null,
      form_state: data.formState || null,
    }).select("*").single();
    if (error || !row) dbError(error, "견적서 생성에 실패했습니다.");
    return { row: row as Row, clientId: row.client_id };
  }

  if (domain === "contract") {
    const client = await resolveClient(db, undefined, data.hospitalName);
    const { data: row, error } = await db.from("contracts").insert({
      quote_number: data.quoteNumber || null,
      hospital_name: client?.hospital_name || data.hospitalName,
      client_id: client?.id || null,
      contact_name: data.contactName || client?.contact_name || "",
      email: data.email || client?.email || "",
      quote_data: data.quoteData || {},
      signature_data_url: data.signatureDataUrl || null,
    }).select("*").single();
    if (error || !row) dbError(error, "계약서 생성에 실패했습니다.");
    return { row: row as Row, clientId: row.client_id };
  }

  if (domain === "conti") {
    const { data: row, error } = await db.from("conti_saves").insert({
      hospital_name: data.hospitalName,
      specialties: data.specialties || [],
      title: data.title || `${data.hospitalName} 촬영 콘티`,
      result: data.result || {},
    }).select("*").single();
    if (error || !row) dbError(error, "콘티 생성에 실패했습니다.");
    return { row: row as Row };
  }

  if (domain === "photo_gallery") {
    const client = await resolveClient(db, data.clientId, data.hospitalName);
    const { data: run } = client?.id ? await db.from("workflow_runs").select("id").eq("client_id", client.id).eq("status", "active").order("updated_at", { ascending: false }).limit(1).maybeSingle() : { data: null };
    const { data: row, error } = await db.from("photo_galleries").insert({
      hospital_name: client?.hospital_name || data.hospitalName,
      contact_name: data.contactName || client?.contact_name || "",
      contact_email: data.contactEmail || client?.email || "",
      shoot_date: data.shootDate || null,
      nas_link: data.nasLink,
      description: data.description || "",
      client_id: client?.id || data.clientId || null,
      workflow_run_id: data.workflowRunId || run?.id || null,
    }).select("*").single();
    if (error || !row) dbError(error, "사진 갤러리 생성에 실패했습니다.");
    if (client?.id) await db.from("clients").update({ retouched_photos_link: data.nasLink }).eq("id", client.id);
    return { row: row as Row, clientId: row.client_id, workflowRunId: row.workflow_run_id };
  }

  if (domain === "select_gallery") {
    const client = await resolveClient(db, data.clientId, data.hospitalName);
    const { data: row, error } = await db.from("select_galleries").insert({
      title: data.title,
      hospital_name: client?.hospital_name || data.hospitalName || "",
      shooting_name: data.shootingName || "",
      shooting_date: data.shootingDate || null,
      client_id: client?.id || data.clientId || null,
      workflow_run_id: data.workflowRunId || null,
      share_token: generateShareToken(),
      status: data.status || "draft",
      allow_web_select: data.allowWebSelect ?? true,
      allow_download_upload: data.allowDownloadUpload ?? true,
      allow_download_zip: data.allowDownloadZip ?? true,
      allow_resubmit: data.allowResubmit ?? false,
      file_expires_at: getFileExpiresAt(data.expireDays || 3),
    }).select("*").single();
    if (error || !row) dbError(error, "셀렉 갤러리 생성에 실패했습니다.");
    return { row: row as Row, clientId: row.client_id, workflowRunId: row.workflow_run_id };
  }

  if (domain === "review") {
    const client = await resolveClient(db, data.clientId, data.hospitalName);
    if (!client) throw new OliviaCrudError("후기를 연결할 고객을 찾지 못했습니다.", "TARGET_NOT_FOUND");
    const { data: row, error } = await db.from("client_reviews").insert({
      client_id: client.id,
      overall_rating: data.overallRating ?? 5,
      shooting_rating: data.shootingRating ?? 5,
      result_rating: data.resultRating ?? 5,
      good_points: data.goodPoints || "",
      improvement_points: data.improvementPoints || "",
      public_review_text: data.publicReviewText || "",
      allow_public_use: data.allowPublicUse ?? false,
      allow_hospital_name: data.allowHospitalName ?? true,
      writer_name: data.writerName || "",
    }).select("*").single();
    if (error || !row) dbError(error, "후기 생성에 실패했습니다.");
    return { row: row as Row, clientId: client.id };
  }

  if (domain === "mail_draft") {
    const client = await resolveClient(db, data.clientId, data.hospitalName);
    const { data: row, error } = await db.from("mailing_queue").insert({
      type: data.type || "proposal",
      source_module: "olivia_chat",
      client_id: client?.id || data.clientId || null,
      workflow_run_id: data.workflowRunId || null,
      hospital_name: client?.hospital_name || data.hospitalName,
      contact_name: data.contactName || client?.contact_name || "",
      to_email: data.toEmail || client?.email || "",
      subject: data.subject,
      body: data.body,
      attachments: data.attachments || [],
      links: data.links || [],
      status: "draft",
    }).select("*").single();
    if (error || !row) dbError(error, "메일 초안 생성에 실패했습니다.");
    return { row: row as Row, clientId: row.client_id, workflowRunId: row.workflow_run_id };
  }

  const { data: row, error } = await db.from("agent_tasks").insert({
    client_id: data.clientId || null,
    project_id: data.projectId || null,
    workflow_run_id: data.workflowRunId || null,
    task_type: data.taskType || "general",
    title: data.title,
    description: data.description || "",
    input_data: data.inputData || {},
    output_data: data.outputData || {},
    priority: data.priority || "normal",
    status: data.status || "pending",
  }).select("*").single();
  if (error || !row) dbError(error, "올리비아 업무 생성에 실패했습니다.");
  await logAgent(db, { workflow_run_id: row.workflow_run_id, agent_task_id: row.id, log_type: "task_created", message: `${row.title} 작업이 생성되었습니다.` });
  return { row: row as Row, clientId: row.client_id, workflowRunId: row.workflow_run_id };
}

function updatePatch(domain: OliviaCrudDomain, data: Row) {
  const maps: Record<OliviaCrudDomain, Record<string, string>> = {
    client: { hospitalName: "hospital_name", contactName: "contact_name", phone: "phone", email: "email", specialty: "specialty", memo: "memo", originalPhotosLink: "original_photos_link", retouchedPhotosLink: "retouched_photos_link", totalPaidAmount: "total_paid_amount" },
    workflow: { clientId: "client_id", clientName: "client_name", projectId: "project_id", projectName: "project_name", managerName: "manager_name", contactName: "contact_name", contactEmail: "contact_email", shootDate: "shoot_date", nextAction: "next_action", status: "status" },
    memo: { clientId: "hospital_id", title: "title", rawMemo: "raw_memo", summary: "summary", recommendedPackage: "recommended_package", nextAction: "next_action", templateType: "template_type", templateData: "template_data" },
    calendar: { date: "date", title: "title", memo: "memo", category: "category", time: "time", endTime: "end_time", location: "location", completed: "completed" },
    quote: { quoteNumber: "quote_number", title: "title", hospitalName: "hospital_name", contactName: "contact_name", phone: "phone", email: "email", quoteDate: "quote_date", shootDate: "shoot_date", validUntil: "valid_until", items: "items", supplyAmount: "supply_amount", discountAmount: "discount_amount", vat: "vat", totalAmount: "total_amount", depositAmount: "deposit_amount", balanceAmount: "balance_amount", depositRate: "deposit_rate", memos: "memos", formState: "form_state" },
    contract: { quoteNumber: "quote_number", hospitalName: "hospital_name", contactName: "contact_name", email: "email", quoteData: "quote_data", signatureDataUrl: "signature_data_url" },
    conti: { hospitalName: "hospital_name", specialties: "specialties", title: "title", result: "result" },
    photo_gallery: { hospitalName: "hospital_name", contactName: "contact_name", contactEmail: "contact_email", shootDate: "shoot_date", nasLink: "nas_link", description: "description", clientId: "client_id", workflowRunId: "workflow_run_id" },
    select_gallery: { title: "title", hospitalName: "hospital_name", shootingName: "shooting_name", shootingDate: "shooting_date", clientId: "client_id", workflowRunId: "workflow_run_id", status: "status", allowWebSelect: "allow_web_select", allowDownloadUpload: "allow_download_upload", allowDownloadZip: "allow_download_zip", allowResubmit: "allow_resubmit" },
    review: { clientId: "client_id", overallRating: "overall_rating", shootingRating: "shooting_rating", resultRating: "result_rating", goodPoints: "good_points", improvementPoints: "improvement_points", publicReviewText: "public_review_text", allowPublicUse: "allow_public_use", allowHospitalName: "allow_hospital_name", writerName: "writer_name" },
    mail_draft: { type: "type", clientId: "client_id", workflowRunId: "workflow_run_id", hospitalName: "hospital_name", contactName: "contact_name", toEmail: "to_email", subject: "subject", body: "body", attachments: "attachments", links: "links" },
    agent_task: { clientId: "client_id", projectId: "project_id", workflowRunId: "workflow_run_id", taskType: "task_type", title: "title", description: "description", inputData: "input_data", outputData: "output_data", priority: "priority", status: "status" },
  };
  return Object.fromEntries(Object.entries(data).flatMap(([key, value]) => maps[domain][key] ? [[maps[domain][key], value]] : []));
}

async function updateRecord(db: SupabaseClient, domain: OliviaCrudDomain, data: Row, target: OliviaCrudTarget | undefined) {
  let current: Row;
  if (domain === "review" && !target?.id && target?.name) {
    const client = await resolveClient(db, undefined, target.name);
    if (!client) throw new OliviaCrudError(`"${target.name}" 고객을 찾지 못했습니다.`, "TARGET_NOT_FOUND");
    const { data: reviews, error } = await db.from("client_reviews").select("*").eq("client_id", client.id).order("created_at", { ascending: false }).limit(2);
    if (error) dbError(error, "후기 조회에 실패했습니다.");
    if (!reviews?.length) throw new OliviaCrudError(`"${target.name}" 고객의 후기를 찾지 못했습니다.`, "TARGET_NOT_FOUND");
    if (reviews.length > 1) throw new OliviaCrudError(`"${target.name}" 고객의 후기가 여러 개입니다. 후기 ID를 선택해주세요.`, "AMBIGUOUS_TARGET", { candidates: reviews.map((review) => review.id) });
    current = reviews[0] as Row;
  } else {
    current = await resolveTarget(db, domain, target);
  }
  const config = TARGETS[domain];
  const patch = updatePatch(domain, data);
  if (domain === "workflow" && "currentStepKey" in data) {
    throw new OliviaCrudError("워크플로우 단계 변경은 전용 단계 전환 기능을 사용해주세요.", "INVALID_INPUT");
  }
  if (domain === "mail_draft") patch.status = "draft";
  if (domain === "conti") patch.saved_at = new Date().toISOString();
  if (["workflow", "calendar", "contract", "select_gallery", "agent_task"].includes(domain)) patch.updated_at = new Date().toISOString();
  const { data: row, error } = await db.from(config.table).update(patch).eq("id", current.id).select("*").single();
  if (error || !row) dbError(error, `${domain} 수정에 실패했습니다.`);
  if (domain === "photo_gallery" && data.nasLink && row.client_id) await db.from("clients").update({ retouched_photos_link: data.nasLink }).eq("id", row.client_id);
  return { row: row as Row, clientId: row.client_id || row.hospital_id || null, workflowRunId: row.workflow_run_id || (domain === "workflow" ? row.id : null) };
}

export async function executeOliviaCrud(
  db: SupabaseClient,
  input: OliviaCrudRequest,
): Promise<OliviaCrudExecutionResult> {
  const validated = validateOliviaCrudRequest(input);
  const result = input.operation === "create"
    ? await createRecord(db, input.domain, validated.data)
    : await updateRecord(db, input.domain, validated.data, input.target);

  const row = result.row;
  const recordId = String(row.id);
  await emitOliviaEventSafely(db, {
    eventType: `record.${input.operation}d`,
    eventSource: "olivia_chat_crud",
    clientId: result.clientId || null,
    workflowRunId: result.workflowRunId || null,
    actorType: "admin",
    payload: {
      domain: input.domain,
      recordId,
      changedFields: Object.keys(validated.data),
      permission: validated.permission,
    },
    deduplicationKey: createEventDeduplicationKey(`record.${input.operation}d`, input.domain, recordId, Date.now()),
  });

  const verb = input.operation === "create" ? "생성" : "수정";
  const url = getOliviaCrudNavigation(input.domain, input.operation, recordId);
  return {
    action: url ? "navigate" : "done",
    message: `✅ ${validated.definition.label} ${verb}이 완료되었습니다.\nID: ${recordId}`,
    domain: input.domain,
    operation: input.operation,
    recordId,
    url: url || undefined,
    record: row,
  };
}

export function getOliviaCrudNavigation(
  domain: OliviaCrudDomain,
  operation: OliviaCrudOperation,
  recordId: string,
) {
  if (domain === "client" && operation === "create" && recordId) {
    return `/clients?id=${encodeURIComponent(recordId)}`;
  }
  return null;
}
