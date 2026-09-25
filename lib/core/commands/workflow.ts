import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  completeOpenStepTasksForManualSave,
  getWorkflowRun,
  maybeAdvanceWorkflow,
} from "@/lib/workflowAutomation";
import { coreCommandFailure, type CoreCommandResult } from "./result";

type AdvanceOutcome = { advanced: boolean; fromStep: string; toStep?: string; reason?: string };

// 문서형(계약서/콘티)과 갤러리형(원본/완료본 등록) 단계 완료가 공유하는 유일한 경로 —
// lib/workflowAutomation.ts의 completeOpenStepTasksForManualSave + maybeAdvanceWorkflow를
// 그대로 감싼다. 새 상태 판단 로직을 여기서 만들지 않는다(PHASE 3, 2026-09-25).
export async function completeStep(
  workflowRunId: string,
  stepKey: string,
  db: SupabaseClient = getSupabaseAdmin(),
): Promise<CoreCommandResult<AdvanceOutcome>> {
  try {
    await completeOpenStepTasksForManualSave(db, workflowRunId, stepKey);
    const advance = await maybeAdvanceWorkflow(db, workflowRunId, stepKey);
    const toStep = advance.advanced ? advance.result.to_step_key ?? undefined : undefined;
    return {
      ok: true,
      value: {
        advanced: advance.advanced,
        fromStep: stepKey,
        toStep,
        ...(!advance.advanced ? { reason: advance.reason } : {}),
      },
    };
  } catch (error) {
    return coreCommandFailure(error, `${stepKey} 단계 완료 처리에 실패했습니다.`);
  }
}

// shooting → payment_confirm. 촬영 완료를 알리는 두 경로(홈 채팅 확인, NAS 자동 감지)가
// 전부 이 Command 하나로만 단계를 넘긴다(PHASE 3 작업 1-B).
export async function completeShoot(
  workflowRunId: string,
  db: SupabaseClient = getSupabaseAdmin(),
): Promise<CoreCommandResult<AdvanceOutcome>> {
  return completeStep(workflowRunId, "shooting", db);
}

// payment_confirm → backup_sorting. 계좌 API 연동 전까지는 대표가 입금·계산서 처리를
// 수동으로 확인한 뒤 이 Command를 호출하는 버튼 하나로만 열린다.
export async function confirmPayment(
  workflowRunId: string,
  db: SupabaseClient = getSupabaseAdmin(),
): Promise<CoreCommandResult<AdvanceOutcome>> {
  return completeStep(workflowRunId, "payment_confirm", db);
}

export type RegisterGalleryInput = {
  hospitalName: string;
  contactName?: string;
  contactEmail?: string;
  shootDate?: string | null;
  nasLink: string;
  description?: string;
  thumbnailUrl?: string;
  items?: Array<{ title?: string; thumbnailUrl?: string; nasFileUrl?: string }>;
  clientId?: string | null;
  workflowRunId?: string | null;
  galleryType: string;
};

const ORIGINAL_GALLERY_TYPES = new Set(["original", "original_photo", "original_video"]);
const FINAL_GALLERY_TYPES = new Set(["retouched", "final_photo", "final_video"]);

// 원본 갤러리 등록 = 1차 납품, 완료본 갤러리 등록 = 2차 납품. 갤러리 등록 자체(DB insert)는
// 별개의 사실이라 항상 성공으로 반환하고, 그 뒤에 시도하는 단계 전진의 결과(advanced/보류
// 사유)는 별도 필드로 함께 실어서 호출부가 조용히 삼키지 않게 한다(PHASE 3 작업 2).
export async function registerGallery(
  input: RegisterGalleryInput,
  db: SupabaseClient = getSupabaseAdmin(),
): Promise<CoreCommandResult<{
  gallery: Record<string, unknown> & { id: string };
  advance: { advanced: boolean; targetStep?: string; reason?: string };
}>> {
  try {
    const { data: gallery, error: galleryError } = await db.from("photo_galleries").insert({
      hospital_name: input.hospitalName,
      contact_name: input.contactName || "",
      contact_email: input.contactEmail || "",
      shoot_date: input.shootDate || null,
      nas_link: input.nasLink,
      description: input.description || "",
      client_id: input.clientId || null,
      workflow_run_id: input.workflowRunId || null,
      gallery_type: input.galleryType,
    }).select().single();
    if (galleryError || !gallery) throw new Error(galleryError?.message ?? "갤러리를 저장하지 못했습니다.");

    const cleanItems = input.thumbnailUrl
      ? [{
          gallery_id: gallery.id,
          title: "대표 이미지",
          thumbnail_url: input.thumbnailUrl,
          nas_file_url: input.nasLink,
          sort_order: 0,
        }]
      : (input.items ?? [])
        .filter((item) => item.thumbnailUrl || item.nasFileUrl || item.title)
        .map((item, index) => ({
          gallery_id: gallery.id,
          title: item.title || `썸네일 ${index + 1}`,
          thumbnail_url: item.thumbnailUrl || "",
          nas_file_url: item.nasFileUrl || input.nasLink,
          sort_order: index,
        }));
    if (cleanItems.length) {
      const { error: itemsError } = await db.from("photo_gallery_items").insert(cleanItems);
      if (itemsError) throw new Error(itemsError.message);
    }

    let advance: { advanced: boolean; targetStep?: string; reason?: string } = { advanced: false };
    const isOriginalType = ORIGINAL_GALLERY_TYPES.has(input.galleryType);
    const isFinalType = FINAL_GALLERY_TYPES.has(input.galleryType);
    if (input.clientId && input.workflowRunId && (isOriginalType || isFinalType)) {
      const run = await getWorkflowRun(db, input.workflowRunId);
      let targetStep: string | null = null;
      if (isOriginalType && run.current_step_key === "client_selection") targetStep = "client_selection";
      else if (isFinalType && (run.current_step_key === "retouching" || run.current_step_key === "final_delivery")) targetStep = run.current_step_key;

      if (targetStep) {
        const result = await completeStep(input.workflowRunId, targetStep, db);
        advance = result.ok
          ? { advanced: result.value.advanced, targetStep, reason: result.value.reason }
          : { advanced: false, targetStep, reason: result.reason };
      }
    }

    return { ok: true, value: { gallery: gallery as Record<string, unknown> & { id: string }, advance } };
  } catch (error) {
    return coreCommandFailure(error, "갤러리를 등록하지 못했습니다.");
  }
}
