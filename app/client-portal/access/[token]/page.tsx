"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function PortalAccessPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!token) { setMsg("유효하지 않은 링크입니다."); setStatus("error"); return; }
    fetch(`/api/client-portal/auth?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          localStorage.setItem("cp_token", token);
          localStorage.setItem("cp_session", JSON.stringify(d.session));
          router.replace("/client-portal/dashboard");
        } else {
          setMsg(d.error ?? "링크가 만료되었거나 유효하지 않습니다.");
          setStatus("error");
        }
      })
      .catch(() => { setMsg("서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요."); setStatus("error"); });
  }, [token]);

  if (status === "loading") {
    return (
      <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, background:"#F7F4EF" }}>
        <img src="/assets/photoclinic-logo.png" alt="포토클리닉" style={{ height:28, opacity:.3 }} />
        <p style={{ fontSize:14, color:"#9BB5B0", margin:0 }}>인증 중입니다...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, textAlign:"center", background:"#F7F4EF" }}>
      <img src="/assets/photoclinic-logo.png" alt="포토클리닉" style={{ height:28, marginBottom:20, opacity:.4 }} />
      <div style={{ fontSize:40, marginBottom:12 }}>🔐</div>
      <h2 style={{ fontSize:18, fontWeight:800, margin:"0 0 8px" }}>접근할 수 없습니다</h2>
      <p style={{ fontSize:14, color:"#5A7470", lineHeight:1.7, margin:"0 0 8px", maxWidth:320 }}>{msg}</p>
      <p style={{ fontSize:12, color:"#9BB5B0" }}>포토클리닉 담당자에게 새 링크를 요청해주세요.</p>
    </div>
  );
}
