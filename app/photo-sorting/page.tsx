"use client";

import { useEffect } from "react";
import PageHeader from "@/components/PageHeader";

export default function PhotoSortingPage() {
  useEffect(() => {
    // showDirectoryPicker 지원 여부 체크
    if (!("showDirectoryPicker" in window)) {
      const btn = document.getElementById("pickBtn") as HTMLButtonElement | null;
      const warn = document.getElementById("notSupported");
      if (btn) btn.disabled = true;
      if (warn) warn.classList.remove("hidden");
    }
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#EDF5F3" }}>
      <PageHeader title="Photo Sorting" />

      <main style={{ maxWidth: 620, margin: "0 auto", padding: "24px 16px 60px" }}>

        {/* IDLE */}
        <div id="vIdle">
          <div className="pc-card" style={{ marginBottom: 12 }}>
            <div className="pc-card-header">
              <div className="pc-card-title">📁 촬영 파일 자동 분류</div>
            </div>
            <div style={{ padding: "16px 20px" }}>
              <p style={{ fontSize: 11, color: "#5A7470", marginBottom: 16, lineHeight: 1.6 }}>
                RAW · JPG(Scene별) · VIDEO(Scene별) 자동 정리 · 파일이 외부로 전송되지 않습니다
              </p>

              <div style={{ fontSize: 11, fontWeight: 700, color: "#5A7470", marginBottom: 8 }}>촬영 유형</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 14 }}>
                <button id="btnS" onClick={() => (window as any).setType("studio")} style={typeBtnStyle(true)}>
                  <div style={{ fontSize: 18, marginBottom: 5 }}>🏢</div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>스튜디오</div>
                  <div style={{ fontSize: 10, color: "#5A7470", marginTop: 3, lineHeight: 1.5 }}>의상·포즈 변경 사이<br />준비 시간 기준으로 분류</div>
                </button>
                <button id="btnL" onClick={() => (window as any).setType("location")} style={typeBtnStyle(false)}>
                  <div style={{ fontSize: 18, marginBottom: 5 }}>🏥</div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>병원 로케이션</div>
                  <div style={{ fontSize: 10, color: "#5A7470", marginTop: 3, lineHeight: 1.5 }}>공간 이동 사이<br />시간 간격 기준으로 분류</div>
                </button>
              </div>

              <div id="ruleS" style={ruleBoxStyle("s")}>
                <strong style={{ fontWeight: 700, color: "#155855" }}>Scene 구분 기준</strong><br />
                촬영 중단 후 <span id="ruleGapS" style={{ color: "#155855", fontWeight: 700 }}>3분</span> 이상 지나면 새 Scene<br />
                <span style={{ color: "#9BB5B0", fontSize: 11 }}>사진·영상 모두 같은 기준으로 분류합니다</span>
              </div>
              <div id="ruleL" className="hidden" style={ruleBoxStyle("l")}>
                <strong style={{ fontWeight: 700, color: "#E85D2C" }}>Scene 구분 기준</strong><br />
                촬영 중단 후 <span id="ruleGapL" style={{ color: "#E85D2C", fontWeight: 700 }}>5분</span> 이상 지나면 새 Scene<br />
                <span style={{ color: "#9BB5B0", fontSize: 11 }}>사진·영상 모두 같은 기준으로 분류합니다</span>
              </div>

              <div style={slBoxStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#5A7470" }}>Scene 구분 시간 간격</span>
                  <span id="gapVal" style={{ fontSize: 14, fontWeight: 700, color: "#155855" }}>3분</span>
                </div>
                <input type="range" id="gapSlider" min="1" max="30" defaultValue="3"
                  onChange={(e) => (window as any).onGap(e.target.value)}
                  style={{ width: "100%", accentColor: "#155855", height: 4 }} />
                <div id="gapHint" style={{ fontSize: 10, color: "#9BB5B0", marginTop: 5, lineHeight: 1.5 }}>
                  촬영 사이 3분 이상 쉬면 새 Scene으로 분류합니다
                </div>
              </div>

              <div style={slBoxStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#5A7470" }}>🎬 영상 컬러 분석</span>
                  <span id="colorTh" style={{ fontSize: 11, color: "#155855", fontWeight: 700 }}>중간</span>
                </div>
                <input type="range" id="colorSlider" min="1" max="5" defaultValue="3"
                  onChange={(e) => (window as any).onColorTh(e.target.value)}
                  style={{ width: "100%", accentColor: "#155855", height: 4 }} />
                <div id="colorHint" style={{ fontSize: 10, color: "#9BB5B0", marginTop: 5, lineHeight: 1.5 }}>
                  첫 프레임 배경 컬러가 크게 달라지면 시간 간격 무관하게 새 Scene으로 추가 분류
                </div>
              </div>

              <details style={{ marginBottom: 14 }}>
                <summary style={{ fontSize: 11, fontWeight: 700, color: "#5A7470", cursor: "pointer", padding: "4px 0", listStyle: "none" }}>
                  ▸ 파일 옵션
                </summary>
                <div style={{ paddingTop: 6 }}>
                  <div style={tglRowStyle}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>📷 RAW 파일 정리</div>
                      <div style={{ fontSize: 10, color: "#9BB5B0", marginTop: 2 }}>CR2·ARW·NEF·DNG → RAW/ 폴더</div>
                    </div>
                    <label style={tglStyle}>
                      <input type="checkbox" id="doRaw" defaultChecked style={{ opacity: 0, width: 0, height: 0 }} />
                      <span></span>
                    </label>
                  </div>
                  <div style={tglRowStyle}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>🎬 영상 Scene 분류</div>
                      <div style={{ fontSize: 10, color: "#9BB5B0", marginTop: 2 }}>VIDEO/Scene01/ 형태로 분류</div>
                    </div>
                    <label style={tglStyle}>
                      <input type="checkbox" id="doVidScene" defaultChecked style={{ opacity: 0, width: 0, height: 0 }} />
                      <span></span>
                    </label>
                  </div>
                </div>
              </details>

              <div id="notSupported" className="hidden" style={warnStyle}>
                ⚠ Chrome 또는 Edge 최신 버전이 필요합니다
              </div>

              <button id="pickBtn" onClick={() => (window as any).pickFolder()} style={btnStyle("#155855")}>
                📂 폴더 선택하기
              </button>

              <div style={{ background: "#EDF5F3", borderRadius: 10, padding: "12px 14px", marginTop: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#5A7470", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 7 }}>분류 결과</div>
                {[
                  ["📷 RAW/", "CR2·ARW·NEF·DNG", "#E85D2C"],
                  ["🖼 JPG/Scene01~/", "시간 간격 기준 분류", "#155855"],
                  ["🎬 VIDEO/Scene01~/", "시간+컬러 기준 분류", "#569082"],
                  ["📄 sort_log.txt", "분류 기록 저장", "#9BB5B0"],
                ].map(([k, v, c]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #C8DDD9", fontSize: 11 }}>
                    <span style={{ fontFamily: "monospace", fontWeight: 700, color: c }}>{k}</span>
                    <span style={{ fontSize: 10, color: "#9BB5B0" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* SCANNING */}
        <div id="vScan" className="hidden">
          <div className="pc-card">
            <div style={{ padding: "44px 22px", textAlign: "center" }}>
              <div id="spinner" style={{ width: 28, height: 28, border: "3px solid #C8DDD9", borderTopColor: "#155855", borderRadius: "50%", animation: "spin .7s linear infinite", margin: "0 auto 14px" }} />
              <div id="scanMsg" style={{ fontSize: 14, fontWeight: 700, color: "#155855" }}>스캔 중...</div>
              <div id="scanSub" style={{ fontSize: 11, color: "#5A7470", marginTop: 6 }}></div>
            </div>
          </div>
          <div id="abox" className="hidden" style={{ background: "#fff", border: "1px solid #C8DDD9", borderRadius: 12, padding: "16px 18px", marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#155855", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
              <span id="aTitle">🎬 영상 분석 중...</span>
              <span id="aPct" style={{ color: "#155855" }}>0%</span>
            </div>
            <div style={{ height: 7, background: "#EDF5F3", borderRadius: 4, overflow: "hidden", marginBottom: 7 }}>
              <div id="aFill" style={{ height: "100%", background: "#155855", borderRadius: 4, transition: "width .3s", width: "0%" }} />
            </div>
            <div id="aTxt" style={{ fontSize: 10, color: "#9BB5B0", marginTop: 4 }}>0 / 0</div>
          </div>
        </div>

        {/* PREVIEW */}
        <div id="vPreview" className="hidden">
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #C8DDD9", borderRadius: 11, padding: "10px 14px", marginBottom: 12 }}>
            <span style={{ fontSize: 16 }}>📍</span>
            <div style={{ flex: 1 }}>
              <div id="pName" style={{ fontSize: 13, fontWeight: 700, color: "#155855" }}></div>
              <div id="pSub" style={{ fontSize: 10, color: "#9BB5B0" }}></div>
            </div>
            <button onClick={() => (window as any).resetAll()} style={{ height: 34, padding: "0 14px", background: "#fff", border: "1.5px solid #C8DDD9", borderRadius: 9, fontSize: 11, fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>다시 선택</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9, marginBottom: 12 }}>
            {[
              { id: "nRaw", icon: "📷", label: "RAW", dest: "→ RAW/", cls: "raw" },
              { id: "nJpg", icon: "🖼", label: "JPG", dest: "", destId: "dJpg", cls: "" },
              { id: "nVid", icon: "🎬", label: "VIDEO", dest: "", destId: "dVid", cls: "vid" },
            ].map(({ id, icon, label, dest, destId, cls }) => (
              <div key={id} style={{ border: "1.5px solid #C8DDD9", borderRadius: 12, padding: "12px 10px", textAlign: "center", background: "#fff" }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#5A7470", textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</div>
                <div id={id} style={{ fontSize: 26, fontWeight: 700, color: "#9BB5B0" }}>0</div>
                <div id={destId || undefined} style={{ fontSize: 9, color: "#9BB5B0", marginTop: 2 }}>{dest}</div>
              </div>
            ))}
          </div>
          <div id="jpgSceneList" className="hidden" style={{ border: "1px solid #C8DDD9", borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
            <div style={{ padding: "10px 14px", background: "#EAF4F2", fontSize: 11, fontWeight: 700, color: "#155855", borderBottom: "1px solid #C8DDD9", display: "flex", justifyContent: "space-between" }}>
              <span id="jpgShTxt"></span><span id="jpgShSub" style={{ fontSize: 10, fontWeight: 400, color: "#5A7470" }}></span>
            </div>
            <div id="jpgSceneRows"></div>
          </div>
          <div id="vidSceneList" className="hidden" style={{ border: "1px solid #C8DDD9", borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
            <div style={{ padding: "10px 14px", background: "#EEF7F5", fontSize: 11, fontWeight: 700, color: "#155855", borderBottom: "1px solid #C8DDD9", display: "flex", justifyContent: "space-between" }}>
              <span id="vidShTxt"></span><span style={{ fontSize: 10, fontWeight: 400, color: "#5A7470" }}>🎬 영상 Scene</span>
            </div>
            <div id="vidSceneRows"></div>
          </div>
          <div id="warnSkip" className="hidden" style={warnStyle}></div>
          <div id="emptyMsg" className="hidden" style={{ textAlign: "center", padding: 20, color: "#5A7470", fontSize: 13 }}>분류할 파일이 없습니다</div>
          <button id="startBtn" onClick={() => (window as any).runSort()} style={btnStyle("#E85D2C")}>파일 분류 시작 →</button>
        </div>

        {/* SORTING */}
        <div id="vSort" className="hidden">
          <div className="pc-card">
            <div style={{ padding: "32px 22px", textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#155855", marginBottom: 14 }}>
                분류 중... <span id="pPct">0</span>%
              </div>
              <div style={{ height: 7, background: "#EDF5F3", borderRadius: 4, overflow: "hidden" }}>
                <div id="pFill" style={{ height: "100%", background: "#155855", borderRadius: 4, transition: "width .3s", width: "0%" }} />
              </div>
              <div id="pMsg" style={{ fontSize: 11, color: "#5A7470", marginTop: 7 }}>파일을 이동하고 있습니다</div>
            </div>
          </div>
        </div>

        {/* DONE */}
        <div id="vDone" className="hidden">
          <div className="pc-card">
            <div style={{ background: "#EAF4F2", padding: 22, textAlign: "center", borderBottom: "1px solid #C8DDD9" }}>
              <div style={{ fontSize: 42, marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#155855", marginBottom: 4 }}>분류 완료!</div>
              <div style={{ fontSize: 13, color: "#5A7470" }}>sort_log.txt 저장됨</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, padding: 16 }}>
              {[{ id: "dRaw", label: "RAW" }, { id: "dJpgN", label: "JPG Scene" }, { id: "dVidN", label: "VIDEO Scene" }].map(({ id, label }) => (
                <div key={id} style={{ background: "#EDF5F3", borderRadius: 10, padding: 12, textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "#9BB5B0", marginBottom: 4 }}>{label}</div>
                  <div id={id} style={{ fontSize: 22, fontWeight: 700, color: "#155855" }}>0</div>
                </div>
              ))}
            </div>
            <div style={{ padding: "0 16px 8px" }}>
              <div id="logBox" style={{ background: "#EDF5F3", border: "1px solid #C8DDD9", borderRadius: 10, padding: "11px 13px", maxHeight: 200, overflowY: "auto" }} />
            </div>
            <div style={{ padding: "0 16px 16px" }}>
              <button onClick={() => (window as any).resetAll()} style={btnStyle("#155855")}>새 폴더 분류하기</button>
            </div>
          </div>
        </div>

        {/* ERROR */}
        <div id="vErr" className="hidden">
          <div className="pc-card" style={{ borderColor: "#FACCB8" }}>
            <div style={{ padding: "16px 20px" }}>
              <div id="errMsg" style={{ fontSize: 13, color: "#E85D2C", whiteSpace: "pre-wrap", lineHeight: 1.7, marginBottom: 14 }}></div>
              <button onClick={() => resetAll()} style={{ width: "100%", height: 34, padding: "0 14px", background: "#fff", border: "1.5px solid #C8DDD9", borderRadius: 9, fontSize: 11, fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>다시 시도</button>
            </div>
          </div>
        </div>

      </main>

      {/* 캔버스/비디오 (영상 분석용) */}
      <canvas id="cv" style={{ display: "none" }} width={64} height={64} />
      <video id="vidAnalyze" style={{ display: "none" }} muted crossOrigin="anonymous" preload="metadata" />

      {/* 토글 CSS + 스피너 */}
      <style>{`
        .hidden { display: none !important; }
        .tgl { position:relative; width:40px; height:22px; flex-shrink:0; margin-left:12px; display:inline-block; }
        .tgl input { opacity:0; width:0; height:0; }
        .tgl span { position:absolute; inset:0; background:#ccc; border-radius:22px; cursor:pointer; transition:.2s; }
        .tgl span::before { content:''; position:absolute; width:16px; height:16px; left:3px; bottom:3px; background:#fff; border-radius:50%; transition:.2s; }
        .tgl input:checked + span { background:#155855; }
        .tgl input:checked + span::before { transform:translateX(18px); }
        .sr { display:flex; align-items:center; gap:10px; padding:9px 14px; border-bottom:1px solid #C8DDD9; font-size:12px; }
        .sr:last-child { border-bottom:none; }
        .snm { font-weight:700; color:#155855; min-width:80px; font-family:monospace; font-size:11px; }
        .snm.vid { color:#569082; }
        .stag { font-size:9px; padding:2px 7px; border-radius:8px; font-weight:600; white-space:nowrap; }
        .stag.color { background:#EEF0FF; color:#3B4FBF; }
        .stag.time { background:#FDF5E0; color:#C8860A; }
        @keyframes spin { to { transform:rotate(360deg); } }
      `}</style>

      {/* 핵심 로직 (원본 JS 그대로) */}
      <script dangerouslySetInnerHTML={{ __html: `
"use strict";
var RAW_EXTS   = new Set(["cr2","arw","nef","dng","raf","rw2","cr3"]);
var JPG_EXTS   = new Set(["jpg","jpeg","png","webp","heic","tif","tiff"]);
var VIDEO_EXTS = new Set(["mp4","mov","avi","mts","m2ts","mkv","wmv","mp","m4v"]);
var COLOR_TH   = {1:20,2:35,3:55,4:80,5:110};
var COLOR_LBL  = {1:"매우 세밀",2:"세밀",3:"중간",4:"넓게",5:"매우 넓게"};
var shootType="studio", dirHandle=null, allFiles=[], jpgScenes=[], vidScenes=[], logLines=[];

function $(id){ return document.getElementById(id); }

function onGap(v){
  v=parseInt(v,10);
  $("gapVal").textContent=v+"분";
  $("gapHint").textContent="촬영 사이 "+v+"분 이상 쉬면 새 Scene으로 분류합니다";
  $("ruleGapS").textContent=v+"분";
  $("ruleGapL").textContent=v+"분";
}
function onColorTh(v){
  $("colorTh").textContent=COLOR_LBL[v];
}
function setType(t){
  shootType=t;
  var isS=(t==="studio");
  $("btnS").style.borderColor=isS?"#155855":"#C8DDD9";
  $("btnS").style.background=isS?"#EAF4F2":"#fff";
  $("btnL").style.borderColor=!isS?"#155855":"#C8DDD9";
  $("btnL").style.background=!isS?"#EAF4F2":"#fff";
  $("ruleS").classList.toggle("hidden",!isS);
  $("ruleL").classList.toggle("hidden",isS);
  var def=isS?3:5;
  $("gapSlider").value=def; onGap(def);
}
function showView(id){
  ["vIdle","vScan","vPreview","vSort","vDone","vErr"].forEach(function(v){
    $(v).classList.toggle("hidden",v!==id);
  });
}
function resetAll(){ dirHandle=null;allFiles=[];jpgScenes=[];vidScenes=[];logLines=[]; showView("vIdle"); }
function showErr(msg){ $("errMsg").textContent=msg; showView("vErr"); }

function pickFolder(){
  window.showDirectoryPicker({mode:"readwrite"})
    .then(function(dir){
      dirHandle=dir;
      $("scanMsg").textContent=dir.name+" 스캔 중...";
      $("scanSub").textContent="파일 목록을 읽고 있습니다";
      showView("vScan");
      return scanDir(dir);
    })
    .catch(function(e){
      if(e.name!=="AbortError") showErr(e.message||"폴더 접근 실패");
      else showView("vIdle");
    });
}

async function scanDir(dir){
  var found=[];
  for await(var entry of dir.values()){
    if(entry.kind!=="file") continue;
    var name=entry.name;
    if(name.startsWith(".")||name==="sort_log.txt") continue;
    var ext=(name.split(".").pop()||"").toLowerCase();
    var kind=RAW_EXTS.has(ext)?"RAW":JPG_EXTS.has(ext)?"JPG":VIDEO_EXTS.has(ext)?"VIDEO":"SKIP";
    var mtime=null;
    try{var f0=await entry.getFile(); mtime=f0.lastModified;}catch(e){}
    found.push({name,ext,kind,handle:entry,mtime,sceneIdx:1,vidColor:null});
  }
  allFiles=found.sort(function(a,b){return(a.mtime||0)-(b.mtime||0);});
  var vids=allFiles.filter(function(f){return f.kind==="VIDEO";});
  if(vids.length>0&&$("doVidScene").checked){
    $("abox").classList.remove("hidden");
    $("scanMsg").textContent="🎬 영상 분석 중...";
    $("scanSub").textContent=vids.length+"개 영상 첫 프레임 분석";
    await analyzeVideos(vids);
    $("abox").classList.add("hidden");
  }
  jpgScenes=buildScenes(allFiles.filter(function(f){return f.kind==="JPG";}),"jpg");
  vidScenes=buildScenes(vids,"vid");
  renderPreview(dir.name);
}

async function analyzeVideos(vids){
  var ctx=$("cv").getContext("2d",{willReadFrequently:true});
  var vid=$("vidAnalyze");
  for(var i=0;i<vids.length;i++){
    var f=vids[i];
    try{
      var file=await f.handle.getFile();
      var url=URL.createObjectURL(file);
      var color=await getVideoFirstFrame(vid,ctx,url);
      f.vidColor=color;
      URL.revokeObjectURL(url);
    }catch(e){f.vidColor=null;}
    var pct=Math.round((i+1)/vids.length*100);
    $("aFill").style.width=pct+"%"; $("aPct").textContent=pct+"%"; $("aTxt").textContent=(i+1)+" / "+vids.length;
  }
}
function getVideoFirstFrame(vid,ctx,url){
  return new Promise(function(resolve){
    var done=false;
    function extract(){
      if(done)return; done=true;
      try{
        ctx.clearRect(0,0,64,64); ctx.drawImage(vid,0,0,64,64);
        var d=ctx.getImageData(0,0,64,64).data;
        var r=0,g=0,b=0;
        for(var i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];b+=d[i+2];}
        var n=d.length/4; resolve([r/n,g/n,b/n]);
      }catch(e){resolve(null);}
    }
    var timeout=setTimeout(function(){extract();},3000);
    vid.onloadeddata=function(){vid.currentTime=0.1;};
    vid.onseeked=function(){clearTimeout(timeout);extract();};
    vid.onerror=function(){clearTimeout(timeout);resolve(null);};
    vid.src=url; vid.load();
  });
}
function colorDist(a,b){
  if(!a||!b)return 0;
  return Math.sqrt(Math.pow(a[0]-b[0],2)+Math.pow(a[1]-b[1],2)+Math.pow(a[2]-b[2],2));
}
function buildScenes(files,type){
  if(files.length===0)return[];
  var gapMs=parseInt($("gapSlider").value,10)*60000;
  var colorThVal=parseInt($("colorSlider").value,10);
  var colorThNum=COLOR_TH[colorThVal]||55;
  var groups=[],cur=[files[0]],prevColor=files[0].vidColor||null;
  for(var i=1;i<files.length;i++){
    var f=files[i];
    var gap=(f.mtime||0)-(files[i-1].mtime||0);
    var newScene=false,reason="";
    if(gap>=gapMs){newScene=true;reason="time";}
    if(!newScene&&type==="vid"&&f.vidColor&&prevColor){
      if(colorDist(f.vidColor,prevColor)>colorThNum){newScene=true;reason="color";}
    }
    if(newScene){groups.push({files:cur.slice(),reason});cur=[];}
    cur.push(f);
    if(f.vidColor)prevColor=f.vidColor;
  }
  if(cur.length>0)groups.push({files:cur.slice(),reason:""});
  groups.forEach(function(g,idx){g.files.forEach(function(ff){ff.sceneIdx=idx+1;});});
  return groups;
}
function renderPreview(name){
  var rawF=allFiles.filter(function(f){return f.kind==="RAW";});
  var jpgF=allFiles.filter(function(f){return f.kind==="JPG";});
  var vidF=allFiles.filter(function(f){return f.kind==="VIDEO";});
  var skipF=allFiles.filter(function(f){return f.kind==="SKIP";});
  var doRaw=$("doRaw").checked;
  var doVidScene=$("doVidScene").checked;
  var total=(doRaw?rawF.length:0)+jpgF.length+vidF.length;
  $("pName").textContent=name;
  $("pSub").textContent="파일 "+allFiles.length+"개 발견 · "+total+"개 분류 예정";
  function setN(id,n){var el=$(id);el.textContent=n;el.style.color=n>0?"#155855":"#9BB5B0";}
  setN("nRaw",doRaw?rawF.length:0); setN("nJpg",jpgF.length); setN("nVid",vidF.length);
  $("dJpg").textContent="→ JPG/ × "+jpgScenes.length+"Scene";
  $("dVid").textContent=doVidScene?"→ VIDEO/ × "+vidScenes.length+"Scene":"→ VIDEO/ (미분류)";
  renderSceneList("jpgSceneList","jpgShTxt","jpgShSub","jpgSceneRows",jpgScenes,"jpg");
  if(doVidScene&&vidScenes.length>0)
    renderSceneList("vidSceneList","vidShTxt","vidShSub","vidSceneRows",vidScenes,"vid");
  else $("vidSceneList").classList.add("hidden");
  if(skipF.length>0){
    $("warnSkip").classList.remove("hidden");
    $("warnSkip").innerHTML="⚠ 지원하지 않는 형식 "+skipF.length+"개 건너뜀: "+skipF.slice(0,5).map(function(f){return f.name;}).join(", ")+(skipF.length>5?" 외 "+(skipF.length-5)+"개":"");
  }else{$("warnSkip").classList.add("hidden");}
  $("emptyMsg").classList.toggle("hidden",total>0);
  var btn=$("startBtn");
  btn.disabled=(total===0);
  btn.textContent=total>0?total+"개 파일 분류 시작 →":"분류할 파일 없음";
  showView("vPreview");
}
function renderSceneList(listId,headTxtId,headSubId,rowsId,scenes,type){
  if(scenes.length===0){$(listId).classList.add("hidden");return;}
  $(listId).classList.remove("hidden");
  var gapMin=$("gapSlider").value;
  var label=type==="vid"?"VIDEO Scene":"JPG Scene";
  $(headTxtId).textContent=label+" "+scenes.length+"개 ("+gapMin+"분 기준)";
  var html="";
  for(var i=0;i<scenes.length;i++){
    var g=scenes[i];
    var firstT=g.files[0].mtime||0,lastT=g.files[g.files.length-1].mtime||0;
    var durMin=Math.round((lastT-firstT)/60000);
    var durTxt=durMin>0?"약 "+durMin+"분":"1분 미만";
    var gapTxt="";
    if(i>0){var prev=scenes[i-1].files[scenes[i-1].files.length-1];var sec=Math.round(((g.files[0].mtime||0)-(prev.mtime||0))/1000);gapTxt=sec>=60?Math.round(sec/60)+"분 뒤":sec+"초 뒤";}
    var reasonTag=g.reason==="color"?'<span class="stag color">컬러 변화</span>':g.reason==="time"?'<span class="stag time">시간 간격</span>':"";
    var nmClass=type==="vid"?"snm vid":"snm";
    html+='<div class="sr"><span class="'+nmClass+'">Scene'+String(i+1).padStart(2,"0")+'</span><span style="min-width:40px;color:#1C2B28;">'+g.files.length+(type==="vid"?"개":"장")+'</span><span style="font-size:10px;color:#5A7470;">'+durTxt+'</span>'+reasonTag+'<span style="font-size:10px;color:#9BB5B0;margin-left:auto;font-family:monospace;">'+gapTxt+'</span></div>';
  }
  $(rowsId).innerHTML=html;
}
async function runSort(){
  showView("vSort");
  var doRaw=$("doRaw").checked, doVidScene=$("doVidScene").checked, gapMin=$("gapSlider").value;
  logLines=["["+new Date().toLocaleString("ko-KR")+"] 분류 시작: "+dirHandle.name,"유형: "+(shootType==="studio"?"스튜디오":"로케이션")+" · 간격 "+gapMin+"분","JPG Scene: "+jpgScenes.length+"개 · VIDEO Scene: "+vidScenes.length+"개"];
  var rawFiles=allFiles.filter(function(f){return f.kind==="RAW";});
  var jpgFiles=allFiles.filter(function(f){return f.kind==="JPG";});
  var vidFiles=allFiles.filter(function(f){return f.kind==="VIDEO";});
  var total=(doRaw?rawFiles.length:0)+jpgFiles.length+vidFiles.length;
  var moved=0;
  function mkDir(p,n){return p.getDirectoryHandle(n,{create:true});}
  async function moveFile(fh,destDir,fname){
    var file=await fh.getFile(),buf=await file.arrayBuffer();
    var fn=fname,n=1;
    while(true){try{await destDir.getFileHandle(fn);var e=fname.split(".").pop()||"";var s=fname.slice(0,fname.length-e.length-1);fn=s+"_"+String(n).padStart(3,"0")+"."+e;n++;}catch(err){break;}}
    var nh=await destDir.getFileHandle(fn,{create:true});
    var wr=await nh.createWritable(); await wr.write(buf); await wr.close();
    try{await fh.remove();}catch(err){}
    return fn;
  }
  function setP(n,msg){
    var pct=Math.round(n/total*100);
    $("pPct").textContent=pct; $("pFill").style.width=pct+"%";
    if(msg)$("pMsg").textContent=msg;
  }
  try{
    if(doRaw&&rawFiles.length>0){var rawDir=await mkDir(dirHandle,"RAW");for(var ri=0;ri<rawFiles.length;ri++){var rf=rawFiles[ri];var dest=await moveFile(rf.handle,rawDir,rf.name);logLines.push(rf.name+" → RAW/"+dest);moved++;setP(moved,"RAW 이동 중...");}}
    if(jpgFiles.length>0){var jpgDir=await mkDir(dirHandle,"JPG");for(var ji=0;ji<jpgFiles.length;ji++){var jf=jpgFiles[ji];var sn="Scene"+String(jf.sceneIdx||1).padStart(2,"0");var sd=await mkDir(jpgDir,sn);var d2=await moveFile(jf.handle,sd,jf.name);logLines.push(jf.name+" → JPG/"+sn+"/"+d2);moved++;setP(moved,"JPG 분류 중... "+moved+"/"+total);}}
    if(vidFiles.length>0){var vidDir=await mkDir(dirHandle,"VIDEO");for(var vi=0;vi<vidFiles.length;vi++){var vf=vidFiles[vi];if(doVidScene){var vsn="Scene"+String(vf.sceneIdx||1).padStart(2,"0");var vsd=await mkDir(vidDir,vsn);var d3=await moveFile(vf.handle,vsd,vf.name);logLines.push(vf.name+" → VIDEO/"+vsn+"/"+d3);}else{var d4=await moveFile(vf.handle,vidDir,vf.name);logLines.push(vf.name+" → VIDEO/"+d4);}moved++;setP(moved,"VIDEO 분류 중...");}}
    try{var lh=await dirHandle.getFileHandle("sort_log.txt",{create:true});var lw=await lh.createWritable();await lw.write(logLines.join("\\n")+"\\n");await lw.close();}catch(le){}
    $("dRaw").textContent=doRaw?rawFiles.length:0;
    $("dJpgN").textContent=jpgScenes.length+"개";
    $("dVidN").textContent=doVidScene?vidScenes.length+"개":"-";
    var lh2=logLines.slice(0,30).map(function(l){return'<div style="font-size:11px;font-family:monospace;color:#5A7470;padding:2px 0;border-bottom:.5px solid #C8DDD9;">'+l+'</div>';}).join("");
    if(logLines.length>30)lh2+='<div style="font-size:11px;color:#9BB5B0;">외 '+(logLines.length-30)+'건</div>';
    $("logBox").innerHTML=lh2;
    showView("vDone");
  }catch(e){showErr(e.message||"분류 중 오류가 발생했습니다");}
}
      ` }} />
    </div>
  );
}

// ── 인라인 스타일 헬퍼 ──────────────────────────────────
function typeBtnStyle(on: boolean): React.CSSProperties {
  return {
    padding: "14px 12px", border: `2px solid ${on ? "#155855" : "#C8DDD9"}`,
    borderRadius: 12, background: on ? "#EAF4F2" : "#fff",
    cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all .15s",
  };
}
const ruleBoxStyle = (t: "s" | "l"): React.CSSProperties => ({
  borderRadius: 10, padding: "13px 15px", marginBottom: 14, fontSize: 12, lineHeight: 1.9,
  background: t === "s" ? "#EAF4F2" : "#FFF8F5",
  border: `1px solid ${t === "s" ? "#C8DDD9" : "#FACCB8"}`,
});
const slBoxStyle: React.CSSProperties = {
  background: "#EDF5F3", borderRadius: 10, padding: "13px 14px", marginBottom: 10,
};
const warnStyle: React.CSSProperties = {
  background: "#FDF5E0", border: "1px solid #F0D080", borderRadius: 10,
  padding: "10px 14px", fontSize: 11, color: "#C8860A", lineHeight: 1.6, marginBottom: 12,
};
const tglRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "10px 0", borderTop: "1px solid #C8DDD9",
};
const tglStyle: React.CSSProperties = {
  position: "relative", width: 40, height: 22, flexShrink: 0, marginLeft: 12, display: "inline-block",
};
function btnStyle(bg: string): React.CSSProperties {
  return {
    width: "100%", height: 50, background: bg, color: "#fff", border: "none",
    borderRadius: 11, fontSize: 15, fontFamily: "inherit", fontWeight: 700, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  };
}
