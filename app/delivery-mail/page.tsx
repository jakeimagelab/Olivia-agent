"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";

const C = {
  teal: "#155855", orange: "#E85D2C",
  bg: "#EDF5F3", surface: "#FFFFFF", border: "#C8DDD9",
  muted: "#5A7470", hint: "#9BB5B0", txt: "#1C2B28", mint: "#EAF4F2",
};

export default function DeliveryMailPage() {
  const [hospitalName, setHospitalName] = useState("");
  const [toName,       setToName]       = useState("");
  const [toEmail,      setToEmail]      = useState("");
  const [shootDate,    setShootDate]    = useState("");
  const [packageName,  setPackageName]  = useState("");
  const [fileCount,    setFileCount]    = useState("");
  const [nasLink,      setNasLink]      = useState("");
  const [message,      setMessage]      = useState("");
  const [preview,      setPreview]      = useState(false);
  const [sending,      setSending]      = useState(false);
  const [result,       setResult]       = useState<"success"|"error"|null>(null);
  const [errMsg,       setErrMsg]       = useState("");

  // 연락처 관련
  const [session, setSession] = useState<{name:string;email:string;accessToken:string}|null>(null);

  // 세션 확인
  useEffect(() => {
    fetch("/api/auth/session")
      .then(r => r.json())
      .then(d => { if (d.ok) setSession(d.session); })
      .catch(() => {});
  }, []);

  // URL 파라미터로 로그인 결과 확인
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("auth") === "success") {
      fetch("/api/auth/session")
        .then(r => r.json())
        .then(d => { if (d.ok) setSession(d.session); });
      window.history.replaceState({}, "", "/delivery-mail");
    }
  }, []);
  const [contacts,       setContacts]       = useState<{name:string;email:string;phone:string;org:string}[]>([]);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const [contactSearch,  setContactSearch]  = useState("");
  const [showDropdown,   setShowDropdown]   = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadContacts = async () => {
    if (contactsLoaded) return;
    try {
      const res  = await fetch("/api/contacts");
      const data = await res.json();
      if (data.ok) { setContacts(data.contacts); setContactsLoaded(true); }
    } catch (e) {}
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setShowDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
    c.email.toLowerCase().includes(contactSearch.toLowerCase()) ||
    c.org.toLowerCase().includes(contactSearch.toLowerCase())
  ).slice(0, 8);

  const iS: React.CSSProperties = {
    width: "100%", border: `1px solid ${C.border}`, borderRadius: 9,
    padding: "10px 13px", fontSize: 13, fontFamily: "inherit",
    background: C.surface, color: C.txt, outline: "none",
  };

  const handleSend = async () => {
    if (!toEmail || !hospitalName || !nasLink) {
      setErrMsg("수신 이메일, 고객, NAS 링크는 필수입니다"); return;
    }
    setSending(true); setErrMsg(""); setResult(null);
    try {
      const res  = await fetch("/api/send-delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: toEmail, toName, hospitalName, shootDate, packageName, fileCount: fileCount ? Number(fileCount) : null, nasLink, message }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setResult("success");
    } catch (e: any) {
      setErrMsg(e.message); setResult("error");
    } finally {
      setSending(false);
    }
  };

  const resetForm = () => {
    setHospitalName(""); setToName(""); setToEmail(""); setShootDate("");
    setPackageName(""); setFileCount(""); setNasLink(""); setMessage("");
    setResult(null); setErrMsg(""); setPreview(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Noto Sans KR', sans-serif" }}>

      {/* NAV */}
      <nav style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, height: 54,
                    padding: "0 24px", display: "flex", alignItems: "center", gap: 12,
                    position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 6px rgba(21,88,85,.07)" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="11" fill="#E85D2C"/>
            <circle cx="12" cy="12" r="11" fill="#155855" clipPath="url(#nav1)"/>
            <defs><clipPath id="nav1"><rect x="12" y="0" width="12" height="24"/></clipPath></defs>
            <circle cx="12" cy="12" r="7" fill="#EB8F22"/>
            <circle cx="12" cy="12" r="7" fill="#569082" clipPath="url(#nav1)"/>
            <circle cx="12" cy="12" r="3" fill="white"/>
          </svg>
          <span style={{ fontSize: 12, color: C.hint }}>← 대시보드</span>
        </Link>
        <div style={{ width: 1, height: 16, background: C.border }}/>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.teal }}>파일 전송 메일</div>
          <div style={{ fontSize: 9, color: C.hint }}>NAS 링크 → 포토클리닉 브랜드 메일로 전달</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={() => setPreview(!preview)}
            style={{ height: 34, padding: "0 16px", background: preview ? C.mint : C.surface,
                     border: `1px solid ${preview ? C.teal : C.border}`,
                     borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                     color: preview ? C.teal : C.muted, fontFamily: "inherit" }}>
            {preview ? "✓ 미리보기 ON" : "미리보기"}
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: preview ? 1100 : 560, margin: "0 auto", padding: "28px 20px",
                    display: "grid", gridTemplateColumns: preview ? "1fr 1fr" : "1fr", gap: 24, alignItems: "start" }}>

        {/* 입력 폼 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* 고객 정보 */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ background: C.mint, padding: "13px 20px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.teal }}>📋 사진 전달</div>
            </div>
            <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".04em" }}>
                    고객 *
                  </label>
                  <input value={hospitalName} onChange={e => setHospitalName(e.target.value)}
                    placeholder="고객사명" style={iS}/>
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".04em" }}>
                    촬영일
                  </label>
                  <input type="date" value={shootDate} onChange={e => setShootDate(e.target.value)} style={iS}/>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".04em" }}>
                    촬영 내용
                  </label>
                  <input value={packageName} onChange={e => setPackageName(e.target.value)}
                    placeholder="Premium 촬영 내용" style={iS}/>
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".04em" }}>
                    전달 수량 (장)
                  </label>
                  <input type="number" value={fileCount} onChange={e => setFileCount(e.target.value)}
                    placeholder="120" style={iS}/>
                </div>
              </div>
            </div>
          </div>

          {/* 받는 분 정보 */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ background: C.mint, padding: "13px 20px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.teal }}>👤 받는 분</div>
            </div>
            <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".04em" }}>
                    담당자명
                  </label>
                  <input value={toName} onChange={e => setToName(e.target.value)}
                    placeholder="홍길동 실장님" style={iS}/>
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".04em" }}>
                    이메일 *
                  </label>
                  <div style={{ position: "relative" }} ref={dropdownRef}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input type="email" value={toEmail}
                        onChange={e => { setToEmail(e.target.value); setContactSearch(e.target.value); setShowDropdown(true); }}
                        onFocus={() => { setShowDropdown(true); if (!contactsLoaded && session) loadContacts(); }}
                        placeholder="client@email.com" style={{ ...iS, flex: 1 }}/>
                      {session ? (
                        <button onClick={() => { setShowDropdown(!showDropdown); loadContacts(); }}
                          style={{ height: 38, padding: "0 10px", background: C.mint, border: `1px solid ${C.border}`,
                                   borderRadius: 8, fontSize: 14, cursor: "pointer", flexShrink: 0 }}
                          title="연락처 검색">👥</button>
                      ) : (
                        <button onClick={() => window.location.href = "/api/auth/google"}
                          style={{ height: 38, padding: "0 10px", background: "#fff", border: `1px solid ${C.border}`,
                                   borderRadius: 8, fontSize: 10, cursor: "pointer", fontFamily: "inherit",
                                   color: C.muted, fontWeight: 700, flexShrink: 0, whiteSpace: "nowrap" }}>
                          G 연락처
                        </button>
                      )}
                    </div>
                    {showDropdown && filteredContacts.length > 0 && (
                      <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200,
                                     background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
                                     boxShadow: "0 4px 16px rgba(0,0,0,.1)", marginTop: 4,
                                     maxHeight: 240, overflowY: "auto" }}>
                        <div style={{ padding: "6px 10px", borderBottom: `1px solid ${C.border}` }}>
                          <input value={contactSearch} onChange={e => setContactSearch(e.target.value)}
                            placeholder="이름·이메일·회사 검색..."
                            style={{ ...iS, height: 30, fontSize: 11, padding: "4px 10px" }}/>
                        </div>
                        {filteredContacts.map((c, i) => (
                          <div key={i}
                            onClick={() => { setToEmail(c.email); setToName(c.name); setHospitalName(prev => prev || c.org); setShowDropdown(false); setContactSearch(""); }}
                            style={{ padding: "9px 12px", cursor: "pointer", borderBottom: `1px solid ${C.border}`,
                                     display: "flex", flexDirection: "column", gap: 2 }}
                            onMouseEnter={e => (e.currentTarget.style.background = C.mint)}
                            onMouseLeave={e => (e.currentTarget.style.background = "")}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: C.txt }}>{c.name}</span>
                            <span style={{ fontSize: 11, color: C.muted }}>{c.email}</span>
                            {c.org && <span style={{ fontSize: 10, color: C.hint }}>{c.org}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {session ? (
                    <div style={{ fontSize: 10, color: C.hint, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                      <span>✓ Google 연락처 {contactsLoaded ? `${contacts.length}명` : "연동됨"}</span>
                      <button onClick={() => window.location.href = "/api/auth/signout"} style={{ background: "none", border: "none", fontSize: 10, color: C.hint, cursor: "pointer", padding: 0 }}>연동 해제</button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {/* NAS 링크 */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ background: C.mint, padding: "13px 20px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.teal }}>🔗 다운로드 링크</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>NAS 공유 링크를 붙여넣으세요</div>
            </div>
            <div style={{ padding: "18px 20px" }}>
              <input value={nasLink} onChange={e => setNasLink(e.target.value)}
                placeholder="https://nas.photoclinic.kr/share/..." style={{ ...iS, fontSize: 12 }}/>
              {nasLink && (
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6,
                               fontSize: 11, color: C.teal }}>
                  <span>✓</span>
                  <a href={nasLink} target="_blank" rel="noopener"
                    style={{ color: C.teal, textOverflow: "ellipsis", overflow: "hidden",
                              whiteSpace: "nowrap", maxWidth: 320 }}>
                    {nasLink}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* 메일 본문 */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ background: C.mint, padding: "13px 20px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.teal }}>✉️ 추가 메시지 (선택)</div>
            </div>
            <div style={{ padding: "18px 20px" }}>
              <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3}
                placeholder={`${hospitalName || "○○기업"} 촬영 파일 전송을 안내드립니다.\n아래 링크에서 사진을 다운로드해 주세요.`}
                style={{ ...iS, resize: "vertical", lineHeight: 1.7 }}/>
              <div style={{ fontSize: 10, color: C.hint, marginTop: 5 }}>
                입력하지 않으면 기본 문구로 발송됩니다
              </div>
            </div>
          </div>

          {/* 에러 */}
          {errMsg && (
            <div style={{ padding: "11px 14px", background: "#FFF0EB", border: `1px solid #FACCB8`,
                           borderRadius: 9, fontSize: 12, color: C.orange }}>
              ⚠ {errMsg}
            </div>
          )}

          {/* 성공 */}
          {result === "success" && (
            <div style={{ padding: "16px 20px", background: C.mint, border: `1px solid ${C.teal}`,
                           borderRadius: 12, textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.teal, marginBottom: 4 }}>
                메일 발송 완료!
              </div>
              <div style={{ fontSize: 12, color: C.muted }}>
                {toEmail} 로 파일 전송 메일이 발송됐어요
              </div>
              <button onClick={resetForm}
                style={{ marginTop: 12, height: 36, padding: "0 20px", background: C.teal,
                         color: "#fff", border: "none", borderRadius: 8, fontSize: 12,
                         fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                새 메일 작성
              </button>
            </div>
          )}

          {/* 발송 버튼 */}
          {result !== "success" && (
            <button onClick={handleSend} disabled={sending || !toEmail || !hospitalName || !nasLink}
              style={{ width: "100%", height: 50, background: sending ? C.hint : C.orange,
                       color: "#fff", border: "none", borderRadius: 12, fontSize: 15,
                       fontWeight: 700, cursor: sending || !toEmail || !hospitalName || !nasLink ? "not-allowed" : "pointer",
                       fontFamily: "inherit", display: "flex", alignItems: "center",
                       justifyContent: "center", gap: 8 }}>
              {sending ? "발송 중..." : `📨 ${hospitalName || "고객"}에 사진 전달 메일 발송`}
            </button>
          )}

        </div>

        {/* 메일 미리보기 */}
        {preview && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", position: "sticky", top: 70 }}>
            <div style={{ background: C.mint, padding: "13px 20px", borderBottom: `1px solid ${C.border}`,
                           display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.teal }}>📧 메일 미리보기</div>
              <div style={{ fontSize: 11, color: C.muted }}>실제 발송될 메일 디자인</div>
            </div>
            <div style={{ padding: 16, background: "#F0F7F5" }}>
              {/* 미니 메일 미리보기 */}
              <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,.08)" }}>
                {/* 헤더 */}
                <div style={{ background: C.teal, padding: "20px 24px", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,.55)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>PHOTO CLINIC</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", marginBottom: 3 }}>촬영 파일 전송 안내</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,.6)" }}>{new Date().toLocaleDateString("ko-KR")}</div>
                </div>
                {/* 내용 */}
                <div style={{ padding: "20px 24px" }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: C.txt, marginBottom: 6 }}>
                    안녕하세요, {toName || hospitalName || "담당자"}님 👋
                  </p>
                  <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.7, marginBottom: 16 }}>
                    {message || `${hospitalName || "○○기업"} 촬영 파일 전송을 안내드립니다. 아래 링크에서 사진을 다운로드해 주세요.`}
                  </p>
                  {/* 사진 전달 */}
                  <div style={{ background: C.mint, borderRadius: 9, padding: "13px 16px", marginBottom: 14 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: C.teal, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 9 }}>사진 전달</div>
                    {hospitalName && <div style={{ display: "flex", gap: 8, fontSize: 11, marginBottom: 4 }}><span style={{ color: C.hint, minWidth: 60 }}>고객</span><span style={{ fontWeight: 600 }}>{hospitalName}</span></div>}
                    {shootDate && <div style={{ display: "flex", gap: 8, fontSize: 11, marginBottom: 4 }}><span style={{ color: C.hint, minWidth: 60 }}>촬영일</span><span style={{ fontWeight: 600 }}>{shootDate}</span></div>}
                    {packageName && <div style={{ display: "flex", gap: 8, fontSize: 11, marginBottom: 4 }}><span style={{ color: C.hint, minWidth: 60 }}>촬영 내용</span><span style={{ fontWeight: 600 }}>{packageName}</span></div>}
                    {fileCount && <div style={{ display: "flex", gap: 8, fontSize: 11 }}><span style={{ color: C.hint, minWidth: 60 }}>전달 수량</span><span style={{ fontWeight: 700, color: C.orange }}>{fileCount}장</span></div>}
                  </div>
                  {/* 다운로드 버튼 */}
                  <div style={{ background: "#F8FAFA", border: `2px dashed ${C.border}`, borderRadius: 9, padding: "16px", textAlign: "center", marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: C.hint, marginBottom: 8 }}>아래 버튼을 클릭하여 사진을 다운로드하세요</div>
                    <div style={{ background: C.orange, color: "#fff", display: "inline-block",
                                   padding: "9px 24px", borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
                      📁 사진 다운로드
                    </div>
                    {nasLink && (
                      <div style={{ fontSize: 9, color: C.hint, marginTop: 7, wordBreak: "break-all" }}>
                        {nasLink.length > 50 ? nasLink.slice(0, 50) + "..." : nasLink}
                      </div>
                    )}
                  </div>
                  {/* 안내사항 */}
                  <div style={{ background: "#FFF8F5", borderLeft: `3px solid ${C.orange}`, padding: "10px 12px", borderRadius: "0 6px 6px 0" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: C.orange, marginBottom: 4 }}>📌 이용 안내</div>
                    <div style={{ fontSize: 9, color: C.muted, lineHeight: 1.8 }}>
                      · 링크 유효기간: 수신 후 30일 이내 다운로드 권장<br/>
                      · 파일 형식: JPG (고해상도)<br/>
                      · 문의사항은 언제든지 연락 주세요
                    </div>
                  </div>
                </div>
                {/* 푸터 */}
                <div style={{ background: C.mint, padding: "12px 20px", textAlign: "center", borderTop: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 9, color: C.hint, lineHeight: 1.8 }}>
                    PHOTO CLINIC · 제이크이미지연구소 · @photoclinic_kr
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
