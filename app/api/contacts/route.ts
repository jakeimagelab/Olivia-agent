import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession() as any;
  const accessToken = session?.accessToken;

  if (!accessToken) {
    return NextResponse.json({ ok: false, error: "로그인 필요" }, { status: 401 });
  }

  try {
    const res = await fetch(
      "https://people.googleapis.com/v1/people/me/connections" +
      "?personFields=names,emailAddresses,phoneNumbers,organizations" +
      "&pageSize=200" +
      "&sortOrder=LAST_MODIFIED_DESCENDING",
      {
        headers: {
          Authorization: "Bearer " + accessToken,
        },
      }
    );

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ ok: false, error: "Google API 오류: " + err }, { status: 500 });
    }

    const data = await res.json();
    const connections = data.connections || [];

    // 이메일 있는 연락처만 필터링
    const contacts = connections
      .filter((c: any) => c.emailAddresses?.length > 0)
      .map((c: any) => ({
        name:  c.names?.[0]?.displayName || "",
        email: c.emailAddresses?.[0]?.value || "",
        phone: c.phoneNumbers?.[0]?.value || "",
        org:   c.organizations?.[0]?.name || "",
      }))
      .filter((c: any) => c.email);

    return NextResponse.json({ ok: true, contacts });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
