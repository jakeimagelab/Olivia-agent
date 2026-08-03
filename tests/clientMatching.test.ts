import { describe, expect, it } from "vitest";
import { matchClient, normalizePhone } from "@/lib/clientMatching";

function fakeDb(rows: any[]) {
  return {
    from: () => ({
      select: async () => ({ data: rows, error: null }),
    }),
  } as any;
}

describe("고객 자동 매칭", () => {
  it("전화번호 형식이 달라도 숫자만 비교해 같은 번호로 인식한다", () => {
    expect(normalizePhone("010-1234-5678")).toBe(normalizePhone("01012345678"));
  });

  it("사업자등록번호가 정확히 일치하면 자동 연결한다", async () => {
    const db = fakeDb([
      { id: "c1", hospital_name: "A병원", contact_name: "김원장", phone: "010-1111-2222", email: "a@a.com", business_registration_number: "123-45-67890" },
      { id: "c2", hospital_name: "B병원", contact_name: "이원장", phone: "010-3333-4444", email: "b@b.com", business_registration_number: "999-99-99999" },
    ]);
    const result = await matchClient(db, { businessRegistrationNumber: "123-45-67890" });
    expect(result).toEqual({ status: "matched", clientId: "c1" });
  });

  it("이메일이 정확히 일치하면 자동 연결한다 (사업자번호가 없을 때)", async () => {
    const db = fakeDb([
      { id: "c1", hospital_name: "A병원", contact_name: null, phone: null, email: "A@Example.com", business_registration_number: null },
    ]);
    const result = await matchClient(db, { email: "a@example.com" });
    expect(result).toEqual({ status: "matched", clientId: "c1" });
  });

  it("전화번호가 정확히 일치하면 자동 연결한다 (사업자번호/이메일이 없을 때)", async () => {
    const db = fakeDb([
      { id: "c1", hospital_name: "A병원", contact_name: null, phone: "010-1234-5678", email: null, business_registration_number: null },
    ]);
    const result = await matchClient(db, { phone: "01012345678" });
    expect(result).toEqual({ status: "matched", clientId: "c1" });
  });

  it("우선순위: 사업자번호가 있으면 이메일/전화보다 먼저 확인한다", async () => {
    const db = fakeDb([
      { id: "c1", hospital_name: "A병원", contact_name: null, phone: "010-9999-9999", email: "wrong@x.com", business_registration_number: "123-45-67890" },
      { id: "c2", hospital_name: "B병원", contact_name: null, phone: "010-1234-5678", email: "target@x.com", business_registration_number: null },
    ]);
    const result = await matchClient(db, { businessRegistrationNumber: "123-45-67890", email: "target@x.com", phone: "01012345678" });
    expect(result).toEqual({ status: "matched", clientId: "c1" });
  });

  it("정확한 연락처 없이 병원명만 비슷하면 자동 연결하지 않고 확인창 후보로만 반환한다", async () => {
    const db = fakeDb([
      { id: "c1", hospital_name: "반포리움성형외과", contact_name: "김원장", phone: "010-1111-2222", email: null, business_registration_number: null },
    ]);
    const result = await matchClient(db, { hospitalName: "반포리움 성형외과" });
    expect(result.status).toBe("needs_confirmation");
    if (result.status === "needs_confirmation") {
      expect(result.candidate.id).toBe("c1");
    }
  });

  it("아무것도 일치하지 않으면 no_match를 반환한다", async () => {
    const db = fakeDb([
      { id: "c1", hospital_name: "완전다른병원", contact_name: null, phone: "010-0000-0000", email: null, business_registration_number: null },
    ]);
    const result = await matchClient(db, { hospitalName: "존재하지않는병원", email: "none@x.com", phone: "01099998888" });
    expect(result).toEqual({ status: "no_match" });
  });

  it("동일 조건에 두 명 이상 일치하면 애매하므로 자동 연결하지 않는다", async () => {
    const db = fakeDb([
      { id: "c1", hospital_name: "A", contact_name: null, phone: "010-1234-5678", email: null, business_registration_number: null },
      { id: "c2", hospital_name: "B", contact_name: null, phone: "010-1234-5678", email: null, business_registration_number: null },
    ]);
    const result = await matchClient(db, { phone: "01012345678" });
    expect(result.status).toBe("no_match");
  });
});
