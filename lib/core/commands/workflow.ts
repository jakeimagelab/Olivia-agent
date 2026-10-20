import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  completeOpenStepTasksForManualSave,
  maybeAdvanceWorkflow,
} from "@/lib/workflowAutomation";
import { coreCommandFailure, type CoreCommandResult } from "./result";
import { writeWorkflowCheck } from "@/lib/workflowCheckPersistence";

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

// 촬영 완료 사실을 체크에 기록한다. current_step_key는 체크 목록에서 역산된다.
export async function completeShoot(
  workflowRunId: string,
  db: SupabaseClient = getSupabaseAdmin(),
): Promise<CoreCommandResult<AdvanceOutcome>> {
  try {
    const updated = await writeWorkflowCheck(db, { workflowRunId, key: "shot", done: true, by: "user" });
    return { ok: true, value: { advanced: true, fromStep: "shooting", toStep: updated.current_step_key } };
  } catch (error) {
    return coreCommandFailure(error, "촬영 완료 확인에 실패했습니다.");
  }
}

// 잔금 확인 사실을 체크에 기록한다. 계좌 API 연동 전까지는 대표가 직접 확인한다.
export async function confirmPayment(
  workflowRunId: string,
  db: SupabaseClient = getSupabaseAdmin(),
): Promise<CoreCommandResult<AdvanceOutcome>> {
  try {
    const updated = await writeWorkflowCheck(db, { workflowRunId, key: "payment", done: true, by: "user" });
    return { ok: true, value: { advanced: true, fromStep: "payment_confirm", toStep: updated.current_step_key } };
  } catch (error) {
    return coreCommandFailure(error, "잔금 확인에 실패했습니다.");
  }
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

const FINAL_GALLERY_TYPES = new Set(["retouched", "final_photo", "final_video"]);

// 갤러리 등록 자체와 완료사진 전달 체크는 별개의 사실이다. 체크 기록이 실패해도 저장된
// 갤러리는 성공으로 반환하고, 실패 사유를 별도 필드로 드러낸다.
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
    const isFinalType = FINAL_GALLERY_TYPES.has(input.galleryType);
    if (input.clientId && input.workflowRunId && isFinalType) {
      try {
        const updated = await writeWorkflowCheck(db, { workflowRunId: input.workflowRunId, key: "final_delivered", done: true, by: "auto" });
        advance = { advanced: true, targetStep: updated.current_step_key };
      } catch (error) {
        advance = { advanced: false, reason: error instanceof Error ? error.message : "완료사진 전달 체크를 기록하지 못했습니다." };
      }
    }

    return { ok: true, value: { gallery: gallery as Record<string, unknown> & { id: string }, advance } };
  } catch (error) {
    return coreCommandFailure(error, "갤러리를 등록하지 못했습니다.");
  }
}
