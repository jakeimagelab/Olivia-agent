"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { Fingerprint, ShieldCheck, Trash2, ArrowLeft, Plus, AlertTriangle } from "lucide-react";
import { C } from "@/lib/theme";

type Passkey = {
  id: string;
  device_name: string;
  created_at: string;
  last_used_at: string | null;
};

export default function SecurityPage() {
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [supported, setSupported] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/auth/passkey/list");
      const d = await r.json().catch(() => null);
      if (d?.ok) setPasskeys(d.passkeys);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
    load();
  }, []);

  const register = async () => {
    setErr(""); setMsg(""); setRegistering(true);
    try {
      const optionsRes = await fetch("/api/auth/passkey/register-options", { method: "POST" });
      const optionsData = await optionsRes.json().catch(() => null);
      if (!optionsData?.ok) throw new Error(optionsData?.error || "등록 준비에 실패했어요.");

      const response = await startRegistration({ optionsJSON: optionsData.options });

      const verifyRes = await fetch("/api/auth/passkey/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response, deviceName: deviceName || "" }),
      });
      const verifyData = await verifyRes.json().catch(() => null);
      if (!verifyData?.ok) throw new Error(verifyData?.error || "등록에 실패했어요.");

      setMsg("패스키가 등록됐어요.");
      setDeviceName("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "패스키 등록 중 오류가 발생했어요.");
    } finally {
      setRegistering(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("이 패스키를 삭제할까요?")) return;
    setErr(""); setMsg("");
    const r = await fetch("/api/auth/passkey/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const d = await r.json().catch(() => null);
    if (d?.ok) { setMsg("삭제했어요."); await load(); }
    else setErr(d?.error || "삭제에 실패했어요.");
  };

  return (
    <main style={{ minHeight: "100vh", background: C.bg, padding: "32px 20px 80px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <Link href="/admin/dashboard/home" style={{
          display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700,
          color: C.muted, textDecoration: "none", marginBottom: 20,
        }}>
          <ArrowLeft size={15} /> 대시보드로
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: `linear-gradient(135deg, ${C.teal}, #1a8070)`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <ShieldCheck size={20} color="#fff" />
          </div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: C.ink, letterSpacing: "-.3px" }}>보안 설정</h1>
        </div>
        <p style={{ margin: "0 0 28px", fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
          이 기기에 패스키를 등록하면 다음부터는 비밀번호 대신 맥 Touch ID · 아이폰 Face ID로 로그인할 수 있어요.
          생체정보는 이 기기 밖으로 전송되지 않습니다.
        </p>

        {!supported && (
          <div style={{
            display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", borderRadius: 12,
            background: "#FFF7ED", border: "1px solid rgba(232,93,44,.25)", marginBottom: 20,
          }}>
            <AlertTriangle size={16} color={C.orange} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.6 }}>
              이 브라우저는 패스키(WebAuthn)를 지원하지 않아요. 최신 Safari/Chrome에서 접속해주세요. 비밀번호 로그인은 계속 사용할 수 있습니다.
            </span>
          </div>
        )}

        <div style={{
          background: C.white, borderRadius: 16, border: `1px solid ${C.border}`,
          padding: 20, marginBottom: 20, boxShadow: "0 4px 20px rgba(21,88,85,.06)",
        }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: C.teal, marginBottom: 12 }}>새 패스키 등록</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="기기 이름 (예: 대표님 맥북)"
              style={{
                flex: 1, minWidth: 180, height: 40, borderRadius: 10, border: `1.5px solid ${C.border}`,
                padding: "0 12px", fontSize: 13, fontFamily: "inherit", outline: "none", color: C.ink,
              }}
            />
            <button
              onClick={register}
              disabled={!supported || registering}
              style={{
                display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 18px",
                borderRadius: 10, border: "none", cursor: supported ? "pointer" : "not-allowed",
                background: !supported ? C.hint : `linear-gradient(135deg, ${C.orange}, ${C.gold})`,
                color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: "inherit",
                boxShadow: supported ? "0 4px 14px rgba(232,93,44,.3)" : "none",
              }}
            >
              <Plus size={15} /> {registering ? "등록 중..." : "이 기기에 등록"}
            </button>
          </div>
          {msg && <p style={{ margin: "10px 0 0", fontSize: 12.5, color: C.success, fontWeight: 700 }}>{msg}</p>}
          {err && <p style={{ margin: "10px 0 0", fontSize: 12.5, color: C.danger, fontWeight: 700 }}>{err}</p>}
        </div>

        <div style={{
          background: C.white, borderRadius: 16, border: `1px solid ${C.border}`,
          overflow: "hidden", boxShadow: "0 4px 20px rgba(21,88,85,.06)",
        }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, background: C.mint }}>
            <span style={{ fontSize: 13, fontWeight: 900, color: C.teal }}>등록된 패스키 {passkeys.length}개</span>
          </div>
          {loading ? (
            <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: C.muted }}>불러오는 중...</div>
          ) : passkeys.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: C.hint }}>등록된 패스키가 없어요. 위에서 등록해보세요.</div>
          ) : (
            passkeys.map((p) => (
              <div key={p.id} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "14px 20px",
                borderBottom: `1px solid ${C.border}`,
              }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10, background: C.mint,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <Fingerprint size={17} color={C.teal} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.ink }}>{p.device_name || "이름 없는 기기"}</div>
                  <div style={{ fontSize: 11, color: C.hint, marginTop: 2 }}>
                    등록 {new Date(p.created_at).toLocaleDateString("ko-KR")}
                    {p.last_used_at ? ` · 마지막 사용 ${new Date(p.last_used_at).toLocaleDateString("ko-KR")}` : ""}
                  </div>
                </div>
                <button onClick={() => remove(p.id)} title="삭제" style={{
                  width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.border}`,
                  background: "transparent", cursor: "pointer", display: "flex",
                  alignItems: "center", justifyContent: "center", color: C.danger, flexShrink: 0,
                }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        <p style={{ marginTop: 20, fontSize: 11.5, color: C.hint, lineHeight: 1.7 }}>
          패스키는 등록한 도메인에서만 동작해요. 항상 같은 주소(olivia.photoclinic.kr)로 접속해서 등록해주세요 —
          다른 미리보기 주소에서 등록하면 실제 서비스 로그인에서는 동작하지 않아요.
        </p>
      </div>
    </main>
  );
}
