import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logActivity } from "@/lib/activityLogger";
import nodemailer from "nodemailer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // ── 1. Supabase 저장 ──────────────────────────────────
    try {
      const admin = getSupabaseAdmin();
      await admin.from("diagnosis_submissions").insert({
        hospital_name:  body.hospitalName,
        contact_role:   body.contactRole,
        phone:          body.phone,
        email:          body.email,
        location:       body.location,
        stage:          body.stage,
        department:     body.department,
        concerns:       body.concerns,
        usages:         body.usages,
        impressions:    body.impressions,
        contents:       body.contents,
        budget:         body.budget,
        timeline:       body.timeline,
        consultation_optin: body.consultationOptin ?? true,
      });
    } catch (e) {
      console.error("[supabase error]", e);
    }

    // ── 2. 활동 로그 ──────────────────────────────────────
    await logActivity("olivia_chat", body.hospitalName, { type: "diagnosis_submit" });

    // ── 3. Gmail 오너 알림 ────────────────────────────────
    if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
      try {
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
        });
        await transporter.sendMail({
          from: `"포토클리닉 올리비아" <${process.env.GMAIL_USER}>`,
          to: process.env.GMAIL_USER,
          subject: `[진단 문의] ${body.hospitalName || "병원명 미입력"} — ${body.department || ""}`,
          html: `
            <div style="font-family:sans-serif;color:#1a1a1a;line-height:1.8;max-width:600px">
              <h2 style="color:#155855">📋 포토클리닉 진단 문의</h2>
              <table style="width:100%;border-collapse:collapse;font-size:14px">
                <tr><td style="padding:8px 0;font-weight:700;width:120px;color:#5A7470">병원명</td><td>${body.hospitalName || "-"}</td></tr>
                <tr><td style="padding:8px 0;font-weight:700;color:#5A7470">문의자</td><td>${body.contactRole || "-"}</td></tr>
                <tr><td style="padding:8px 0;font-weight:700;color:#5A7470">연락처</td><td>${body.phone || "-"}</td></tr>
                <tr><td style="padding:8px 0;font-weight:700;color:#5A7470">이메일</td><td>${body.email || "-"}</td></tr>
                <tr><td style="padding:8px 0;font-weight:700;color:#5A7470">지역</td><td>${body.location || "-"}</td></tr>
                <tr><td style="padding:8px 0;font-weight:700;color:#5A7470">단계</td><td>${body.stage || "-"}</td></tr>
                <tr><td style="padding:8px 0;font-weight:700;color:#5A7470">진료과</td><td>${body.department || "-"}</td></tr>
                <tr><td style="padding:8px 0;font-weight:700;color:#5A7470">예산</td><td>${body.budget || "-"}</td></tr>
                <tr><td style="padding:8px 0;font-weight:700;color:#5A7470">촬영 시기</td><td>${body.timeline || "-"}</td></tr>
                <tr><td style="padding:8px 0;font-weight:700;color:#5A7470">고민</td><td>${(body.concerns || []).join(", ") || "-"}</td></tr>
                <tr><td style="padding:8px 0;font-weight:700;color:#5A7470">필요 콘텐츠</td><td>${(body.contents || []).join(", ") || "-"}</td></tr>
              </table>
            </div>
          `,
        });
      } catch (e) { console.error("[mail error]", e); }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
