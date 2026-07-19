import { getSupabaseAdmin } from "@/lib/supabase";

export const REWARD_RATE = 0.01;

export function calculateRewardPoints(amount: number, rate = REWARD_RATE): number {
  return Math.floor(amount * rate);
}

export function tierFromPoints(totalEarned: number): "standard" | "silver" | "gold" | "vip" {
  if (totalEarned >= 500000) return "vip";
  if (totalEarned >= 200000) return "gold";
  if (totalEarned >= 50000)  return "silver";
  return "standard";
}

export const TIER_LABEL: Record<string, string> = {
  standard: "일반",
  silver:   "실버",
  gold:     "골드",
  vip:      "VIP",
};

export const TIER_COLOR: Record<string, string> = {
  standard: "#9BB5B0",
  silver:   "#8B9EB7",
  gold:     "#D4A843",
  vip:      "#E85D2C",
};

export const TX_TYPE_LABEL: Record<string, string> = {
  earn:    "적립",
  use:     "사용",
  donate:  "기부",
  adjust:  "조정",
  expire:  "만료",
  cancel:  "취소/회수",
};

export const TX_TYPE_COLOR: Record<string, string> = {
  earn:    "#155855",
  use:     "#E85D2C",
  donate:  "#22876A",
  adjust:  "#D4A843",
  expire:  "#9BB5B0",
  cancel:  "#EF4444",
};

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending:         "신청 대기",
  approved:        "승인 완료",
  points_deducted: "포인트 차감",
  preparing:       "준비 중",
  shipped:         "배송 중",
  completed:       "완료",
  canceled:        "취소",
  rejected:        "반려",
};

export const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  draft:    "초안",
  active:   "진행 중",
  closed:   "마감",
  donated:  "기부 완료",
  reported: "리포트 완료",
};

export async function addPoints(
  clientId: string,
  points: number,
  opts: {
    type: "earn" | "adjust" | "cancel";
    amount?: number;
    sourceType?: string;
    sourceId?: string;
    memo?: string;
    createdBy?: string;
  }
) {
  const db = getSupabaseAdmin();

  const { data: client } = await db
    .from("clients")
    .select("available_points, total_earned_points, total_paid_amount")
    .eq("id", clientId)
    .single();

  const currentBalance = client?.available_points ?? 0;
  const newBalance = Math.max(0, currentBalance + points);
  const newEarned = (client?.total_earned_points ?? 0) + (points > 0 ? points : 0);
  const newPaid = (client?.total_paid_amount ?? 0) + (opts.amount ?? 0);

  const { data: tx, error: txErr } = await db
    .from("reward_transactions")
    .insert({
      client_id:    clientId,
      type:         opts.type,
      amount:       opts.amount ?? 0,
      points,
      balance_after: newBalance,
      source_type:  opts.sourceType ?? "manual",
      source_id:    opts.sourceId  ?? "",
      memo:         opts.memo      ?? "",
      created_by:   opts.createdBy ?? "admin",
    })
    .select("id")
    .single();

  if (txErr) throw new Error(txErr.message);

  const patch: Record<string, unknown> = {
    available_points: newBalance,
    total_earned_points: newEarned,
    reward_tier: tierFromPoints(newEarned),
    per_joined: true,
  };
  if (opts.amount) {
    patch.total_paid_amount = newPaid;
  }
  if (!client?.available_points) {
    patch.per_joined_at = new Date().toISOString();
  }

  await db.from("clients").update(patch).eq("id", clientId);

  return tx!.id;
}

export async function deductPoints(
  clientId: string,
  points: number,
  opts: {
    type: "use" | "donate" | "expire";
    sourceType?: string;
    sourceId?: string;
    memo?: string;
    createdBy?: string;
  }
) {
  const db = getSupabaseAdmin();

  const { data: client } = await db
    .from("clients")
    .select("available_points, total_used_points, total_donated_points")
    .eq("id", clientId)
    .single();

  const current = client?.available_points ?? 0;
  if (current < points) throw new Error("포인트가 부족합니다.");

  const newBalance  = current - points;
  const usedDelta   = opts.type === "use"    ? points : 0;
  const donateDelta = opts.type === "donate" ? points : 0;

  const { data: tx, error: txErr } = await db
    .from("reward_transactions")
    .insert({
      client_id:    clientId,
      type:         opts.type,
      points:       -points,
      balance_after: newBalance,
      source_type:  opts.sourceType ?? "",
      source_id:    opts.sourceId  ?? "",
      memo:         opts.memo      ?? "",
      created_by:   opts.createdBy ?? "admin",
    })
    .select("id")
    .single();

  if (txErr) throw new Error(txErr.message);

  await db.from("clients").update({
    available_points:      newBalance,
    total_used_points:     (client?.total_used_points    ?? 0) + usedDelta,
    total_donated_points:  (client?.total_donated_points ?? 0) + donateDelta,
  }).eq("id", clientId);

  return tx!.id;
}

export async function savePerMailingQueue(opts: {
  type: "per_report" | "per_order" | "per_donation";
  hospitalName: string;
  clientId?: string | null;
  contactName?: string;
  toEmail?: string;
  subject: string;
  body: string;
  sourceId?: string;
}) {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("mailing_queue")
    .insert({
      type:          opts.type,
      source_module: "per",
      source_id:     opts.sourceId    ?? "",
      hospital_name: opts.hospitalName,
      client_id:     opts.clientId    ?? null,
      contact_name:  opts.contactName ?? "",
      to_email:      opts.toEmail     ?? "",
      subject:       opts.subject,
      body:          opts.body,
      attachments:   [],
      links:         [],
      status:        opts.toEmail ? "ready" : "draft",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data!.id;
}

export function formatPoints(n: number): string {
  return n.toLocaleString("ko-KR") + "P";
}

export function formatKRW(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}
