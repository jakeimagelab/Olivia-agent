"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { FormEvent, useEffect, useRef, useState } from "react";
import { TOOLS_WORK, TOOLS_CONTENT, type ToolDef } from "@/lib/toolNav";
import { startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import {
  Activity, BarChart2, ArrowRight, CalendarCheck, ClipboardList,
  FileVideo, Fingerprint, Globe2, ImageDown, Images, LockKeyhole, LogOut, Mail,
  NotebookPen, ShieldCheck, Sparkles, Users, Wand2, Lightbulb,
  AlertCircle, CheckCircle2, Clock, RefreshCw, Calendar, Check,
  FileText, Image, Star, Smartphone, CircleDollarSign, Pipette, Link2, Bell,
  ScanSearch, Search, Share2, TrendingUp,
} from "lucide-react";
import SharedDailyQuoteWidget from "@/components/dashboard/DailyQuoteWidget";

/* ─── types ─────────────────────────────────────────────── */

type MailType = "quote"|"contract"|"conti"|"proposal"|"original_files"|"gallery"|"review_form"|"monthly_report";
type MailStatus = "draft"|"ready"|"sent"|"failed";

interface MailItem   { id:string; type:MailType; hospital_name:string; status:MailStatus; created_at:string; }
interface ClientItem { id:string; name:string; workflow_status:string; updated_at:string; }
type CalTask = { id:string; title:string; category:string; completed:boolean; date:string; time?:string|null; location?:string|null; memo?:string|null; };

interface DashboardData {
  mailing: { pending:MailItem[]; failed:MailItem[]; recent:MailItem[] };
  clients: {
    quoteFollowUp:ClientItem[]; contractPending:ClientItem[];
    galleryPending:ClientItem[]; reviewPending:ClientItem[]; snsPending:ClientItem[];
  };
  todayIdea: { date:string; marketing_idea:{ title:string }; mission:{ title:string } }|null;
  recentMemos: { id:string; raw_memo:string; created_at:string }[];
  todayTasks: CalTask[];
}

const TYPE_LABELS: Record<MailType,string> = {
  quote:"견적서", contract:"계약서", conti:"촬영 콘티", proposal:"제안서",
  original_files:"원본 파일", gallery:"보정본 갤러리", review_form:"리뷰 Form", monthly_report:"월간 리포트",
};

/* ─── helpers ───────────────────────────────────────────── */

function relTime(iso:string) {
  const m=Math.floor((Date.now()-new Date(iso).getTime())/60000);
  if(m<1) return "방금"; if(m<60) return `${m}분 전`;
  const h=Math.floor(m/60); if(h<24) return `${h}시간 전`;
  return `${Math.floor(h/24)}일 전`;
}

/* ─── login ─────────────────────────────────────────────── */

function LoginScreen({ onAuth }:{ onAuth:()=>void }) {
  const [mode,setMode]=useState<"passkey"|"password">("password");
  const [passkeySupported,setPasskeySupported]=useState(false);
  const [passkeyBusy,setPasskeyBusy]=useState(false);
  const [passkeyErr,setPasskeyErr]=useState("");

  const [pw,setPw]=useState(""); const [err,setErr]=useState(""); const [busy,setBusy]=useState(false);

  useEffect(()=>{
    const supported = browserSupportsWebAuthn();
    setPasskeySupported(supported);
    if(supported) setMode("passkey");
  },[]);

  const submit=async(e:FormEvent)=>{
    e.preventDefault(); setErr(""); setBusy(true);
    try{
      const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:pw})});
      const d=await r.json();
      if(d.ok){setPw(""); onAuth();} else setErr(d.error||"비밀번호를 다시 확인해주세요.");
    }finally{setBusy(false);}
  };

  const loginWithPasskey=async()=>{
    setPasskeyErr(""); setPasskeyBusy(true);
    try{
      const optionsRes=await fetch("/api/auth/passkey/login-options",{method:"POST"});
      const optionsData=await optionsRes.json().catch(()=>null);
      if(!optionsData?.ok) throw new Error(optionsData?.error||"등록된 패스키가 없거나 서버에 연결할 수 없어요.");

      const response=await startAuthentication({optionsJSON:optionsData.options});

      const verifyRes=await fetch("/api/auth/passkey/login-verify",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({response}),
      });
      const verifyData=await verifyRes.json().catch(()=>null);
      if(!verifyData?.ok) throw new Error(verifyData?.error||"패스키 인증에 실패했어요.");
      onAuth();
    }catch(e){
      setPasskeyErr(e instanceof Error ? e.message : "패스키 로그인에 실패했어요.");
      setMode("password");
    }finally{
      setPasskeyBusy(false);
    }
  };

  return(
    <main className="admin-shell">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="brand-lockup">
          <img src="/assets/photoclinic-logo.png" alt="포토클리닉"/>
          <span>Admin Console</span>
        </div>
        <div>
          <p className="admin-kicker">병원 · 메디컬 성장 플랫폼</p>
          <h1 id="login-title">포토클리닉 AI 비서 관리자</h1>
          <p className="login-copy">
            {mode==="passkey"
              ? "Touch ID · Face ID로 빠르고 안전하게 로그인하세요."
              : "관리자 비밀번호를 입력하면 견적서, 병원이미지 진단, 채널 분석, 홍보 디자인, 사진 분류, 홈페이지 제작, 사진 보정으로 바로 이동할 수 있습니다."}
          </p>
        </div>

        {mode==="passkey" ? (
          <div className="login-form">
            <button type="button" className="passkey-cta" onClick={loginWithPasskey} disabled={passkeyBusy}>
              <span className="passkey-cta-icon"><Fingerprint size={26}/></span>
              <span>
                <strong>{passkeyBusy?"인증 중...":"Face ID / Touch ID로 로그인"}</strong>
                <small>이 기기의 생체인증으로 바로 접속</small>
              </span>
            </button>
            {passkeyErr&&<p className="login-error">{passkeyErr}</p>}
            <button type="button" className="login-alt-link" onClick={()=>{setPasskeyErr(""); setMode("password");}}>
              비밀번호로 로그인
            </button>
          </div>
        ) : (
          <form className="login-form" onSubmit={submit}>
            <label className="field"><span>비밀번호</span>
              <input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="관리자 비밀번호" autoComplete="off"/>
            </label>
            {err&&<p className="login-error">{err}</p>}
            <button className="admin-primary-button" type="submit" disabled={busy}>
              <LockKeyhole size={18}/>{busy?"확인 중...":"로그인"}
            </button>
            {passkeySupported&&(
              <button type="button" className="login-alt-link" onClick={()=>{setErr(""); setMode("passkey");}}>
                <Fingerprint size={13}/> 패스키로 로그인
              </button>
            )}
          </form>
        )}
      </section>
    </main>
  );
}

const CAT_COLORS: Record<string,string> = {
  shooting:"#E85D2C", client:"#155855", admin:"#7C3AED", general:"#5A7470",
};
const CAT_LABELS: Record<string,string> = {
  shooting:"촬영", client:"고객/미팅", admin:"행정", general:"기타",
};

/* ─── today tasks widget ─────────────────────────────────── */

function TodayTasks({ tasks, onRefresh }:{ tasks:CalTask[]; onRefresh:()=>void }) {
  const [list, setList] = useState<CalTask[]>(tasks);
  const [expandedId, setExpandedId] = useState<string|null>(null);
  useEffect(() => { setList(tasks); }, [tasks]);

  const toggle = async (task: CalTask) => {
    await fetch("/api/calendar", { method:"PATCH", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ id:task.id, completed:!task.completed }) });
    setList(prev => prev.map(t => t.id===task.id ? {...t, completed:!t.completed} : t));
  };

  const sorted = [...list].sort((a, b) => {
    if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
    const ta = a.time ? a.time.split("~")[0].trim() : "99:99";
    const tb = b.time ? b.time.split("~")[0].trim() : "99:99";
    return ta.localeCompare(tb);
  });
  const done = list.filter(t => t.completed).length;

  return (
    <div style={{ background:"#fff", borderRadius:12, border:"1px solid rgba(21,88,85,.1)", overflow:"hidden", boxShadow:"0 1px 8px rgba(21,88,85,.05)" }}>
      <div style={{ padding:"10px 14px", borderBottom:"1px solid rgba(21,88,85,.07)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <Calendar size={13} color="#155855"/>
          <span style={{ fontSize:10, fontWeight:900, color:"#155855", letterSpacing:".08em", textTransform:"uppercase" }}>오늘 할일</span>
          {list.length>0 && <span style={{ fontSize:10, color:"#9BB5B0", fontWeight:700 }}>{done}/{list.length}</span>}
        </div>
        <Link href="/calendar" style={{ fontSize:10, fontWeight:800, color:"#155855", textDecoration:"none" }}>캘린더 →</Link>
      </div>

      {sorted.length===0 ? (
        <div style={{ padding:"14px", textAlign:"center" }}>
          <div style={{ fontSize:11, color:"#9BB5B0", marginBottom:6 }}>오늘 등록된 할일이 없어요</div>
          <Link href="/calendar" style={{ fontSize:11, fontWeight:800, color:"#E85D2C", textDecoration:"none" }}>+ 할일 추가하기</Link>
        </div>
      ) : (
        <div style={{ padding:"6px 8px", display:"flex", flexDirection:"column", gap:1 }}>
          {sorted.map(task => {
            const isExp = expandedId === task.id;
            const catColor = CAT_COLORS[task.category]||"#5A7470";
            return (
              <div key={task.id} style={{ borderRadius:7, overflow:"hidden", transition:"background .1s",
                background: isExp ? "#F0F9F7" : "transparent" }}>
                <button onClick={() => setExpandedId(isExp ? null : task.id)} style={{
                  display:"flex", alignItems:"center", gap:8, padding:"7px 8px",
                  background:"transparent", border:"none", cursor:"pointer", textAlign:"left", width:"100%",
                }}>
                  {/* 완료 체크 */}
                  <div onClick={e=>{ e.stopPropagation(); toggle(task); }} style={{
                    width:16, height:16, borderRadius:"50%", flexShrink:0,
                    border:`2px solid ${task.completed ? catColor : "#C8DDD9"}`,
                    background: task.completed ? catColor : "transparent",
                    display:"flex", alignItems:"center", justifyContent:"center", transition:"all .15s",
                  }}>
                    {task.completed && <Check size={9} color="#fff" strokeWidth={3}/>}
                  </div>
                  {/* 시간 뱃지 */}
                  {task.time && (
                    <span style={{ fontSize:9, fontWeight:800, color:"#155855", background:"#EAF4F2",
                      padding:"1px 5px", borderRadius:4, flexShrink:0 }}>
                      {task.time}
                    </span>
                  )}
                  {/* 제목 */}
                  <span style={{ fontSize:12, fontWeight:700, color: task.completed ? "#9BB5B0" : "#1C2B28", flex:1,
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                    textDecoration: task.completed ? "line-through" : "none" }}>
                    {task.title}
                  </span>
                  <span style={{ fontSize:9, fontWeight:800, color: catColor, flexShrink:0 }}>
                    {CAT_LABELS[task.category]||"기타"}
                  </span>
                </button>
                {/* 펼침 디테일 */}
                {isExp && (
                  <div style={{ padding:"0 8px 8px 32px", display:"flex", flexDirection:"column", gap:3 }}>
                    {task.location && <span style={{ fontSize:11, color:"#5A7470" }}>📍 {task.location}</span>}
                    {task.memo    && <span style={{ fontSize:11, color:"#5A7470", lineHeight:1.55 }}>📋 {task.memo}</span>}
                    <Link href="/calendar" style={{ fontSize:10, fontWeight:800, color:"#E85D2C", textDecoration:"none", marginTop:2 }}>
                      캘린더에서 보기 →
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 진행률 바 */}
      {list.length>0 && (
        <div style={{ height:3, background:"#EAF4F2" }}>
          <div style={{ height:"100%", background:"#155855", width:`${(done/list.length)*100}%`, transition:"width .3s", borderRadius:"0 99px 99px 0" }}/>
        </div>
      )}
    </div>
  );
}

/* ─── olivia greeting (compact) ─────────────────────────── */

function TodayAlertBanner({tasks, totalPending}:{tasks:CalTask[]; totalPending:number}) {
  // now는 마운트 전까지 null — 서버 렌더와 클라이언트 첫 렌더를 동일하게 유지해 hydration mismatch를 피한다
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hour = now ? now.getHours() : null;
  const greeting = hour === null ? "안녕하세요" : hour < 12 ? "좋은 아침이에요" : hour < 18 ? "수고하고 계세요" : "오늘도 고생많으셨어요";
  const today = now ? now.toLocaleDateString("ko-KR",{month:"long",day:"numeric",weekday:"short"}) : "";
  const clock = now ? now.toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}) : "--:--:--";

  const remaining = tasks.filter(t=>!t.completed);
  const done = tasks.filter(t=>t.completed).length;
  const nextTask = remaining.sort((a,b)=>{
    const ta=a.time?a.time.split("~")[0].trim():"99:99";
    const tb=b.time?b.time.split("~")[0].trim():"99:99";
    return ta.localeCompare(tb);
  })[0];

  return(
    <div style={{background:"linear-gradient(135deg,#155855 0%,#0d3e3b 100%)",borderRadius:14,padding:"14px 16px",boxShadow:"0 4px 20px rgba(21,88,85,.18)"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:28,height:28,borderRadius:8,background:"rgba(232,93,44,.85)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <Bell size={13} color="#fff"/>
          </div>
          <div>
            <div style={{fontSize:9,fontWeight:900,color:"rgba(255,255,255,.45)",letterSpacing:".1em",textTransform:"uppercase"}}>OLIVIA DAILY BRIEF</div>
            <div style={{fontSize:10,color:"rgba(255,255,255,.5)"}}>{today}</div>
          </div>
        </div>
        {totalPending>0&&(
          <div style={{background:"#E85D2C",borderRadius:99,padding:"2px 10px",fontSize:11,fontWeight:900,color:"#fff"}}>
            대기 {totalPending}건
          </div>
        )}
      </div>

      <div style={{
        textAlign:"center", padding:"10px 0", marginBottom:10,
        borderTop:"1px solid rgba(255,255,255,.1)", borderBottom:"1px solid rgba(255,255,255,.1)",
      }}>
        <div style={{
          fontSize:26, fontWeight:800, color:"#6EE7B7",
          fontVariantNumeric:"tabular-nums", letterSpacing:".08em",
          fontFamily:"'SF Mono','Menlo','Consolas',monospace",
        }}>{clock}</div>
      </div>

      <p style={{fontSize:13,fontWeight:700,color:"#fff",margin:"0 0 10px",lineHeight:1.5}}>
        {greeting}, 정연호 대표님.
        {remaining.length>0
          ? <> 오늘 할일 <span style={{color:"#EB8F22",fontWeight:900}}>{remaining.length}개</span> 남았어요.</>
          : tasks.length>0
            ? <> 오늘 할일 <span style={{color:"#6EE7B7",fontWeight:900}}>모두 완료</span>했어요!</>
            : <> 오늘 등록된 일정이 없어요.</>
        }
      </p>

      {nextTask&&(
        <Link href="/calendar" style={{textDecoration:"none"}}>
          <div style={{background:"rgba(255,255,255,.1)",borderRadius:9,padding:"8px 12px",display:"flex",alignItems:"center",gap:8,border:"1px solid rgba(255,255,255,.12)"}}>
            <Clock size={11} color="rgba(255,255,255,.6)"/>
            <span style={{fontSize:11,color:"rgba(255,255,255,.7)",flexShrink:0}}>다음:</span>
            {nextTask.time&&<span style={{fontSize:10,fontWeight:800,color:"#EB8F22",background:"rgba(235,143,34,.2)",padding:"1px 6px",borderRadius:4,flexShrink:0}}>{nextTask.time}</span>}
            <span style={{fontSize:11,fontWeight:700,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nextTask.title}</span>
          </div>
        </Link>
      )}

      {tasks.length>0&&done>0&&(
        <div style={{marginTop:8,height:3,background:"rgba(255,255,255,.1)",borderRadius:99}}>
          <div style={{height:"100%",background:"#6EE7B7",width:`${(done/tasks.length)*100}%`,borderRadius:99,transition:"width .4s"}}/>
        </div>
      )}
      <style>{`@keyframes blink{50%{opacity:0}}`}</style>
    </div>
  );
}

/* ─── task chip (compact) ────────────────────────────────── */

interface TaskChipProps { icon:React.ComponentType<{size?:number;color?:string}>; label:string; count:number; href:string; accent:string; warn?:boolean; }

function TaskChip({icon:Icon,label,count,href,accent,warn}:TaskChipProps) {
  const empty=count===0;
  return(
    <Link href={href} style={{textDecoration:"none"}}>
      <div style={{
        display:"flex",alignItems:"center",gap:10,
        background:"#fff",borderRadius:10,padding:"11px 14px",
        border:`1px solid ${empty?"rgba(21,88,85,.1)":accent+"28"}`,
        boxShadow:empty?"0 1px 4px rgba(21,88,85,.04)":"0 2px 12px rgba(21,88,85,.07)",
        transition:"transform .15s,box-shadow .15s,border-color .15s",cursor:"pointer",
      }}
      onMouseEnter={e=>{const el=e.currentTarget as HTMLElement; el.style.transform="translateY(-2px)"; el.style.boxShadow="0 6px 20px rgba(21,88,85,.12)"; el.style.borderColor=accent+"50";}}
      onMouseLeave={e=>{const el=e.currentTarget as HTMLElement; el.style.transform=""; el.style.boxShadow=empty?"0 1px 4px rgba(21,88,85,.04)":"0 2px 12px rgba(21,88,85,.07)"; el.style.borderColor=empty?"rgba(21,88,85,.1)":accent+"28";}}
      >
        <div style={{width:28,height:28,borderRadius:7,background:empty?"#EAF4F2":accent+"18",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <Icon size={14} color={empty?"#9BB5B0":accent}/>
        </div>
        <span style={{fontSize:12,fontWeight:800,color:"#1C2B28",flex:1,lineHeight:1.25}}>{label}</span>
        {warn&&!empty&&<AlertCircle size={11} color="#E85D2C" style={{flexShrink:0}}/>}
        <span style={{
          minWidth:24,height:24,borderRadius:99,padding:"0 6px",
          background:empty?"#EAF4F2":accent,
          color:empty?"#9BB5B0":"#fff",
          fontSize:12,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
        }}>{count}</span>
      </div>
    </Link>
  );
}

/* ─── daily quote widget ─────────────────────────────────── */

const DAILY_QUOTES: { text: string; author: string }[] = [
  { text: "성공은 최종적인 것이 아니고, 실패는 치명적인 것이 아니다. 중요한 것은 계속할 수 있는 용기다.", author: "윈스턴 처칠" },
  { text: "당신의 시간은 한정되어 있다. 그러니 다른 사람의 삶을 사느라 시간을 낭비하지 마라.", author: "스티브 잡스" },
  { text: "어제로부터 배우고, 오늘을 살고, 내일을 희망하라. 중요한 것은 질문을 멈추지 않는 것이다.", author: "알베르트 아인슈타인" },
  { text: "가장 위대한 영광은 한 번도 넘어지지 않는 것이 아니라, 넘어질 때마다 다시 일어나는 데 있다.", author: "넬슨 만델라" },
  { text: "꿈꿀 수 있다면 이룰 수 있다.", author: "월트 디즈니" },
  { text: "사람들은 당신이 한 말은 잊어도, 당신이 준 느낌은 잊지 않는다.", author: "마야 안젤루" },
  { text: "할 수 있다고 믿든 할 수 없다고 믿든, 당신 생각이 옳다.", author: "헨리 포드" },
  { text: "세상에서 보고 싶은 변화가 있다면, 당신 자신이 그 변화가 되어라.", author: "마하트마 간디" },
  { text: "가야 할 길이 아무리 느리더라도, 멈추지만 않는다면 상관없다.", author: "공자" },
  { text: "우리가 반복적으로 하는 행동이 바로 우리 자신이다. 그러므로 탁월함은 행위가 아니라 습관이다.", author: "아리스토텔레스" },
  { text: "나는 실패한 적이 없다. 단지 작동하지 않는 만 가지 방법을 발견했을 뿐이다.", author: "토머스 에디슨" },
  { text: "미래는 자신의 꿈의 아름다움을 믿는 사람들의 것이다.", author: "엘리너 루스벨트" },
  { text: "어둠은 어둠을 몰아낼 수 없다. 오직 빛만이 그것을 할 수 있다.", author: "마틴 루터 킹" },
  { text: "인생에서 두려워할 것은 없다. 다만 이해해야 할 것이 있을 뿐이다.", author: "마리 퀴리" },
  { text: "위대한 일은 충동이 아니라, 작은 일들이 모여서 이루어진다.", author: "빈센트 반 고흐" },
  { text: "성공이란 자주, 그리고 많이 웃는 것이다.", author: "랄프 왈도 에머슨" },
  { text: "투자는 지식에 대한 것일 때 가장 큰 이자를 돌려준다.", author: "벤저민 프랭클린" },
  { text: "너무 조심스럽게 살아서 아무것도 실패하지 않는다면, 그것 자체가 실패한 삶이다.", author: "조앤 K. 롤링" },
  { text: "불가능, 그것은 아무것도 아니다.", author: "무하마드 알리" },
  { text: "무언가가 충분히 중요하다면, 확률이 자신에게 불리하더라도 해야 한다.", author: "일론 머스크" },
  { text: "명성을 쌓는 데는 20년이 걸리지만, 무너뜨리는 데는 5분이면 충분하다.", author: "워런 버핏" },
  { text: "미래를 예측하는 가장 좋은 방법은 미래를 창조하는 것이다.", author: "피터 드러커" },
  { text: "천 리 길도 한 걸음부터.", author: "노자" },
  { text: "행복은 나눈다고 줄어들지 않는다.", author: "석가모니" },
  { text: "나는 내가 아무것도 모른다는 것을 안다.", author: "소크라테스" },
  { text: "온 세상은 무대이고, 모든 남녀는 배우일 뿐이다.", author: "윌리엄 셰익스피어" },
  { text: "아름다운 눈을 가지고 싶다면 다른 사람에게서 좋은 점을 찾아라.", author: "오드리 헵번" },
  { text: "세상을 개선하는 데 단 한 순간도 기다릴 필요가 없다는 것, 이 얼마나 멋진 일인가.", author: "안네 프랑크" },
  { text: "한 명의 아이, 한 명의 선생님, 한 자루의 펜, 한 권의 책이 세상을 바꿀 수 있다.", author: "말랄라 유사프자이" },
  { text: "지능은 변화에 적응하는 능력이다.", author: "스티븐 호킹" },
  { text: "살아남는 종은 가장 강한 종이 아니라, 변화에 가장 잘 적응하는 종이다.", author: "찰스 다윈" },
  { text: "마음이 품고 믿을 수 있는 것은 무엇이든 이룰 수 있다.", author: "나폴레온 힐" },
  { text: "성공은 자신이 하는 일을 사랑하는 데서 온다.", author: "데일 카네기" },
  { text: "사람들은 당신이 무엇을 하는지가 아니라, 왜 그것을 하는지에 대해 산다.", author: "사이먼 시넥" },
  { text: "기회는 버스와 같다. 늘 또 다른 것이 온다.", author: "리처드 브랜슨" },
  { text: "나는 농구 인생에서 9000번 넘게 슛을 놓쳤다. 그래서 나는 성공한다.", author: "마이클 조던" },
  { text: "재능이 노력하지 않을 때, 노력이 재능을 이긴다.", author: "코비 브라이언트" },
  { text: "대체 불가능한 사람이 되려면, 항상 남달라야 한다.", author: "코코 샤넬" },
  { text: "삶의 의미는 자신의 재능을 찾는 것이고, 삶의 목적은 그것을 나누어 주는 것이다.", author: "파블로 피카소" },
  { text: "혼자서는 아주 적은 일을 할 수 있지만, 함께라면 많은 것을 할 수 있다.", author: "헬렌 켈러" },
  { text: "우리의 삶은 우리가 하는 생각에 의해 만들어진다.", author: "마르쿠스 아우렐리우스" },
  { text: "행운은 준비가 기회를 만날 때 생긴다.", author: "세네카" },
  { text: "단순함이야말로 최고의 정교함이다.", author: "레오나르도 다빈치" },
  { text: "미래에는 여러 이름이 있다. 약한 자에게는 불가능이고, 소심한 자에게는 미지수며, 용감한 자에게는 기회다.", author: "빅토르 위고" },
  { text: "나를 죽이지 못하는 것은 나를 더 강하게 만든다.", author: "프리드리히 니체" },
  { text: "지금부터 20년 후, 당신은 한 일보다 하지 않은 일 때문에 더 실망할 것이다.", author: "마크 트웨인" },
  { text: "가장 큰 모험은 당신이 꿈꾸는 삶을 사는 것이다.", author: "오프라 윈프리" },
  { text: "성공을 축하하는 것도 좋지만, 실패에서 얻는 교훈에 더 주목하는 것이 중요하다.", author: "빌 게이츠" },
  { text: "중요한 것은 비판하는 사람이 아니라, 실제로 경기장 안에 서 있는 사람이다.", author: "시어도어 루스벨트" },
];

function todaysQuote() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return DAILY_QUOTES[dayOfYear % DAILY_QUOTES.length];
}

function DailyQuoteWidget() {
  return <SharedDailyQuoteWidget />;
}

/* ─── recent activity ────────────────────────────────────── */

function RecentActivity({data}:{data:DashboardData}) {
  const LIMIT=6;
  const rows=[
    ...data.mailing.recent.map(m=>({
      key:m.id, href:"/mailing",
      iconEl: m.status==="failed"?<AlertCircle size={11}/>:m.status==="ready"?<CheckCircle2 size={11}/>:<Clock size={11}/>,
      iconBg: m.status==="failed"?"#FFF0EB":m.status==="ready"?"#EAF4F2":"#F5F5F5",
      iconColor: m.status==="failed"?"#E85D2C":m.status==="ready"?"#155855":"#9BB5B0",
      name:m.hospital_name, sub:TYPE_LABELS[m.type]??m.type,
      statusLabel: m.status==="failed"?"실패":m.status==="ready"?"대기":"미입력",
      statusColor: m.status==="failed"?"#E85D2C":m.status==="ready"?"#155855":"#9BB5B0",
      time:relTime(m.created_at),
    })),
    ...data.recentMemos.map(m=>({
      key:m.id, href:"/memo",
      iconEl:<NotebookPen size={11}/>, iconBg:"#F5F0FF", iconColor:"#7C3AED",
      name:"상담 메모", sub:(m.raw_memo?.slice(0,28))||"",
      statusLabel:"메모", statusColor:"#7C3AED", time:relTime(m.created_at),
    })),
  ].slice(0,LIMIT);

  if(!rows.length) return null;
  return(
    <div style={{background:"#fff",borderRadius:12,border:"1px solid rgba(21,88,85,.1)",overflow:"hidden",boxShadow:"0 1px 8px rgba(21,88,85,.05)"}}>
      <div style={{padding:"10px 14px",borderBottom:"1px solid rgba(21,88,85,.07)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span style={{fontSize:10,fontWeight:900,color:"#E85D2C",letterSpacing:".08em",textTransform:"uppercase"}}>최근 활동</span>
        <Link href="/mailing" style={{fontSize:10,fontWeight:800,color:"#155855",textDecoration:"none"}}>전체 →</Link>
      </div>
      {rows.map(r=>(
        <Link key={r.key} href={r.href} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 14px",borderBottom:"1px solid rgba(21,88,85,.05)",textDecoration:"none",color:"inherit"}}
          onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background="#EAF4F2"}
          onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background="transparent"}
        >
          <div style={{width:22,height:22,borderRadius:6,background:r.iconBg,color:r.iconColor,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{r.iconEl}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,fontWeight:800,color:"#1C2B28",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name} <span style={{fontWeight:600,color:"#5A7470"}}>{r.sub}</span></div>
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <div style={{fontSize:10,fontWeight:800,color:r.statusColor}}>{r.statusLabel}</div>
            <div style={{fontSize:9,color:"#9BB5B0"}}>{r.time}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}

/* ─── daily idea banner (compact) ───────────────────────── */

function DailyIdeaBanner({idea}:{idea:DashboardData["todayIdea"]}) {
  if(!idea) return null;
  const isToday=idea.date===new Date().toISOString().slice(0,10);
  return(
    <Link href="/daily-ideas" style={{textDecoration:"none",display:"block"}}>
      <div style={{background:"linear-gradient(135deg,#155855,#0d3e3b)",borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,boxShadow:"0 3px 14px rgba(21,88,85,.16)"}}
        onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity=".88"}
        onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity="1"}
      >
        <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#E85D2C,#EB8F22)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>💡</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:2}}>
            <span style={{fontSize:9,fontWeight:900,color:"rgba(255,255,255,.45)",letterSpacing:".1em",textTransform:"uppercase"}}>아이디어 제안</span>
            {isToday&&<span style={{background:"#E85D2C",color:"#fff",fontSize:8,fontWeight:900,padding:"1px 5px",borderRadius:99}}>오늘</span>}
          </div>
          <div style={{fontSize:12,fontWeight:800,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{idea.marketing_idea.title}</div>
        </div>
        <ArrowRight size={13} color="rgba(255,255,255,.4)" style={{flexShrink:0}}/>
      </div>
    </Link>
  );
}

/* ─── tool grid (right 70%) ──────────────────────────────── */
/* TOOLS_WORK / TOOLS_CONTENT는 lib/toolNav.ts가 단일 소스 — 전역 사이드바(GlobalFeatureSidebar)와 공유 */

/* ─── workflow pipeline strip ────────────────────────────── */

const PIPELINE = [
  { n:1,  label:"상담·메모",  href:"/memo",             color:"#7C3AED" },
  { n:2,  label:"견적",       href:"/quote",            color:"#155855" },
  { n:3,  label:"계약",       href:"/mailing",          color:"#155855" },
  { n:4,  label:"콘티",       href:"/conti",            color:"#0891B2" },
  { n:5,  label:"촬영",       href:"/calendar",         color:"#D97706" },
  { n:6,  label:"보정",       href:"/photo-sorting",    color:"#E85D2C" },
  { n:7,  label:"원본전달",   href:"/clients",          color:"#0891B2" },
  { n:8,  label:"수정",       href:"/portal-admin",     color:"#9333EA" },
  { n:9,  label:"최종전달",   href:"/mailing",          color:"#E85D2C" },
  { n:10, label:"후기",       href:"/review-studio",    color:"#059669" },
  { n:11, label:"콘텐츠",     href:"/sns-manager",      color:"#059669" },
  { n:12, label:"영상콘티",   href:"/video-conti",      color:"#155855" },
];

function WorkflowStrip() {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize:11, fontWeight:700, color:"#5a8480", letterSpacing:".05em", textTransform:"uppercase" as const, marginBottom:10, display:"flex", alignItems:"center", gap:6 }}>
        <span style={{fontSize:13}}>⚙️</span> 업무 파이프라인
      </div>
      <div style={{
        background:"rgba(255,255,255,.65)",
        backdropFilter:"blur(16px) saturate(1.4)",
        WebkitBackdropFilter:"blur(16px) saturate(1.4)" as any,
        borderRadius:14,
        border:"1px solid rgba(255,255,255,.85)",
        padding:"11px 16px", overflowX:"auto",
        boxShadow:"0 4px 20px rgba(21,88,85,.07), 0 1px 0 rgba(255,255,255,.9) inset",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:2, minWidth:"max-content" }}>
          {PIPELINE.map((step, i) => (
            <React.Fragment key={step.n}>
              <Link href={step.href} style={{ textDecoration:"none", flexShrink:0 }}>
                <div style={{
                  display:"flex", alignItems:"center", gap:5,
                  padding:"5px 9px", borderRadius:7, cursor:"pointer",
                  transition:"background .12s, box-shadow .12s",
                }}
                onMouseEnter={e => { const el=e.currentTarget as HTMLElement; el.style.background=`${step.color}12`; el.style.boxShadow=`0 1px 6px ${step.color}25`; }}
                onMouseLeave={e => { const el=e.currentTarget as HTMLElement; el.style.background="transparent"; el.style.boxShadow="none"; }}
                >
                  <span style={{
                    fontSize:9, fontWeight:900, color:step.color,
                    background:`${step.color}15`, borderRadius:5,
                    padding:"2px 5px", flexShrink:0, letterSpacing:".02em",
                    lineHeight:1.4,
                  }}>{String(step.n).padStart(2,"0")}</span>
                  <span style={{ fontSize:11, fontWeight:700, color:"#1C2B28", whiteSpace:"nowrap" }}>{step.label}</span>
                </div>
              </Link>
              {i < PIPELINE.length - 1 && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{flexShrink:0, opacity:.35}}>
                  <path d="M3 2l4 3-4 3" stroke="#155855" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function ToolCard({tool}:{tool:ToolDef}) {
  const Icon=tool.icon;
  return(
    <Link href={tool.href} className={`admin-menu-card${tool.orange?" orange":""}`}>
      <div className="admin-menu-icon"><Icon size={26}/></div>
      <div className="admin-menu-copy">
        <span>{tool.meta}</span>
        <h2>{tool.title}</h2>
        <p>{tool.desc}</p>
      </div>
      <div className="admin-menu-action" aria-hidden="true"><ArrowRight size={21}/></div>
    </Link>
  );
}

function ToolGrid() {
  return(
    <>
      <WorkflowStrip/>
      <div style={{
        fontSize:13,fontWeight:700,color:"#3a5c58",
        letterSpacing:"-.1px",paddingBottom:14,
        display:"flex",alignItems:"center",gap:6,
      }}>
        <span style={{fontSize:16}}>📅</span> 업무 서포트
      </div>
      <div className="admin-menu-grid" style={{marginBottom:36}}>
        {TOOLS_WORK.map(t=><ToolCard key={t.href} tool={t}/>)}
      </div>
      <div style={{
        display:"flex",alignItems:"center",justifyContent:"space-between",
        paddingBottom:14,
      }}>
        <div style={{
          fontSize:13,fontWeight:700,color:"#3a5c58",
          letterSpacing:"-.1px",
          display:"flex",alignItems:"center",gap:6,
        }}>
          <span style={{fontSize:16}}>📢</span> 홍보 & 분석
        </div>
        <Link href="/marketing" style={{fontSize:11,fontWeight:700,color:"#e85d2c",textDecoration:"none"}}>마케팅 대시보드로 보기 →</Link>
      </div>
      <div className="admin-menu-grid">
        {TOOLS_CONTENT.map(t=><ToolCard key={t.href} tool={t}/>)}
      </div>
    </>
  );
}

/* ─── mobile: app icon ───────────────────────────────────── */

function MobileToolCard({tool, onTap}:{tool:ToolDef; onTap:()=>void}) {
  const Icon = tool.icon;
  const [pressed, setPressed] = React.useState(false);
  const bg = tool.orange
    ? "linear-gradient(150deg,#E85D2C 0%,#EB8F22 100%)"
    : "linear-gradient(150deg,#155855 0%,#1a8070 100%)";
  return (
    <button
      onClick={onTap}
      onTouchStart={()=>setPressed(true)}
      onTouchEnd={()=>setPressed(false)}
      onTouchCancel={()=>setPressed(false)}
      style={{
        display:"flex", alignItems:"center", gap:14,
        width:"100%", padding:"14px 18px",
        background: pressed ? "rgba(21,88,85,.08)" : "transparent",
        border:"none", cursor:"pointer", textAlign:"left" as const,
        WebkitTapHighlightColor:"transparent", transition:"background .08s ease",
      }}
    >
      {/* Icon: dimensional gradient with inner highlight */}
      <div style={{
        width:48, height:48, borderRadius:14, flexShrink:0,
        background:bg, color:"#fff",
        display:"flex", alignItems:"center", justifyContent:"center",
        boxShadow:"0 4px 16px rgba(0,0,0,.2), 0 1px 0 rgba(255,255,255,.28) inset",
      }}>
        <Icon size={22}/>
      </div>
      {/* Text */}
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:15, fontWeight:700, color:"#0d1f1e", letterSpacing:"-.15px", marginBottom:2}}>
          {tool.title}
        </div>
        <div style={{
          fontSize:12, color:"#6A8E8A", lineHeight:1.4,
          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
        }}>{tool.desc}</div>
      </div>
      {/* AI badge */}
      {tool.orange && (
        <div style={{
          fontSize:9, fontWeight:800, color:"#E85D2C",
          background:"rgba(232,93,44,.11)",
          border:"0.5px solid rgba(232,93,44,.25)",
          borderRadius:99, padding:"2px 8px", letterSpacing:".06em", flexShrink:0,
        }}>AI</div>
      )}
      {/* Chevron */}
      <svg width="7" height="12" viewBox="0 0 7 12" fill="none" style={{flexShrink:0, opacity:.35}}>
        <path d="M1 1l5 5-5 5" stroke="#155855" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
}

/* ─── mobile: fullscreen app popup ──────────────────────── */

function AppModal({tool, onClose}:{tool:ToolDef; onClose:()=>void}) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  useEffect(()=>{
    document.body.style.overflow="hidden";
    return ()=>{ document.body.style.overflow=""; };
  },[]);

  const handleIframeLoad = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (doc) {
        // 1. <html>에 pc-embed 클래스 추가 → SPA 네비게이션 후에도 유지됨
        doc.documentElement.classList.add("pc-embed");
        // 2. CSS 인라인 보험 (네비게이션 후 head가 교체될 경우 대비)
        if (!doc.getElementById("__pc_embed_style__")) {
          const style = doc.createElement("style");
          style.id = "__pc_embed_style__";
          style.textContent = ".pc-header{display:none!important}.admin-dashboard-header{display:none!important}";
          doc.head.appendChild(style);
        }
      }
      // 3. iframe이 루트(/)로 이동하면 모달 닫기
      const path = iframe.contentWindow?.location.pathname;
      if (path === "/") onClose();
    } catch (_) { /* cross-origin: 무시 */ }
  };

  return(
    <div style={{
      position:"fixed", inset:0, zIndex:2000,
      display:"flex", flexDirection:"column",
      background:"#fff",
      animation:"slideUp .28s cubic-bezier(.32,.72,0,1)",
    }}>
      {/* Header bar */}
      <div style={{
        height:54, flexShrink:0,
        display:"flex", alignItems:"center", gap:12,
        padding:"0 16px",
        background:"rgba(250,247,242,.97)",
        backdropFilter:"blur(16px)",
        borderBottom:"1px solid rgba(21,88,85,.08)",
        boxShadow:"0 1px 8px rgba(21,88,85,.06)",
      }}>
        <button onClick={onClose} style={{
          display:"flex", alignItems:"center", justifyContent:"center",
          width:36, height:36, borderRadius:10,
          border:"1px solid rgba(21,88,85,.14)",
          background:"#fff", cursor:"pointer", color:"#155855",
          fontSize:18, lineHeight:1, flexShrink:0,
          boxShadow:"0 1px 4px rgba(21,88,85,.06)",
        }}>←</button>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontSize:14, fontWeight:900, color:"#155855", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{tool.title}</div>
          <div style={{fontSize:10, color:"#9BB5B0", fontWeight:600}}>{tool.meta}</div>
        </div>
        <Link href={tool.href} style={{
          fontSize:11, fontWeight:800, color:"#E85D2C",
          textDecoration:"none", padding:"7px 12px",
          border:"1px solid rgba(232,93,44,.25)", borderRadius:10,
          background:"rgba(232,93,44,.06)", whiteSpace:"nowrap",
          boxShadow:"0 1px 4px rgba(232,93,44,.1)",
        }}>전체 화면 ↗</Link>
      </div>
      {/* App iframe */}
      <iframe
        ref={iframeRef}
        src={tool.href}
        onLoad={handleIframeLoad}
        style={{flex:1, border:"none", width:"100%"}}
        title={tool.title}
        allow="clipboard-write; clipboard-read"
      />
      <style>{`@keyframes slideUp{ from{transform:translateY(100%)} to{transform:translateY(0)} }`}</style>
    </div>
  );
}

/* ─── mobile: iOS 26 Liquid Glass card list ─────────────── */

function MobileToolGrid({onAppOpen}:{onAppOpen:(t:ToolDef)=>void}) {
  const total = TOOLS_WORK.length + TOOLS_CONTENT.length;
  const sections = [
    {emoji:"📅", label:"업무 서포트", tools:TOOLS_WORK},
    {emoji:"📢", label:"홍보 & 분석", tools:TOOLS_CONTENT},
  ] as const;
  return (
    <div style={{padding:"6px 14px", paddingBottom:110}}>
      {/* Hero header */}
      <div style={{padding:"18px 4px 20px"}}>
        <div style={{fontSize:26, fontWeight:800, color:"#0d1f1e", letterSpacing:"-.5px", lineHeight:1.15}}>
          도구 목록
        </div>
        <div style={{fontSize:13, color:"#6A8E8A", marginTop:4, fontWeight:500}}>
          {total}개의 AI 도구 · 탭해서 바로 실행
        </div>
      </div>

      {sections.map(({emoji, label, tools})=>(
        <div key={label} style={{marginBottom:30}}>
          {/* Section label */}
          <div style={{
            fontSize:13, fontWeight:700, color:"#3a5c58",
            letterSpacing:"-.1px", padding:"0 4px 10px",
            display:"flex", alignItems:"center", gap:6,
          }}>
            <span style={{fontSize:15}}>{emoji}</span> {label}
          </div>
          {/* Glass card group */}
          <div style={{
            background:"rgba(255,255,255,.68)",
            backdropFilter:"blur(22px) saturate(1.6)",
            WebkitBackdropFilter:"blur(22px) saturate(1.6)" as any,
            borderRadius:20,
            border:"1px solid rgba(255,255,255,.82)",
            boxShadow:"0 8px 32px rgba(21,88,85,.09), 0 1px 0 rgba(255,255,255,.9) inset",
            overflow:"hidden",
          }}>
            {(tools as readonly ToolDef[]).map((t,i)=>(
              <React.Fragment key={t.href}>
                {i>0 && (
                  <div style={{height:0.5, background:"rgba(21,88,85,.1)", margin:"0 18px"}}/>
                )}
                <MobileToolCard tool={t} onTap={()=>onAppOpen(t)}/>
              </React.Fragment>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── left dashboard panel ───────────────────────────────── */

function DashboardPanel({data,loading,onRefresh}:{data:DashboardData|null; loading:boolean; onRefresh:()=>void}) {
  const c=data?.clients; const m=data?.mailing;
  const totalTasks=(c&&m)?
    m.pending.length+c.quoteFollowUp.length+c.contractPending.length+c.galleryPending.length+c.reviewPending.length+c.snsPending.length
    :0;

  const chips = c&&m?[
    {icon:Mail,                label:"메일 대기",     count:m.pending.length,       href:"/mailing", accent:"#E85D2C", warn:m.failed.length>0},
    {icon:CircleDollarSign,    label:"견적 후속",     count:c.quoteFollowUp.length,  href:"/clients", accent:"#D97706"},
    {icon:FileText,            label:"계약 확인 중",  count:c.contractPending.length,href:"/clients", accent:"#7C3AED"},
    {icon:Image,               label:"갤러리 준비",   count:c.galleryPending.length, href:"/clients", accent:"#0891B2"},
    {icon:Star,                label:"리뷰 요청",     count:c.reviewPending.length,  href:"/clients", accent:"#059669"},
    {icon:Smartphone,          label:"SNS 콘텐츠",   count:c.snsPending.length,     href:"/clients", accent:"#DC2626"},
  ]:[];

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>

      {/* greeting + today alert */}
      <TodayAlertBanner tasks={data?.todayTasks ?? []} totalPending={totalTasks}/>

      {/* today tasks */}
      {data && <TodayTasks tasks={data.todayTasks ?? []} onRefresh={onRefresh}/>}

      {/* daily quote */}
      <DailyQuoteWidget/>

      {/* total task count */}
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",background:"#fff",borderRadius:10,border:"1px solid rgba(21,88,85,.1)",boxShadow:"0 1px 6px rgba(21,88,85,.05)"}}>
        <ShieldCheck size={14} color="#155855"/>
        <span style={{fontSize:12,fontWeight:900,color:"#064b48",flex:1}}>오늘 처리 대기</span>
        {loading
          ?<span style={{fontSize:12,color:"#9BB5B0"}}>로딩 중…</span>
          :<span style={{fontSize:18,fontWeight:900,color:totalTasks>0?"#E85D2C":"#9BB5B0"}}>{totalTasks}<span style={{fontSize:12,fontWeight:700,marginLeft:2}}>건</span></span>
        }
      </div>

      {/* task chips */}
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        <div style={{fontSize:10,fontWeight:900,color:"#9BB5B0",letterSpacing:".08em",textTransform:"uppercase",paddingLeft:2}}>업무 현황</div>
        {loading?(
          [...Array(6)].map((_,i)=>
            <div key={i} style={{height:44,background:"#fff",borderRadius:10,border:"1px solid rgba(21,88,85,.08)",animation:"pc-pulse 1.5s ease-in-out infinite"}}/>
          )
        ):(
          chips.map(ch=><TaskChip key={ch.label} {...ch}/>)
        )}
        <style>{`@keyframes pc-pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
      </div>

      {/* daily idea */}
      {data?.todayIdea&&<DailyIdeaBanner idea={data.todayIdea}/>}

      {/* recent activity */}
      {data&&<RecentActivity data={data}/>}

      <footer style={{display:"flex",alignItems:"center",gap:5,color:"#9BB5B0",fontSize:10,paddingTop:4}}>
        <ShieldCheck size={11}/>관리자 세션 활성화 중
      </footer>
    </div>
  );
}

/* ─── main dashboard ─────────────────────────────────────── */

function Dashboard({onLogout}:{onLogout:()=>void}) {
  const [data,setData]=useState<DashboardData|null>(null);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [isMobile,setIsMobile]=useState(false);
  const [activeApp,setActiveApp]=useState<ToolDef|null>(null);
  const [mobileTab,setMobileTab]=useState<"home"|"apps">("home");

  const load=async(quiet=false)=>{
    if(!quiet) setLoading(true); else setRefreshing(true);
    try{ const r=await fetch("/api/dashboard"); const j=await r.json(); if(j.ok) setData(j); }
    finally{ setLoading(false); setRefreshing(false); }
  };

  useEffect(()=>{load();},[]);

  useEffect(()=>{
    const check=()=>setIsMobile(window.innerWidth<768);
    check();
    window.addEventListener("resize",check);
    return ()=>window.removeEventListener("resize",check);
  },[]);

  /* ── MOBILE LAYOUT — iOS 26 Liquid Glass ── */
  if(isMobile) return(
    <main style={{
      minHeight:"100vh", overflowX:"hidden", maxWidth:"100vw",
      /* Mesh gradient background — iOS 26 signature */
      background:[
        "radial-gradient(ellipse 130% 55% at 15% 0%, rgba(21,88,85,.13) 0%, transparent 55%)",
        "radial-gradient(ellipse 90% 60% at 88% 95%, rgba(235,143,34,.1) 0%, transparent 50%)",
        "radial-gradient(ellipse 110% 70% at 55% 48%, rgba(86,155,140,.07) 0%, transparent 55%)",
        "#f0f4f2",
      ].join(","),
    }}>

      {/* ── Liquid Glass sticky header ── */}
      <header style={{
        position:"sticky",top:0,zIndex:200,height:54,
        background:"rgba(240,244,242,.78)",
        backdropFilter:"blur(24px) saturate(1.8)",
        WebkitBackdropFilter:"blur(24px) saturate(1.8)" as any,
        borderBottom:"1px solid rgba(255,255,255,.65)",
        display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"0 18px",
        boxShadow:"0 1px 0 rgba(21,88,85,.07), 0 4px 20px rgba(0,0,0,.04)",
      }}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <img src="/assets/photoclinic-logo.png" alt="포토클리닉" style={{height:24}}/>
          <div style={{width:1,height:14,background:"rgba(21,88,85,.18)"}}/>
          <span style={{fontSize:11,fontWeight:700,color:"rgba(21,88,85,.52)",letterSpacing:".06em"}}>AI 관리자</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          <Link href="/admin/security" title="보안 설정" style={{
            width:34,height:34,
            border:"1px solid rgba(255,255,255,.75)",borderRadius:10,
            background:"rgba(255,255,255,.55)",backdropFilter:"blur(8px)",
            cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
            color:"#155855",boxShadow:"0 2px 8px rgba(0,0,0,.07)",textDecoration:"none",
          }}>
            <Fingerprint size={14}/>
          </Link>
          <button onClick={()=>load(true)} disabled={refreshing} style={{
            width:34,height:34,
            border:"1px solid rgba(255,255,255,.75)",borderRadius:10,
            background:"rgba(255,255,255,.55)",backdropFilter:"blur(8px)",
            cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
            color:"#155855",boxShadow:"0 2px 8px rgba(0,0,0,.07)",
          }}>
            <RefreshCw size={13} style={{animation:refreshing?"spin 1s linear infinite":"none"}}/>
          </button>
          <button onClick={onLogout} style={{
            height:34,padding:"0 13px",
            border:"1px solid rgba(255,255,255,.75)",borderRadius:10,
            background:"rgba(255,255,255,.55)",backdropFilter:"blur(8px)",
            color:"#4A6E6A",fontSize:12,fontWeight:700,
            display:"flex",alignItems:"center",gap:4,cursor:"pointer",
            boxShadow:"0 2px 8px rgba(0,0,0,.07)",
          }}>
            <LogOut size={12}/>로그아웃
          </button>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </header>

      {/* ── Scrollable content ── */}
      <div style={{overflowY:"auto",WebkitOverflowScrolling:"touch",paddingBottom:100}}>
        {mobileTab==="home" && (
          <div style={{padding:"16px 14px"}}>
            <DashboardPanel data={data} loading={loading} onRefresh={()=>load(true)}/>
          </div>
        )}
        {mobileTab==="apps" && (
          <MobileToolGrid onAppOpen={t=>setActiveApp(t)}/>
        )}
      </div>

      {/* ── iOS 26 floating bottom tab pill ── */}
      <div style={{
        position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",
        display:"flex",alignItems:"center",
        background:"rgba(255,255,255,.82)",
        backdropFilter:"blur(28px) saturate(2)",
        WebkitBackdropFilter:"blur(28px) saturate(2)" as any,
        borderRadius:99,
        border:"1px solid rgba(255,255,255,.9)",
        boxShadow:"0 8px 36px rgba(0,0,0,.16), 0 1px 0 rgba(255,255,255,.85) inset",
        padding:"5px 6px",zIndex:300,
        gap:4,
      }}>
        {([
          ["home","🏠","대시보드"],
          ["apps","✦","도구"],
        ] as const).map(([id,icon,label])=>(
          <button key={id} onClick={()=>setMobileTab(id)} style={{
            display:"flex",alignItems:"center",gap:6,
            padding: mobileTab===id ? "10px 22px" : "10px 18px",
            borderRadius:99,
            background: mobileTab===id
              ? "linear-gradient(135deg,#155855 0%,#1a8070 100%)"
              : "transparent",
            border:"none",cursor:"pointer",
            color: mobileTab===id ? "#fff" : "#7A9490",
            fontSize:13,fontWeight: mobileTab===id ? 800 : 600,
            fontFamily:"inherit",
            transition:"all .22s cubic-bezier(.34,1.3,.64,1)",
            whiteSpace:"nowrap" as const,
            boxShadow: mobileTab===id ? "0 3px 12px rgba(21,88,85,.35)" : "none",
          }}>
            <span style={{fontSize: mobileTab===id ? 14 : 13}}>{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {/* App popup modal */}
      {activeApp && <AppModal tool={activeApp} onClose={()=>setActiveApp(null)}/>}
    </main>
  );

  /* ── DESKTOP LAYOUT — iOS 26 / macOS Sequoia ── */
  return(
    <main className="admin-shell" style={{padding:0,minHeight:"100vh"}}>

      {/* ── Liquid Glass sticky header ── */}
      <header style={{
        position:"sticky",top:0,zIndex:200,height:58,
        background:"rgba(240,244,242,.76)",
        backdropFilter:"blur(28px) saturate(1.8)",
        WebkitBackdropFilter:"blur(28px) saturate(1.8)" as any,
        borderBottom:"1px solid rgba(255,255,255,.62)",
        display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"0 28px",
        boxShadow:"0 1px 0 rgba(21,88,85,.06), 0 4px 24px rgba(0,0,0,.04)",
      }}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <img src="/assets/photoclinic-logo.png" alt="포토클리닉" style={{height:26}}/>
          <div style={{width:1,height:18,background:"rgba(21,88,85,.18)"}}/>
          <span style={{fontSize:11,fontWeight:700,color:"rgba(21,88,85,.52)",letterSpacing:".08em",textTransform:"uppercase" as const}}>포토클리닉 AI 관리자</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <Link href="/admin/security" title="보안 설정"
            style={{
              width:34,height:34,
              border:"1px solid rgba(255,255,255,.75)",borderRadius:10,
              background:"rgba(255,255,255,.55)",backdropFilter:"blur(8px)",
              cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
              color:"#155855",boxShadow:"0 2px 8px rgba(0,0,0,.07)",textDecoration:"none",
            }}>
            <Fingerprint size={14}/>
          </Link>
          <button onClick={()=>load(true)} disabled={refreshing} title="새로고침"
            style={{
              width:34,height:34,
              border:"1px solid rgba(255,255,255,.75)",borderRadius:10,
              background:"rgba(255,255,255,.55)",backdropFilter:"blur(8px)",
              cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
              color:"#155855",boxShadow:"0 2px 8px rgba(0,0,0,.07)",
            }}>
            <RefreshCw size={13} style={{animation:refreshing?"spin 1s linear infinite":"none"}}/>
          </button>
          <button onClick={onLogout} style={{
            height:34,padding:"0 14px",
            border:"1px solid rgba(255,255,255,.75)",borderRadius:10,
            background:"rgba(255,255,255,.55)",backdropFilter:"blur(8px)",
            color:"#4a6e6a",fontSize:12,fontWeight:700,
            display:"flex",alignItems:"center",gap:5,cursor:"pointer",
            boxShadow:"0 2px 8px rgba(0,0,0,.07)",
          }}>
            <LogOut size={13}/>로그아웃
          </button>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </header>

      {/* ── Two-column layout ── */}
      <div style={{
        display:"grid",gridTemplateColumns:"320px 1fr",
        minHeight:"calc(100vh - 58px)",maxWidth:1500,margin:"0 auto",
      }}>
        {/* ── Liquid Glass sidebar ── */}
        <aside style={{
          position:"sticky",top:58,height:"calc(100vh - 58px)",
          overflowY:"auto",
          borderRight:"1px solid rgba(255,255,255,.52)",
          padding:"24px 20px 48px",
          background:"rgba(255,255,255,.42)",
          backdropFilter:"blur(20px) saturate(1.5)",
          WebkitBackdropFilter:"blur(20px) saturate(1.5)" as any,
        }}>
          <DashboardPanel data={data} loading={loading} onRefresh={()=>load(true)}/>
        </aside>

        {/* ── Main content ── */}
        <section style={{padding:"36px 36px 80px 32px",minWidth:0}}>
          {/* Apple Large Title hero */}
          <div style={{marginBottom:32}}>
            <p className="admin-kicker" style={{marginBottom:8,letterSpacing:".06em"}}>병원 · 메디컬 성장 플랫폼</p>
            <h1 style={{
              margin:0, color:"#0d1f1e",
              fontSize:"clamp(28px,2.6vw,40px)",
              fontWeight:900, lineHeight:1.08, letterSpacing:"-.5px",
            }}>포토클리닉 AI 비서</h1>
            <p style={{margin:"12px 0 0",color:"#6a8e8a",fontSize:14,lineHeight:1.75}}>
              상담부터 진단·분석·디자인·분류·홈페이지·보정까지 한 화면에서 시작하세요.
            </p>
          </div>
          <ToolGrid/>
        </section>
      </div>
    </main>
  );
}

/* ─── root ───────────────────────────────────────────────── */

export default function AdminHome() {
  const router=useRouter();
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    fetch("/api/auth/check").then(r=>r.json()).then(d=>{
      if(d.authenticated) router.replace("/admin/dashboard/home");
      else setReady(true);
    }).catch(()=>setReady(true));
  },[router]);
  if(!ready) return <main className="admin-shell"><div className="admin-loading"/></main>;
  return <LoginScreen onAuth={()=>router.replace("/admin/dashboard/home")}/>;
}
