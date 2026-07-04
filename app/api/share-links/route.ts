import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("share_links")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, links: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  const featurePath = body.featurePath as string | undefined;
  if (!featurePath) {
    return NextResponse.json({ ok: false, error: "featurePath 필수" }, { status: 400 });
  }

  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  const expiresInDays = typeof body.expiresInDays === "number" ? body.expiresInDays : null;
  const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString() : null;

  const { data, error } = await supabase
    .from("share_links")
    .insert({
      token,
      feature_path: featurePath,
      label: body.label ?? "",
      expires_at: expiresAt,
    })
    .select("id, token")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id, token: data.token });
}
