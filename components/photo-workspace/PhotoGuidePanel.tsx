import type { LucideIcon } from "lucide-react";
import { CheckSquare2, FileCheck2, FolderOpen, FolderTree, Images, Link2, MessageCircle, Palette, PenLine, ScanSearch, Scaling, Scissors, Sparkles, Users } from "lucide-react";
import { GuidePanel } from "@/components/workspace-shell/GuidePanel";
import type { PhotoSelectMode, PhotoWorkspaceMode } from "./types";

type GuideKey = "select_ai" | "select_manual" | "select_client" | "raw_match" | "classification" | "t_cut" | "retouch" | "resize" | "rename";
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
  t_cut: [
    { icon: FolderOpen, title: "현재 작업 폴더", description: "사진 작업실에서 선택한 JPG 폴더를 그대로 사용합니다." },
    { icon: Scissors, title: "T컷 분석", description: "눈 감음·흔들림·얼굴 식별 불가 조명만 검사합니다." },
    { icon: CheckSquare2, title: "후보 검토", description: "후보를 직접 확인하고 이동할 사진만 선택합니다." },
    { icon: FolderTree, title: "Trash_JPG 이동", description: "삭제하지 않고 현재 작업 폴더의 Trash_JPG로 옮깁니다." },
  ],
  retouch: [
    { icon: Images, title: "사진 업로드", description: "색감을 확인할 사진을 선택합니다." },
    { icon: Palette, title: "기준 선택", description: "피부톤 또는 가운 색상 기준을 선택합니다." },
    { icon: Sparkles, title: "색감 분석", description: "기준 색상과 현재 사진의 차이를 분석합니다." },
    { icon: FileCheck2, title: "보정값 확인", description: "Photoshop과 Camera Raw 보정 가이드를 확인합니다." },
  ],
  resize: [
    { icon: FolderOpen, title: "폴더 선택", description: "리사이즈할 사진이 있는 폴더를 선택하세요." },
    { icon: Scaling, title: "해상도·품질 지정", description: "긴 변 기준 해상도와 JPEG 품질을 고릅니다." },
    { icon: FolderTree, title: "일괄 변환", description: "하위 폴더까지 찾아 결과 폴더에 같은 구조로 저장합니다." },
    { icon: FileCheck2, title: "결과 확인", description: "완료·건너뜀·실패 건수와 실패 사유를 확인합니다." },
  ],
  rename: [
    { icon: FolderOpen, title: "현재 작업 폴더", description: "사진 작업실에서 이미 선택한 로컬 폴더를 그대로 사용합니다." },
    { icon: PenLine, title: "이름 규칙 선택", description: "일반 시퀀스, 직속 부모 폴더명, 직접 텍스트 중 하나를 고릅니다." },
    { icon: CheckSquare2, title: "변경 미리보기", description: "중복·건너뜀을 먼저 확인하고 오류가 없을 때만 실행합니다." },
    { icon: FileCheck2, title: "안전한 이름변경", description: "복사 후 SHA-256을 검증하고, 전체 검증 뒤 원본을 정리합니다." },
  ],
};

function guideKey(mode: PhotoWorkspaceMode, selectMode: PhotoSelectMode): GuideKey {
  if (mode === "select") return `select_${selectMode}` as GuideKey;
  if (mode === "raw-match") return "raw_match";
  if (mode === "t-cut") return "t_cut";
  if (mode === "retouch") return "retouch";
  if (mode === "resize") return "resize";
  if (mode === "rename") return "rename";
  return "classification";
}
export default function PhotoGuidePanel({ mode, selectMode }: { mode: PhotoWorkspaceMode; selectMode: PhotoSelectMode }) {
  const key = guideKey(mode, selectMode);
  const steps = GUIDES[key];
  return (
    <GuidePanel
      steps={steps}
      tip={key === "select_ai" ? (
        <>
          <Sparkles size={16} aria-hidden="true" />
          <p><strong>TIP</strong><span>정확한 키워드가 아니어도 괜찮아요.<br />AI가 의미를 이해하고 관련 사진을 찾아드립니다.</span></p>
        </>
      ) : undefined}
    />
  );
}
