"use client";

import type { SavedSortingSession } from "@/lib/photo-classifier/sortingSession";
import { DEPARTMENT_DISPLAY } from "@/lib/photo-classifier/types";
import { C } from "@/lib/theme";

export function SavedPhotoSortingSessionBanner({
  session,
  onRestore,
  onClear,
}: {
  session: SavedSortingSession;
  onRestore: (session: SavedSortingSession) => void;
  onClear: () => void;
}) {
  return (
    <div style={{background:C.light,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"16px 20px",display:"flex",flexDirection:"column",gap:12}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:18}}>💾</span>
        <div>
          <div style={{fontSize:13,fontWeight:600,color:"#155855"}}>이전 작업이 저장되어 있습니다</div>
          <div style={{fontSize:11,color:C.muted,marginTop:2}}>
            {DEPARTMENT_DISPLAY[session.department]} · {session.rootDirName || "폴더"} · {session.sceneSummary.length}개 씬 · {new Date(session.savedAt).toLocaleDateString("ko-KR",{month:"long",day:"numeric",hour:"2-digit",minute:"2-digit"})}
          </div>
        </div>
      </div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={() => onRestore(session)} style={{flex:1,padding:"10px 0",background:"#37C39D",color:"#103E36",border:"none",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
          📂 폴더 선택 후 이어서 하기
        </button>
        <button onClick={onClear} style={{padding:"10px 16px",background:"rgba(255,255,255,.06)",color:"#D9F6EE",border:"1px solid rgba(255,255,255,.18)",borderRadius:8,fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:"inherit"}}>
          무시
        </button>
      </div>
      <div style={{fontSize:10,color:C.hint,lineHeight:1.6}}>
        ※ 파일은 이미 폴더에 정리되어 있습니다. 같은 폴더를 다시 선택하면 {session.step >= 4 ? "베스트컷 선택 단계" : session.step >= 2 ? "씬 검토 단계" : ""}로 바로 이동합니다.
      </div>
    </div>
  );
}
