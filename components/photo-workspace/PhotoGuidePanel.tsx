import type { LucideIcon } from "lucide-react";
import { CheckSquare2, Clock, FileCheck2, FileOutput, FolderOpen, FolderTree, Images, Link2, MessageCircle, Palette, ScanSearch, Scissors, Sparkles, Users } from "lucide-react";
import type { PhotoSelectMode, PhotoWorkspaceMode } from "./types";
import type { PhotoWorkspaceToolId } from "./photoWorkspaceToolState";
import styles from "./PhotoWorkspace.module.css";

type GuideKey = "select_ai" | "select_manual" | "select_client" | "raw_match" | "classification" | "conversion" | "metadata_match" | "ai_cull" | "retouch";
type GuideStep = { icon: LucideIcon; title: string; description: string };

const GUIDES: Record<GuideKey, GuideStep[]> = {
  select_ai: [
    { icon: FolderOpen, title: "사진 폴더 선택", description: "셀렉할 사진이 있는 폴더를 선택하세요." },
    { icon: MessageCircle, title: "원하는 사진 설명", description: "자연어로 설명하면 AI가 관련 장면을 이해합니다." },
    { icon: Images, title: "후보 확인 및 선택", description: "찾은 후보를 확인하고 원하는 사진을 선택하세요." },
    { icon: Link2, title: "RAW 매칭", description: "선택한 사진의 RAW 파일을 자동으로 매칭합니다." },
  ],
  select_manual: [
    { icon: FolderOpen, title: "사진 폴더 선택", description: "직접 확인할 JPG 폴더를 선택하세요." },
    { icon: Images, title: "사진 확인", description: "Scene별 사진과 촬영 정보를 확인합니다." },
    { icon: CheckSquare2, title: "원하는 사진 선택", description: "필요한 사진을 직접 선택하세요." },
    { icon: Link2, title: "RAW 매칭", description: "선택한 JPG와 같은 RAW를 연결합니다." },
  ],
  select_client: [
    { icon: Users, title: "고객 선택 불러오기", description: "파일명 목록이나 고객 전달 파일을 불러옵니다." },
    { icon: ScanSearch, title: "JPG 매칭", description: "입력된 파일명을 실제 JPG와 대조합니다." },
    { icon: FileCheck2, title: "결과 확인", description: "찾은 파일과 누락된 파일을 확인합니다." },
    { icon: Link2, title: "RAW 매칭", description: "확인된 파일명의 RAW 원본을 복사합니다." },
  ],
  raw_match: [
    { icon: Images, title: "셀렉 JPG 선택", description: "매칭할 JPG 또는 파일명 목록을 준비합니다." },
    { icon: FolderOpen, title: "RAW 원본 선택", description: "RAW 원본이 있는 폴더를 선택하세요." },
    { icon: Link2, title: "자동 매칭", description: "기존 파일명 matcher로 RAW를 연결합니다." },
    { icon: FileCheck2, title: "결과 확인", description: "매칭 성공과 누락 결과를 확인합니다." },
  ],
  classification: [
    { icon: FolderOpen, title: "사진 폴더 선택", description: "분류할 JPG와 RAW 폴더를 선택합니다." },
    { icon: Sparkles, title: "분석", description: "기존 분석 설정으로 촬영 흐름을 확인합니다." },
    { icon: FolderTree, title: "Scene 분류", description: "장면과 유형 기준으로 폴더를 구성합니다." },
    { icon: FileCheck2, title: "결과 확인", description: "분류 결과를 검토하고 저장합니다." },
  ],
  conversion: [
    { icon: FolderOpen, title: "영상 폴더 선택", description: "변환할 고해상도 영상 폴더를 선택합니다." },
    { icon: CheckSquare2, title: "대상 확인", description: "변환할 파일과 화질 설정을 확인합니다." },
    { icon: FileOutput, title: "FHD 변환", description: "브라우저에서 1920×1080 MP4로 변환합니다." },
    { icon: FileCheck2, title: "결과 확인", description: "FHD_변환 폴더의 결과를 확인합니다." },
  ],
  metadata_match: [
    { icon: Images, title: "고객 선택본", description: "파일명이 변경된 고객 선택본 폴더를 고릅니다." },
    { icon: Clock, title: "촬영시간 확인", description: "EXIF 촬영시간으로 원본 JPG를 찾습니다." },
    { icon: FolderOpen, title: "RAW 원본 선택", description: "연결할 RAW 원본 폴더를 선택합니다." },
    { icon: FileCheck2, title: "결과 확인", description: "매칭 성공과 확인 필요 항목을 검토합니다." },
  ],
  ai_cull: [
    { icon: FolderOpen, title: "촬영 폴더 선택", description: "정리할 JPG와 RAW 폴더를 선택합니다." },
    { icon: Scissors, title: "컷 분석", description: "품질과 중복 기준으로 후보를 정리합니다." },
    { icon: CheckSquare2, title: "후보 검토", description: "남길 사진과 제외할 사진을 확인합니다." },
    { icon: Link2, title: "RAW 정리", description: "선택한 JPG의 RAW 원본을 결과 폴더에 모읍니다." },
  ],
  retouch: [
    { icon: Images, title: "사진 업로드", description: "색감을 확인할 사진을 선택합니다." },
    { icon: Palette, title: "기준 선택", description: "피부톤 또는 가운 색상 기준을 선택합니다." },
    { icon: Sparkles, title: "색감 분석", description: "기준 색상과 현재 사진의 차이를 분석합니다." },
    { icon: FileCheck2, title: "보정값 확인", description: "Photoshop과 Camera Raw 보정 가이드를 확인합니다." },
  ],
};

function guideKey(mode: PhotoWorkspaceMode, selectMode: PhotoSelectMode, tool?: string | null): GuideKey {
  if (tool === "metadata-match") return "metadata_match";
  if (tool === "ai-cull") return "ai_cull";
  if (tool === "retouch") return "retouch";
  if (mode === "select") return `select_${selectMode}` as GuideKey;
  if (mode === "raw-match") return "raw_match";
  return mode;
}
export default function PhotoGuidePanel({ mode, selectMode, tool }: { mode: PhotoWorkspaceMode; selectMode: PhotoSelectMode; tool?: PhotoWorkspaceToolId | string | null }) {
  const key = guideKey(mode, selectMode, tool);
  const steps = GUIDES[key];
  return (
    <aside className={styles.guide} aria-label="사용 가이드">
      <h2>사용 가이드</h2>
      <ol className={styles.guideSteps}>
        {steps.map(({ icon: Icon, title, description }, index) => (
          <li key={title} className={styles.guideStep}>
            <span className={styles.guideIcon} aria-hidden="true"><Icon size={19} strokeWidth={1.7} /></span>
            <span className={styles.guideNumber}>{index + 1}</span>
            <span className={styles.guideCopy}><strong>{title}</strong><small>{description}</small></span>
          </li>
        ))}
      </ol>
      {key === "select_ai" ? (
        <div className={styles.tip}>
          <Sparkles size={16} aria-hidden="true" />
          <p><strong>TIP</strong><span>정확한 키워드가 아니어도 괜찮아요.<br />AI가 의미를 이해하고 관련 사진을 찾아드립니다.</span></p>
        </div>
      ) : null}
    </aside>
  );
}
