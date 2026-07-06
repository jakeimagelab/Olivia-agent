import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_MESSAGES = 300;
const CONCURRENCY = 10;

// Google People API의 "다른 연락처"는 Google이 "자주 연락한 사람"으로 판단한 사람만 자동으로
// 잡아준다 — 몇 달에 한 번 주고받은 상대는 빠질 수 있다. 이 라우트는 실제 보낸 메일함(Sent)
// 헤더를 직접 읽어서, 한 번이라도 메일을 보낸 모든 주소를 뽑아온다 (gmail.metadata 스코프,
// 본문은 읽지 않고 To/Cc 헤더만 조회).
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("pc_session");
  if (!cookie) return NextResponse.json({ ok: false, error: "로그인 필요" }, { status: 401 });

  let accessToken = "";
  let selfEmail = "";
  try {
    const data = JSON.parse(Buffer.from(cookie.value, "base64").toString());
    if (Date.now() > data.expiresAt) return NextResponse.json({ ok: false, error: "세션 만료" }, { status: 401 });
    accessToken = data.accessToken;
    selfEmail = (data.email ?? "").toLowerCase();
  } catch {
    return NextResponse.json({ ok: false, error: "세션 오류" }, { status: 401 });
  }

  const authHeader = { Authorization: "Bearer " + accessToken };

  try {
    // 1. 보낸 메일함에서 최근 메시지 ID 목록 수집
    const messageIds: string[] = [];
    let pageToken: string | undefined;
    while (messageIds.length < MAX_MESSAGES) {
      const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
      url.searchParams.set("q", "in:sent");
      url.searchParams.set("maxResults", String(Math.min(100, MAX_MESSAGES - messageIds.length)));
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const listRes = await fetch(url.toString(), { headers: authHeader });
      if (!listRes.ok) {
        const err = await listRes.text();
        throw new Error("Gmail 목록 조회 실패: " + err);
      }
      const listData = await listRes.json();
      messageIds.push(...((listData.messages ?? []) as { id: string }[]).map((m) => m.id));
      if (!listData.nextPageToken) break;
      pageToken = listData.nextPageToken;
    }

    // 2. 메시지별 To/Cc 헤더만 조회 (본문 X) — 동시 처리로 속도 확보
    const emailMap = new Map<string, string>(); // email(lower) -> 표시 이름
    let qi = 0;
    const worker = async () => {
      while (qi < messageIds.length) {
        const id = messageIds[qi++];
        try {
          const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}` +
            `?format=metadata&metadataHeaders=To&metadataHeaders=Cc`;
          const res = await fetch(url, { headers: authHeader });
          if (!res.ok) continue;
          const msg = await res.json();
          const headers: { name: string; value: string }[] = msg.payload?.headers ?? [];
          for (const h of headers) {
            if (h.name !== "To" && h.name !== "Cc") continue;
            for (const part of h.value.split(",")) {
              const m = part.match(/(?:"?([^"<]*)"?\s*)?<?([\w.+-]+@[\w-]+\.[\w.-]+)>?/);
              if (!m) continue;
              const email = m[2].trim().toLowerCase();
              if (!email || email === selfEmail) continue;
              const name = (m[1] ?? "").trim().replace(/^"|"$/g, "");
              if (!emailMap.has(email) || (name && !emailMap.get(email))) {
                emailMap.set(email, name);
              }
            }
          }
        } catch { /* 개별 메시지 실패는 건너뜀 */ }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

    const contacts = Array.from(emailMap.entries()).map(([email, name]) => ({
      name: name || email.split("@")[0],
      email,
      phone: "",
      org: "",
    }));

    return NextResponse.json({ ok: true, contacts, scannedMessages: messageIds.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
