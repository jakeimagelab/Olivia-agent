"use client";

import Link from "next/link";
import React, { FormEvent, useEffect, useRef, useState } from "react";
import {
  Activity, BarChart2, ArrowRight, CalendarCheck, ClipboardList,
  FileVideo, Globe2, ImageDown, Images, LockKeyhole, LogOut, Mail,
  NotebookPen, ShieldCheck, Sparkles, Users, Wand2, Lightbulb,
  AlertCircle, CheckCircle2, Clock, RefreshCw, Calendar, Check,
  FileText, Image, Star, Smartphone, CircleDollarSign, Pipette, Link2, Bell,
} from "lucide-react";

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
  const [pw,setPw]=useState(""); const [err,setErr]=useState(""); const [busy,setBusy]=useState(false);
  const submit=async(e:FormEvent)=>{
    e.preventDefault(); setErr(""); setBusy(true);
    try{
      const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:pw})});
      const d=await r.json();
      if(d.ok){setPw(""); onAuth();} else setErr(d.error||"비밀번호를 다시 확인해주세요.");
    }finally{setBusy(false);}
  };
  return(
    <main className="admin-shell">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="brand-lockup">
          <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉"/>
          <span>Admin Console</span>
        </div>
        <div>
          <p className="admin-kicker">병원 · 메디컬 성장 플랫폼</p>
          <h1 id="login-title">포토클리닉 AI 비서 관리자</h1>
          <p className="login-copy">관리자 비밀번호를 입력하면 견적서, 병원이미지 진단, 채널 분석, 홍보 디자인, 사진 분류, 홈페이지 제작, 사진 보정으로 바로 이동할 수 있습니다.</p>
        </div>
        <form className="login-form" onSubmit={submit}>
          <label className="field"><span>비밀번호</span>
            <input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="관리자 비밀번호" autoComplete="off"/>
          </label>
          {err&&<p className="login-error">{err}</p>}
          <button className="admin-primary-button" type="submit" disabled={busy}>
            <LockKeyhole size={18}/>{busy?"확인 중...":"로그인"}
          </button>
        </form>
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
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "좋은 아침이에요" : hour < 18 ? "수고하고 계세요" : "오늘도 고생많으셨어요";
  const today = now.toLocaleDateString("ko-KR",{month:"long",day:"numeric",weekday:"short"});

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

/* ─── quick memo widget ──────────────────────────────────── */

type MemoItem = { id: string; raw_memo: string; created_at: string };

function QuickMemoWidget({ memos: initMemos, onRefresh }: { memos: MemoItem[]; onRefresh: () => void }) {
  const [memos, setMemos] = useState<MemoItem[]>(initMemos);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAnim, setSavedAnim] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setMemos(initMemos); }, [initMemos]);
  useEffect(() => { if (open) textareaRef.current?.focus(); }, [open]);

  const submit = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      const r = await fetch("/api/memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_memo: text }),
      });
      if (r.ok) {
        const now = new Date().toISOString();
        setMemos(prev => [{ id: now, raw_memo: text, created_at: now }, ...prev].slice(0, 5));
        setText(""); setOpen(false); setSavedAnim(true);
        setTimeout(() => setSavedAnim(false), 1800);
        onRefresh();
      }
    } finally { setSaving(false); }
  };

  return (
    <div style={{
      background: "#fff", borderRadius: 12,
      border: `1px solid ${savedAnim ? "rgba(124,58,237,.35)" : "rgba(21,88,85,.1)"}`,
      overflow: "hidden", boxShadow: "0 1px 8px rgba(21,88,85,.05)", transition: "border-color .4s",
    }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(21,88,85,.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <NotebookPen size={13} color="#7C3AED"/>
          <span style={{ fontSize: 10, fontWeight: 900, color: "#7C3AED", letterSpacing: ".08em", textTransform: "uppercase" }}>메모</span>
          {memos.length > 0 && <span style={{ fontSize: 10, color: "#9BB5B0", fontWeight: 700 }}>{memos.length}</span>}
          {savedAnim && <span style={{ fontSize: 10, fontWeight: 800, color: "#7C3AED" }}>저장됨 ✓</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link href="/memo" style={{ fontSize: 10, fontWeight: 800, color: "#9BB5B0", textDecoration: "none" }}>전체 →</Link>
          <button onClick={() => { setOpen(o => !o); setText(""); }} style={{
            display: "flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 800,
            color: open ? "#E85D2C" : "#fff", background: open ? "transparent" : "#7C3AED",
            border: open ? "1px solid rgba(232,93,44,.3)" : "none",
            borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit", transition: "all .15s",
          }}>{open ? "✕" : "+ 메모"}</button>
        </div>
      </div>

      {open && (
        <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(21,88,85,.07)", background: "#FAFAF8" }}>
          <textarea
            ref={textareaRef} value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
            placeholder="상담 내용이나 메모를 입력하세요… (⌘Enter 저장)"
            rows={3}
            style={{
              width: "100%", border: "1.5px solid rgba(124,58,237,.25)", borderRadius: 8,
              padding: "8px 10px", fontSize: 12, lineHeight: 1.65, resize: "vertical",
              fontFamily: "inherit", color: "#1C2B28", background: "#fff",
              outline: "none", boxSizing: "border-box", transition: "border-color .15s",
            }}
            onFocus={e => (e.target.style.borderColor = "rgba(124,58,237,.6)")}
            onBlur={e => (e.target.style.borderColor = "rgba(124,58,237,.25)")}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
            <span style={{ fontSize: 9, color: "#9BB5B0" }}>AI가 상담 정보를 자동 분석합니다</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => { setOpen(false); setText(""); }} style={{
                fontSize: 11, fontWeight: 700, color: "#9BB5B0", background: "none",
                border: "1px solid rgba(21,88,85,.15)", borderRadius: 7, padding: "4px 10px",
                cursor: "pointer", fontFamily: "inherit",
              }}>취소</button>
              <button onClick={submit} disabled={!text.trim() || saving} style={{
                fontSize: 11, fontWeight: 800, color: "#fff",
                background: (!text.trim() || saving) ? "#C4B5FD" : "#7C3AED",
                border: "none", borderRadius: 7, padding: "4px 14px",
                cursor: (!text.trim() || saving) ? "not-allowed" : "pointer",
                fontFamily: "inherit", transition: "background .15s",
              }}>{saving ? "분석 중…" : "저장"}</button>
            </div>
          </div>
        </div>
      )}

      {memos.length === 0 ? (
        <div style={{ padding: "14px", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#9BB5B0", marginBottom: 4 }}>저장된 메모가 없어요</div>
          <button onClick={() => setOpen(true)} style={{
            fontSize: 11, fontWeight: 800, color: "#7C3AED", background: "none",
            border: "none", cursor: "pointer", fontFamily: "inherit",
          }}>+ 첫 메모 추가하기</button>
        </div>
      ) : (
        <div style={{ padding: "4px 8px 6px", display: "flex", flexDirection: "column" }}>
          {memos.slice(0, 4).map(memo => (
            <Link key={memo.id} href="/memo" style={{ textDecoration: "none" }}>
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 8px",
                borderRadius: 7, transition: "background .1s", cursor: "pointer",
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#F5F0FF"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
              >
                <div style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0, marginTop: 1, background: "#F5F0FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <NotebookPen size={9} color="#7C3AED"/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#1C2B28", lineHeight: 1.45, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {memo.raw_memo}
                  </div>
                  <div style={{ fontSize: 9, color: "#9BB5B0", marginTop: 1 }}>{relTime(memo.created_at)}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
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

type ToolDef = {title:string; desc:string; href:string; icon:React.ComponentType<{size?:number}>; meta:string; orange:boolean};

const TOOLS_WORK: ToolDef[] = [
  {title:"상담 메모",      desc:"상담 내용을 빠르게 기록하고 병원 DB로 등록합니다. 고객 관리와 자동 연결됩니다.",           href:"/memo",            icon:NotebookPen,   meta:"Consult Memo",       orange:true },
  {title:"업무 캘린더",    desc:"날짜별 촬영·미팅·행정 할일을 한 화면에서 관리합니다.",                                   href:"/calendar",        icon:Calendar,      meta:"Task Calendar",      orange:false},
  {title:"견적서 생성",    desc:"촬영 패키지와 옵션을 선택해 견적서 PDF를 생성합니다.",                                   href:"/quote",           icon:ClipboardList, meta:"Quote Builder",      orange:false},
  {title:"촬영 콘티 생성", desc:"병원 정보 입력 시 AI가 콘티·체크리스트·타임테이블을 생성합니다.",                        href:"/conti",           icon:FileVideo,     meta:"Conti Generator",    orange:false},
  {title:"고객 관리",      desc:"병원별 상담→견적→계약→촬영→전달 단계를 관리하고 업무 현황을 추적합니다.",               href:"/clients",         icon:Users,         meta:"Client Management",  orange:true },
  {title:"고객 포털 관리", desc:"병원 고객에게 전달할 고객 전용 포털 링크를 생성하고 수정 요청·리뷰를 관리합니다.",        href:"/portal-admin",    icon:Link2,         meta:"Client Portal",      orange:false},
  {title:"통합 메일링",    desc:"견적서·계약서·갤러리 등 메일 초안을 한 곳에서 확인·발송합니다.",                         href:"/mailing",         icon:Mail,          meta:"Unified Mailing",    orange:false},
  {title:"사진 보정",      desc:"사진 분류·색감 체크·피부톤 DNA 비교·Photoshop 보정 가이드를 한 화면에서 관리합니다.",     href:"/photo-retouching", icon:Wand2,        meta:"Photo Studio",       orange:false},
  {title:"업무 리포트",    desc:"AI 활동 기록, 병원별 통계, 일별 차트를 한눈에 확인합니다.",                             href:"/report",          icon:BarChart2,     meta:"Weekly Report",      orange:false},
];

const TOOLS_CONTENT: ToolDef[] = [
  {title:"아이디어 제안",       desc:"오늘 제작할 클라이언트 홍보 콘텐츠 아이디어를 AI가 매일 제안합니다.",   href:"/daily-ideas",     icon:Lightbulb,     meta:"Idea Proposal",      orange:true },
  {title:"홍보 콘텐츠 제작",    desc:"블로그·인스타·네이버 플레이스 홍보 콘텐츠를 클라이언트별로 제작합니다.",href:"/sns-manager",     icon:CalendarCheck, meta:"Content Production", orange:false},
  {title:"클라이언트 후기 콘텐츠",desc:"클라이언트 반응을 수집해 포토클리닉 홍보 인스타 콘텐츠로 만듭니다.", href:"/review-studio",   icon:Sparkles,      meta:"Review Studio",      orange:false},
  {title:"병원이미지 진단",      desc:"병원 현황에 맞는 사진 콘텐츠 방향을 AI가 진단합니다.",              href:"/diagnosis",       icon:ImageDown,     meta:"Clinic Diagnosis",   orange:false},
  {title:"병원 채널 분석",       desc:"인스타그램·홈페이지·네이버 플레이스·블로그를 함께 분석합니다.",      href:"/channel-analyzer",icon:Activity,      meta:"Channel Analysis",   orange:false},
  {title:"리얼 이미지 디렉터",   desc:"올리비아가 촬영 디렉팅하고 OpenAI gpt-image-1로 실사 병원 이미지를 생성합니다.", href:"/image-generator", icon:Sparkles, meta:"Real Image Director", orange:true },
  {title:"홈페이지 제작",        desc:"병원 홈페이지 제작 요청과 기획 정보를 정리합니다.",                  href:"/website-builder", icon:Globe2,        meta:"Website Builder",    orange:false},
];

/* ─── workflow pipeline strip ────────────────────────────── */

const PIPELINE = [
  { n:1,  label:"상담·메모",  href:"/memo",             color:"#7C3AED" },
  { n:2,  label:"견적",       href:"/quote",            color:"#155855" },
  { n:3,  label:"계약",       href:"/mailing",          color:"#155855" },
  { n:4,  label:"콘티",       href:"/conti",            color:"#0891B2" },
  { n:5,  label:"촬영",       href:"/calendar",         color:"#D97706" },
  { n:6,  label:"보정",       href:"/photo-retouching", color:"#E85D2C" },
  { n:7,  label:"원본전달",   href:"/clients",          color:"#0891B2" },
  { n:8,  label:"수정",       href:"/portal-admin",     color:"#9333EA" },
  { n:9,  label:"최종전달",   href:"/mailing",          color:"#E85D2C" },
  { n:10, label:"후기",       href:"/review-studio",    color:"#059669" },
  { n:11, label:"콘텐츠",     href:"/sns-manager",      color:"#059669" },
];

function WorkflowStrip() {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize:10, fontWeight:900, color:"#9BB5B0", letterSpacing:".08em", textTransform:"uppercase", marginBottom:8 }}>
        업무 파이프라인
      </div>
      <div style={{
        background:"#fff", borderRadius:12, border:"1px solid rgba(21,88,85,.1)",
        padding:"10px 14px", overflowX:"auto",
        boxShadow:"0 1px 6px rgba(21,88,85,.04)",
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
      <div style={{fontSize:10,fontWeight:900,color:"#9BB5B0",letterSpacing:".1em",textTransform:"uppercase",paddingBottom:12}}>📅 업무 서포트</div>
      <div className="admin-menu-grid" style={{marginBottom:32}}>
        {TOOLS_WORK.map(t=><ToolCard key={t.href} tool={t}/>)}
      </div>
      <div style={{fontSize:10,fontWeight:900,color:"#9BB5B0",letterSpacing:".1em",textTransform:"uppercase",paddingBottom:12}}>📢 홍보 콘텐츠</div>
      <div className="admin-menu-grid">
        {TOOLS_CONTENT.map(t=><ToolCard key={t.href} tool={t}/>)}
      </div>
    </>
  );
}

/* ─── mobile: app icon ───────────────────────────────────── */

function AppIcon({tool, onTap}:{tool:ToolDef; onTap:()=>void}) {
  const Icon = tool.icon;
  const bg = tool.orange
    ? "linear-gradient(145deg,#E85D2C,#EB8F22)"
    : "linear-gradient(145deg,#155855,#1e7870)";
  return(
    <button onClick={onTap} style={{
      display:"flex", flexDirection:"column", alignItems:"center", gap:6,
      background:"none", border:"none", cursor:"pointer", padding:"6px 2px",
      WebkitTapHighlightColor:"transparent",
    }}>
      <div style={{
        width:58, height:58, borderRadius:16,
        background:bg,
        display:"flex", alignItems:"center", justifyContent:"center",
        boxShadow:"0 4px 14px rgba(0,0,0,.18)",
        flexShrink:0,
        color:"#fff",
      }}>
        <Icon size={24}/>
      </div>
      <span style={{
        fontSize:10, fontWeight:700, color:"#1C2B28",
        textAlign:"center", lineHeight:1.3,
        maxWidth:64, wordBreak:"keep-all",
      }}>{tool.title}</span>
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
      // 1. iframe 내부 pc-header 숨기기 (동일 오리진)
      const doc = iframe.contentDocument;
      if (doc) {
        const style = doc.createElement("style");
        style.textContent = `
          .pc-header { display:none !important; }
          .admin-dashboard-header { display:none !important; }
        `;
        doc.head.appendChild(style);
      }
      // 2. iframe이 루트(/)로 이동하면 모달 닫기
      const path = iframe.contentWindow?.location.pathname;
      if (path === "/") {
        onClose();
      }
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
        height:52, flexShrink:0,
        display:"flex", alignItems:"center", gap:10,
        padding:"0 16px",
        background:"rgba(250,247,242,.96)",
        backdropFilter:"blur(10px)",
        borderBottom:"1px solid rgba(21,88,85,.12)",
      }}>
        <button onClick={onClose} style={{
          display:"flex", alignItems:"center", justifyContent:"center",
          width:36, height:36, borderRadius:10,
          border:"1px solid rgba(21,88,85,.18)",
          background:"#fff", cursor:"pointer", color:"#155855",
          fontSize:18, lineHeight:1,
        }}>←</button>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontSize:13, fontWeight:900, color:"#155855", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{tool.title}</div>
          <div style={{fontSize:10, color:"#9BB5B0"}}>{tool.meta}</div>
        </div>
        <Link href={tool.href} style={{
          fontSize:11, fontWeight:800, color:"#E85D2C",
          textDecoration:"none", padding:"6px 10px",
          border:"1px solid rgba(232,93,44,.3)", borderRadius:8,
          background:"rgba(232,93,44,.05)", whiteSpace:"nowrap",
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

/* ─── mobile: icon grid ──────────────────────────────────── */

function MobileToolGrid({onAppOpen}:{onAppOpen:(t:ToolDef)=>void}) {
  return(
    <div style={{padding:"0 4px", paddingBottom:120}}>
      <div style={{fontSize:10, fontWeight:900, color:"#9BB5B0", letterSpacing:".1em", textTransform:"uppercase", padding:"4px 8px 10px"}}>📅 업무 서포트</div>
      <div style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:4, marginBottom:20}}>
        {TOOLS_WORK.map(t=><AppIcon key={t.href} tool={t} onTap={()=>onAppOpen(t)}/>)}
      </div>
      <div style={{fontSize:10, fontWeight:900, color:"#9BB5B0", letterSpacing:".1em", textTransform:"uppercase", padding:"4px 8px 10px"}}>📢 홍보 콘텐츠</div>
      <div style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:4}}>
        {TOOLS_CONTENT.map(t=><AppIcon key={t.href} tool={t} onTap={()=>onAppOpen(t)}/>)}
      </div>
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

      {/* quick memo — consult input */}
      {data && <QuickMemoWidget memos={data.recentMemos ?? []} onRefresh={onRefresh}/>}

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

  /* ── MOBILE LAYOUT ── */
  if(isMobile) return(
    <main style={{minHeight:"100vh",background:"#f5f5f7",overflowX:"hidden",maxWidth:"100vw"}}>

      {/* Mobile sticky header */}
      <header style={{
        position:"sticky",top:0,zIndex:200,height:50,
        background:"rgba(250,247,242,.96)",backdropFilter:"blur(12px)",
        borderBottom:"1px solid rgba(21,88,85,.1)",
        display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"0 16px",
      }}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉" style={{height:22}}/>
          <span style={{fontSize:11,fontWeight:900,color:"rgba(21,88,85,.6)",letterSpacing:".08em"}}>AI 관리자</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <button onClick={()=>load(true)} disabled={refreshing}
            style={{width:30,height:30,border:"1px solid rgba(21,88,85,.18)",borderRadius:8,background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#155855"}}>
            <RefreshCw size={12} style={{animation:refreshing?"spin 1s linear infinite":"none"}}/>
          </button>
          <button onClick={onLogout} style={{height:30,padding:"0 10px",border:"1px solid rgba(21,88,85,.18)",borderRadius:8,background:"#fff",color:"#5A7470",fontSize:11,fontWeight:700,display:"flex",alignItems:"center",gap:4}}>
            <LogOut size={11}/>로그아웃
          </button>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </header>

      {/* Mobile tab switcher */}
      <div style={{
        display:"flex",background:"#fff",borderBottom:"1px solid rgba(21,88,85,.1)",
        position:"sticky",top:50,zIndex:100,
      }}>
        {([["home","🏠 대시보드"],["apps","📱 앱"]] as const).map(([id,label])=>(
          <button key={id} onClick={()=>setMobileTab(id)} style={{
            flex:1,height:40,border:"none",
            background:"none",
            borderBottom:`2.5px solid ${mobileTab===id?"#155855":"transparent"}`,
            color:mobileTab===id?"#155855":"#9BB5B0",
            fontSize:12,fontWeight:mobileTab===id?900:600,
            cursor:"pointer",fontFamily:"inherit",
          }}>{label}</button>
        ))}
      </div>

      {/* Mobile content area */}
      <div style={{overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
        {mobileTab==="home" && (
          <div style={{padding:"14px 14px 100px"}}>
            <DashboardPanel data={data} loading={loading} onRefresh={()=>load(true)}/>
          </div>
        )}
        {mobileTab==="apps" && (
          <div style={{padding:"14px 8px"}}>
            <MobileToolGrid onAppOpen={t=>setActiveApp(t)}/>
          </div>
        )}
      </div>

      {/* App popup modal */}
      {activeApp && <AppModal tool={activeApp} onClose={()=>setActiveApp(null)}/>}
    </main>
  );

  /* ── DESKTOP LAYOUT ── */
  return(
    <main className="admin-shell" style={{padding:0,minHeight:"100vh"}}>

      {/* sticky header */}
      <header style={{
        position:"sticky",top:0,zIndex:200,height:56,
        background:"rgba(250,247,242,.94)",backdropFilter:"blur(12px)",
        borderBottom:"1px solid rgba(21,88,85,.12)",
        display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"0 28px",
      }}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉" style={{height:26}}/>
          <div style={{width:1,height:18,background:"rgba(21,88,85,.2)"}}/>
          <span style={{fontSize:11,fontWeight:900,color:"rgba(21,88,85,.65)",letterSpacing:".1em",textTransform:"uppercase"}}>포토클리닉 AI 관리자</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>load(true)} disabled={refreshing}
            style={{width:32,height:32,border:"1px solid rgba(21,88,85,.2)",borderRadius:8,background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#155855"}}
            title="새로고침">
            <RefreshCw size={13} style={{animation:refreshing?"spin 1s linear infinite":"none"}}/>
          </button>
          <button onClick={onLogout} className="admin-logout-button" style={{height:32,fontSize:12,padding:"0 12px"}}>
            <LogOut size={13}/>로그아웃
          </button>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </header>

      {/* 30 / 70 layout */}
      <div style={{
        display:"grid",gridTemplateColumns:"320px 1fr",
        minHeight:"calc(100vh - 56px)",maxWidth:1500,margin:"0 auto",
      }}>
        <aside style={{
          position:"sticky",top:56,height:"calc(100vh - 56px)",
          overflowY:"auto",borderRight:"1px solid rgba(21,88,85,.1)",
          padding:"24px 20px 48px",background:"rgba(255,255,255,.55)",
        }}>
          <DashboardPanel data={data} loading={loading} onRefresh={()=>load(true)}/>
        </aside>
        <section style={{padding:"32px 32px 60px 28px",minWidth:0}}>
          <div style={{marginBottom:24}}>
            <p className="admin-kicker" style={{marginBottom:6}}>병원 · 메디컬 성장 플랫폼</p>
            <h1 style={{margin:0,color:"var(--deep-green)",fontSize:"clamp(28px,3vw,44px)",fontWeight:900,lineHeight:1.1}}>포토클리닉 AI 비서</h1>
            <p style={{margin:"10px 0 0",color:"#4d5b56",fontSize:14,lineHeight:1.7}}>상담부터 진단·분석·디자인·분류·홈페이지·보정까지 한 화면에서 시작하세요.</p>
          </div>
          <ToolGrid/>
        </section>
      </div>
    </main>
  );
}

/* ─── root ───────────────────────────────────────────────── */

export default function AdminHome() {
  const [auth,setAuth]=useState(false);
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    fetch("/api/auth/check").then(r=>r.json()).then(d=>setAuth(Boolean(d.authenticated))).catch(()=>setAuth(false)).finally(()=>setReady(true));
  },[]);
  const logout=async()=>{await fetch("/api/logout",{method:"POST"}); setAuth(false);};
  if(!ready) return <main className="admin-shell"><div className="admin-loading"/></main>;
  if(!auth)  return <LoginScreen onAuth={()=>setAuth(true)}/>;
  return <Dashboard onLogout={logout}/>;
}
