import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeSearchText } from "@/lib/olivia/nameSearch";

export type ClientMatchCandidate = {
  id: string;
  hospital_name: string;
  contact_name: string | null;
  phone: string | null;
};

export type ClientMatchResult =
  | { status: "matched"; clientId: string }
  | { status: "needs_confirmation"; candidate: ClientMatchCandidate }
  | { status: "no_match" };

// 숫자만 남긴다 — "010-1234-5678"과 "01012345678"을 같은 번호로 취급하기 위함.
export function normalizePhone(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeEmail(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeBizNo(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

/**
 * 견적서 공개 시 기존 고객을 자동으로 찾는다.
 * 우선순위: 사업자등록번호 완전일치 → 이메일 완전일치 → 휴대전화 완전일치(정규화 후).
 * 위 조건 중 하나라도 유일하게 일치하면 자동 연결(matched)한다.
 * 정확한 연락처가 없고 병원명만 비슷하면 자동 연결하지 않고 사용자 확인이 필요한
 * 후보(needs_confirmation)로만 반환한다 — 잘못 합치는 것보다 안전한 쪽을 택한다.
 */
export async function matchClient(
  db: SupabaseClient,
  input: {
    businessRegistrationNumber?: string | null;
    email?: string | null;
    phone?: string | null;
    hospitalName?: string | null;
  },
): Promise<ClientMatchResult> {
  const bizNo = normalizeBizNo(input.businessRegistrationNumber);
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone);
  const hospitalName = String(input.hospitalName ?? "").trim();

  const { data: clients, error } = await db
    .from("clients")
    .select("id, hospital_name, contact_name, phone, email, business_registration_number");
  if (error) throw new Error(error.message);
  const rows = clients ?? [];

  if (bizNo) {
    const exact = rows.filter((row) => normalizeBizNo(row.business_registration_number) === bizNo);
    if (exact.length === 1) return { status: "matched", clientId: exact[0].id };
  }
  if (email) {
    const exact = rows.filter((row) => normalizeEmail(row.email) === email);
    if (exact.length === 1) return { status: "matched", clientId: exact[0].id };
  }
  if (phone) {
    const exact = rows.filter((row) => normalizePhone(row.phone) === phone);
    if (exact.length === 1) return { status: "matched", clientId: exact[0].id };
  }

  if (hospitalName) {
    const target = normalizeSearchText(hospitalName);
    const similar = rows.find((row) => {
      const name = normalizeSearchText(row.hospital_name ?? "");
      return name && (name === target || name.includes(target) || target.includes(name));
    });
    if (similar) {
      return {
        status: "needs_confirmation",
        candidate: {
          id: similar.id,
          hospital_name: similar.hospital_name,
          contact_name: similar.contact_name ?? null,
          phone: similar.phone ?? null,
        },
      };
    }
  }

  return { status: "no_match" };
}
