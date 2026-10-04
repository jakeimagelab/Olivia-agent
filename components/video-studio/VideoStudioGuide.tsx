import type { LucideIcon } from "lucide-react";
import {
  AudioLines,
  CheckSquare2,
  Copy,
  FileDown,
  FolderOpen,
  ListTree,
  MessageCircle,
  MousePointerClick,
  Newspaper,
  PenLine,
  Play,
  Scissors,
  Send,
  Sparkles,
  Video,
} from "lucide-react";
import { GuidePanel } from "@/components/workspace-shell/GuidePanel";
import type { VideoInterviewResult } from "@/lib/video-interview/types";
import type { VideoStudioTool } from "./videoStudioNavigation";
import styles from "./VideoStudio.module.css";

type Step = { icon: LucideIcon; title: string; description: string };

const SETUP: Step[] = [
  { icon: FolderOpen, title: "촬영 폴더 선택", description: "분석할 인터뷰 촬영본이 있는 폴더를 고릅니다." },
  { icon: MessageCircle, title: "촬영 정보 입력", description: "병원명·인물·주제를 적으면 인식과 정리가 정확해집니다." },
  { icon: Sparkles, title: "자동 분석", description: "전사 → Q&A 분리 → 핵심 정리 → 릴스 추천을 처리합니다." },
  { icon: FileDown, title: "프리미어로 보내기", description: "Q&A 마커가 찍힌 시퀀스를 프리미어에서 엽니다." },
];
const RESULT: Step[] = [
  { icon: FileDown, title: "프리미어로 보내기", description: "본편과 릴스별 세로 시퀀스 XML을 내려받습니다." },
  { icon: MousePointerClick, title: "파일 › 가져오기", description: "XML을 가져오면 원본 영상이 자동으로 연결됩니다." },
  { icon: ListTree, title: "마커 패널 더블클릭", description: "Q&A·릴스·편집 마커 위치로 바로 이동합니다." },
];
const GUIDES: Record<VideoStudioTool, Step[]> = {
  "video-conti": [
    { icon: PenLine, title: "기본 정보", description: "병원·진료과와 영상 용도를 정합니다." },
    { icon: ListTree, title: "장면 구성", description: "장면별 컷·카메라·길이를 구성합니다." },
    { icon: CheckSquare2, title: "검토", description: "촬영 순서와 전체 시간을 확인합니다." },
    { icon: Send, title: "공유", description: "기존 공유 링크를 생성합니다." },
  ],
  "youtube-conti": [
    { icon: PenLine, title: "편집 목적", description: "영상 목적과 편집 방향을 정합니다." },
    { icon: ListTree, title: "구성 작성", description: "장면과 편집 메모를 구성합니다." },
    { icon: CheckSquare2, title: "검토", description: "전체 흐름을 확인하고 저장합니다." },
  ],
  broll: [
    { icon: MessageCircle, title: "장면 설명", description: "필요한 B-roll 장면을 설명합니다." },
    { icon: Sparkles, title: "프롬프트 생성", description: "촬영·생성용 프롬프트를 만듭니다." },
    { icon: Copy, title: "복사", description: "완성된 프롬프트를 복사합니다." },
  ],
  prompter: [
    { icon: PenLine, title: "대본", description: "촬영할 대본을 입력하거나 불러옵니다." },
    { icon: Video, title: "읽기 설정", description: "속도·글자 크기·반전·리모컨을 설정합니다." },
    { icon: Play, title: "읽기 화면", description: "전체화면 프롬프터와 녹화를 시작합니다." },
  ],
  interview: SETUP,
  reels: [
    { icon: CheckSquare2, title: "후보 채택", description: "쓸 릴스만 채택하세요. 채택이 없으면 전체를 보냅니다." },
    { icon: Scissors, title: "구간 다듬기", description: "시작·끝을 0.5초 단위로 조정합니다." },
    { icon: FileDown, title: "세로 시퀀스로 보내기", description: "1080×1920 시퀀스로 엽니다." },
  ],
  sorting: [
    { icon: FolderOpen, title: "영상 폴더 선택", description: "이 기기에서 정리할 영상 폴더를 엽니다." },
    { icon: Sparkles, title: "분류 기준", description: "AI 카테고리 또는 촬영 시간 간격을 선택합니다." },
    { icon: CheckSquare2, title: "검토 후 정리", description: "결과를 확인하고 카테고리 폴더로 정리합니다." },
  ],
  audio: [
    { icon: FolderOpen, title: "촬영 폴더 선택", description: "음성을 뽑을 영상이 있는 폴더를 고릅니다." },
    { icon: AudioLines, title: "음성 분리", description: "영상마다 원음 그대로 WAV 파일을 만듭니다." },
    { icon: FileDown, title: "결과 확인", description: "작업 폴더의 음성분리 폴더에서 확인합니다." },
  ],
  magazine: [
    { icon: Newspaper, title: "원고 확인", description: "Q&A를 바탕으로 만든 매거진 원고 초안입니다." },
    { icon: Copy, title: "HTML 복사", description: "블로그 에디터에 붙여넣을 HTML을 복사합니다." },
    { icon: CheckSquare2, title: "사실 확인", description: "병원명·수치·표현을 확인하고 발행합니다." },
  ],
  "ai-video": [
    { icon: MessageCircle, title: "제작 정보", description: "영상 목적과 필요한 내용을 입력합니다." },
    { icon: Sparkles, title: "AI 제작", description: "기존 영상 제작 흐름을 실행합니다." },
    { icon: CheckSquare2, title: "결과 확인", description: "결과를 검토하고 저장합니다." },
  ],
};

export default function VideoStudioGuide({
  tool,
  result,
  editRoot,
  onEditRootChange,
}: {
  tool: VideoStudioTool;
  result: VideoInterviewResult | null;
  editRoot: string;
  onEditRootChange: (value: string) => void;
}) {
  const showSummary = tool === "interview" && result;
  const steps = showSummary ? RESULT : GUIDES[tool];
  return (
    <GuidePanel
      title={showSummary ? "요약" : "사용 가이드"}
      intro={showSummary ? <><p className={styles.guideSummary}>{result.analysis.oneLine || result.analysis.summary}</p><h2 className={styles.guideSubheading}>프리미어에서 보기</h2></> : undefined}
      steps={steps}
      tip={tool === "interview" && !result ? (
        <>
          <Sparkles size={16} aria-hidden="true" />
          <p><strong>TIP</strong><span>목소리 크기·쉼·파일 바뀜을 함께 보고 질문과 답변을 나눕니다.</span></p>
        </>
      ) : undefined}
    >
      {(tool === "interview" && result) || tool === "reels" ? (
        <div className={styles.guideField}>
          <label htmlFor="video-studio-edit-root">편집하는 맥의 NAS 경로</label>
          <input
            id="video-studio-edit-root"
            value={editRoot}
            onChange={(event) => onEditRootChange(event.target.value)}
            placeholder={result?.sourceAbsoluteRoot ?? "/Volumes/Workstation(M.2SSD)"}
          />
          <small>맥북에서 분석한 경우 비워두세요. 비우면 분석한 컴퓨터의 경로를 사용합니다.</small>
        </div>
      ) : null}
    </GuidePanel>
  );
}
