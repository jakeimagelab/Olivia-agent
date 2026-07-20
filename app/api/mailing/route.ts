import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveClientId } from "@/lib/clientLookup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);

  let query = supabase
    .from("mailing_queue")
    .select("*")
    .order("created_at", { ascending: false });

  const id       = searchParams.get("id");
  const type     = searchParams.get("type");
  const status   = searchParams.get("status");
  const hosp     = searchParams.get("hospital_name");
  const clientId = searchParams.get("client_id");

  if (id)       query = query.eq("id", id);
  if (type)     query = query.eq("type", type);
  if (status)   query = query.eq("status", status);
  if (hosp)     query = query.ilike("hospital_name", `%${hosp}%`);
  if (clientId) query = query.eq("client_id", clientId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, items: data });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  const {
    type, source_module, source_id, hospital_name, contact_name,
    to_email, subject, body: mailBody, attachments, links,
  } = body;

  if (!type || !hospital_name || !subject) {
    return NextResponse.json({ ok: false, error: "type, hospital_name, subject는 필수입니다." }, { status: 400 });
  }

  const client_id = body.client_id ?? (await resolveClientId(supabase, hospital_name));

  const draftFields = {
    type,
    source_module: source_module || "",
    source_id:     source_id     || "",
    hospital_name,
    client_id,
    contact_name:  contact_name  || "",
    to_email:      to_email      || "",
    subject,
    body:          mailBody      || "",
    attachments:   attachments   || [],
    links:         links         || [],
    status: to_email ? "ready" : "draft",
  };

  // 같은 견적서/계약서를 재생성(재시도)할 때마다 초안이 중복 쌓이지 않도록,
  // 아직 발송 전인 동일 소스의 초안이 있으면 새로 만들지 않고 갱신한다.
  if (source_module && source_id) {
    const { data: existing } = await supabase
      .from("mailing_queue")
      .select("id")
      .eq("source_module", source_module)
      .eq("source_id", source_id)
      .eq("type", type)
      .neq("status", "sent")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const { data, error } = await supabase
        .from("mailing_queue")
        .update(draftFields)
        .eq("id", existing.id)
        .select("id")
        .single();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, id: data.id });
    }
  }

  const { data, error } = await supabase
    .from("mailing_queue")
    .insert(draftFields)
    .select("id")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, id: data.id });
}
