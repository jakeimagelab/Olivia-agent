"use client";

import {
  DEPARTMENT_DESCRIPTION,
  DEPARTMENT_DISPLAY,
  type MedicalDepartment,
} from "@/lib/photo-classifier/types";
import {
  PHOTO_DEPARTMENT_SOURCE_DISPLAY,
  type PhotoDepartmentResolution,
} from "@/lib/photo-classifier/departmentResolver";
import { C } from "@/lib/theme";

const DEPARTMENTS: Array<{ value: MedicalDepartment; label: string }> = [
  { value: "dermatology", label: "피부과" },
  { value: "dentistry", label: "치과" },
  { value: "ophthalmology", label: "안과" },
  { value: "orthopedics_neurosurgery", label: "근골격·통증계" },
  { value: "pediatrics", label: "소아과" },
  { value: "korean_medicine", label: "한의원" },
  { value: "plastic_surgery", label: "성형외과" },
  { value: "obgyn", label: "산부인과" },
  { value: "internal_medicine_checkup", label: "내과/검진센터" },
  { value: "general", label: "기타" },
];

export function PhotoDepartmentControl({
  compact = false,
  hasFolder,
  loading,
  resolution,
  pickerOpen,
  error,
  onOpenPicker,
  onChoose,
}: {
  compact?: boolean;
  hasFolder: boolean;
  loading: boolean;
  resolution: PhotoDepartmentResolution;
  pickerOpen: boolean;
  error: string;
  onOpenPicker: () => void;
  onChoose: (department: MedicalDepartment) => void;
}) {
  const resolved = resolution.status === "resolved" ? resolution : null;
  const showPicker = pickerOpen || (!loading && hasFolder && !resolved);

  return (
    <div style={{padding:compact ? "12px 16px" : "14px 20px",display:"flex",flexDirection:"column",gap:10}}>
      {!hasFolder ? (
        <div style={{fontSize:11,color:C.hint,lineHeight:1.6}}>
          폴더를 선택하면 등록 고객 정보와 폴더명에서 진료과를 자동으로 적용합니다.
        </div>
      ) : loading ? (
        <div aria-live="polite" style={{padding:"10px 12px",borderRadius:8,background:"rgba(79,216,184,.08)",border:`1px solid ${C.border}`,fontSize:11.5,color:C.green}}>
          진료과 정보를 확인하고 있습니다…
        </div>
      ) : resolved && !pickerOpen ? (
        <div style={{padding:"11px 12px",borderRadius:8,background:"rgba(79,216,184,.08)",border:"1px solid rgba(79,216,184,.28)",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
          <div style={{minWidth:0}}>
            <div style={{fontSize:12.5,fontWeight:650,color:C.green}}>
              {DEPARTMENT_DISPLAY[resolved.department]} 적용됨
            </div>
            <div style={{marginTop:3,fontSize:10.5,color:C.muted,lineHeight:1.5}}>
              {PHOTO_DEPARTMENT_SOURCE_DISPLAY[resolved.source]}
              {resolved.rawValue && resolved.source !== "manual" ? ` · ${resolved.rawValue}` : ""}
            </div>
            {DEPARTMENT_DESCRIPTION[resolved.department] ? (
              <div style={{marginTop:3,fontSize:10.5,color:C.hint,lineHeight:1.5}}>{DEPARTMENT_DESCRIPTION[resolved.department]}</div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onOpenPicker}
            style={{flex:"0 0 auto",padding:"6px 9px",borderRadius:7,border:`1px solid ${C.border}`,background:"transparent",color:C.teal,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}
          >
            변경
          </button>
        </div>
      ) : null}

      {error ? (
        <div role="alert" style={{padding:"9px 11px",borderRadius:8,background:"rgba(232,93,44,.10)",border:"1px solid rgba(232,93,44,.34)",fontSize:11,color:"#FFC3AD",lineHeight:1.55}}>
          {error}
        </div>
      ) : null}

      {showPicker ? (
        <>
          <div style={{fontSize:11,color:resolution.status === "conflict" ? "#FFC3AD" : C.muted,lineHeight:1.55}}>
            {resolution.status === "conflict"
              ? "고객 정보와 폴더명의 진료과가 달라 자동 적용하지 않았습니다. 한 번만 확인해주세요."
              : "진료과를 자동으로 확인하지 못했습니다. 한 번만 선택해주세요."}
          </div>
          <div style={{display:"grid",gridTemplateColumns:compact?"1fr 1fr":"repeat(auto-fill,minmax(140px,1fr))",gap:8}}>
            {DEPARTMENTS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => onChoose(item.value)}
                style={{padding:compact?"9px 10px":"10px 14px",borderRadius:8,border:`1.5px solid ${resolved?.department===item.value?C.teal:C.border}`,background:resolved?.department===item.value?C.light:C.surface,cursor:"pointer",fontSize:compact?11.5:12,fontWeight:600,color:resolved?.department===item.value?C.teal:C.muted,fontFamily:"inherit",textAlign:"left"}}
              >
                {item.label}{resolved?.department===item.value ? " ✓" : ""}
              </button>
            ))}
          </div>
          {resolved && DEPARTMENT_DESCRIPTION[resolved.department] ? (
            <div style={{fontSize:10.5,color:C.hint,lineHeight:1.55}}>{DEPARTMENT_DESCRIPTION[resolved.department]}</div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
