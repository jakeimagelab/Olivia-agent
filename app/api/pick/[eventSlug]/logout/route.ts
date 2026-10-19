import { NextRequest, NextResponse } from "next/server";
import { PERSON_SELECT_COOKIE } from "@/lib/person-select/session";

export async function POST(_request: NextRequest, context: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await context.params;
  const response = NextResponse.json({ ok: true });
  response.cookies.set(PERSON_SELECT_COOKIE, "", { httpOnly: true, path: `/pick/${eventSlug}`, maxAge: 0 });
  return response;
}
