import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const baseUrl = process.env.NEXTAUTH_URL || "https://olivia-agent-smoky.vercel.app";
  const res = NextResponse.redirect(baseUrl + "/delivery-mail");
  res.cookies.delete("pc_session");
  return res;
}
