import { NextResponse } from "next/server";
import { PERSON_SELECT_COOKIE } from "@/lib/person-select/session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(PERSON_SELECT_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
