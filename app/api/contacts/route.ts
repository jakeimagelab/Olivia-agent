import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("pc_session");
  if (!cookie) {
    return NextResponse.json({ ok: false, error: "로그인 필요" }, { status: 401 });
  }

  let accessToken = "";
  try {
    const data = JSON.parse(Buffer.from(cookie.value, "base64").toString());
    if (Date.now() > data.expiresAt) {
      return NextResponse.json({ ok: false, error: "세션 만료" }, { status: 401 });
    }
    accessToken = data.accessToken;
  } catch {
    return NextResponse.json({ ok: false, error: "세션 오류" }, { status: 401 });
  }

  try {
    const authHeader = { Authorization: "Bearer " + accessToken };

    const res = await fetch(
      "https://people.googleapis.com/v1/people/me/connections" +
      "?personFields=names,emailAddresses,phoneNumbers,organizations" +
      "&pageSize=200&sortOrder=LAST_MODIFIED_DESCENDING",
      { headers: authHeader }
    );

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ ok: false, error: "Google API 오류: " + err }, { status: 500 });
    }

    const data = await res.json();
    const contacts = (data.connections || [])
      .filter((c: any) => c.emailAddresses?.length > 0)
      .map((c: any) => ({
        name:  c.names?.[0]?.displayName || "",
        email: c.emailAddresses?.[0]?.value || "",
        phone: c.phoneNumbers?.[0]?.value || "",
        org:   c.organizations?.[0]?.name || "",
      }))
      .filter((c: any) => c.email);

    // "다른 연락처" — 따로 저장하진 않았지만 지메일로 주고받은 상대방 주소.
    // contacts.other.readonly 동의 전(재로그인 전) 계정에서는 403이 날 수 있으니 무시하고 넘어간다.
    let otherContacts: typeof contacts = [];
    try {
      const otherRes = await fetch(
        "https://people.googleapis.com/v1/otherContacts" +
        "?readMask=names,emailAddresses,phoneNumbers&pageSize=200",
        { headers: authHeader }
      );
      if (otherRes.ok) {
        const otherData = await otherRes.json();
        otherContacts = (otherData.otherContacts || [])
          .filter((c: any) => c.emailAddresses?.length > 0)
          .map((c: any) => ({
            name:  c.names?.[0]?.displayName || "",
            email: c.emailAddresses?.[0]?.value || "",
            phone: c.phoneNumbers?.[0]?.value || "",
            org:   "",
          }))
          .filter((c: any) => c.email);
      }
    } catch { /* 다른 연락처는 선택 사항 — 실패해도 무시 */ }

    const seen = new Set(contacts.map((c: any) => c.email.toLowerCase()));
    const merged = [...contacts, ...otherContacts.filter((c: any) => !seen.has(c.email.toLowerCase()))];

    return NextResponse.json({ ok: true, contacts: merged });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
