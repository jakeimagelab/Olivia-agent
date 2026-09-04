"use client";

import Image from "next/image";
import { type FormEvent, useEffect, useState } from "react";
import { Fingerprint, LockKeyhole } from "lucide-react";
import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";
import OliviaDesktop from "@/components/olivia-os/OliviaDesktop";

function LoginScreen({ onAuth }: { onAuth: () => void }) {
  const [mode, setMode] = useState<"passkey" | "password">("password");
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState("");
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  useEffect(() => {
    const supported = browserSupportsWebAuthn();
    setPasskeySupported(supported);
    if (supported) setMode("passkey");
  }, []);

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordError("");
    setPasswordBusy(true);
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (data.ok) {
        setPassword("");
        onAuth();
      } else {
        setPasswordError(data.error || "비밀번호를 다시 확인해주세요.");
      }
    } catch {
      setPasswordError("로그인 서버에 연결할 수 없습니다.");
    } finally {
      setPasswordBusy(false);
    }
  };

  const loginWithPasskey = async () => {
    setPasskeyError("");
    setPasskeyBusy(true);
    try {
      const optionsResponse = await fetch("/api/auth/passkey/login-options", { method: "POST" });
      const optionsData = await optionsResponse.json().catch(() => null);
      if (!optionsData?.ok) {
        throw new Error(optionsData?.error || "등록된 패스키가 없거나 서버에 연결할 수 없어요.");
      }
      const authentication = await startAuthentication({ optionsJSON: optionsData.options });
      const verifyResponse = await fetch("/api/auth/passkey/login-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: authentication }),
      });
      const verifyData = await verifyResponse.json().catch(() => null);
      if (!verifyData?.ok) throw new Error(verifyData?.error || "패스키 인증에 실패했어요.");
      onAuth();
    } catch (error) {
      setPasskeyError(error instanceof Error ? error.message : "패스키 로그인에 실패했어요.");
      setMode("password");
    } finally {
      setPasskeyBusy(false);
    }
  };

  return (
    <main className="admin-shell">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="brand-lockup">
          <Image src="/assets/photoclinic-logo.png" alt="포토클리닉" width={64} height={64} priority />
          <span>Admin Console</span>
        </div>
        <div>
          <p className="admin-kicker">병원 · 메디컬 성장 플랫폼</p>
          <h1 id="login-title">포토클리닉 AI 비서 관리자</h1>
          <p className="login-copy">
            {mode === "passkey"
              ? "Touch ID · Face ID로 빠르고 안전하게 로그인하세요."
              : "관리자 비밀번호를 입력하면 OLIVIA OS로 바로 이동합니다."}
          </p>
        </div>

        {mode === "passkey" ? (
          <div className="login-form">
            <button type="button" className="passkey-cta" onClick={loginWithPasskey} disabled={passkeyBusy}>
              <span className="passkey-cta-icon"><Fingerprint size={26} /></span>
              <span>
                <strong>{passkeyBusy ? "인증 중..." : "Face ID / Touch ID로 로그인"}</strong>
                <small>이 기기의 생체인증으로 바로 접속</small>
              </span>
            </button>
            {passkeyError ? <p className="login-error">{passkeyError}</p> : null}
            <button type="button" className="login-alt-link" onClick={() => { setPasskeyError(""); setMode("password"); }}>
              비밀번호로 로그인
            </button>
          </div>
        ) : (
          <form className="login-form" onSubmit={submitPassword}>
            <label className="field">
              <span>비밀번호</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="관리자 비밀번호"
                autoComplete="current-password"
              />
            </label>
            {passwordError ? <p className="login-error">{passwordError}</p> : null}
            <button className="admin-primary-button" type="submit" disabled={passwordBusy}>
              <LockKeyhole size={18} />{passwordBusy ? "확인 중..." : "로그인"}
            </button>
            {passkeySupported ? (
              <button type="button" className="login-alt-link" onClick={() => { setPasswordError(""); setMode("passkey"); }}>
                <Fingerprint size={13} /> 패스키로 로그인
              </button>
            ) : null}
          </form>
        )}
      </section>
    </main>
  );
}

export default function Home() {
  const [status, setStatus] = useState<"checking" | "authenticated" | "unauthenticated">("checking");

  useEffect(() => {
    fetch("/api/auth/check")
      .then((response) => response.json())
      .then((data) => setStatus(data.authenticated ? "authenticated" : "unauthenticated"))
      .catch(() => setStatus("unauthenticated"));
  }, []);

  if (status === "checking") {
    return <main className="admin-shell"><div className="admin-loading" /></main>;
  }
  if (status === "unauthenticated") {
    return <LoginScreen onAuth={() => setStatus("authenticated")} />;
  }
  return <OliviaDesktop />;
}
