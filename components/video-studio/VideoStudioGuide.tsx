import type { LucideIcon } from "lucide-react";
import { AudioLines, CheckSquare2, Copy, FileDown, FolderOpen, ListTree, MessageCircle, MousePointerClick, Newspaper, Scissors, Sparkles } from "lucide-react";
import photoStyles from "@/components/photo-workspace/PhotoWorkspace.module.css";
import type { VideoInterviewResult } from "@/lib/video-interview/types";
import styles from "./VideoStudio.module.css";

export type VideoStudioTab = "interview" | "reels" | "webzine" | "audio";
type Step = { icon: LucideIcon; title: string; description: string };

const SETUP: Step[] = [
  { icon: FolderOpen, title: "촬영 폴더 선택", description: "NAS에서 인터뷰 촬영본이 있는 폴더를 고릅니다." },
  { icon: MessageCircle, title: "촬영 정보 입력", description: "병원명·인물·주제를 적으면 인식과 정리가 정확해집니다." },
  { icon: Sparkles, title: "자동 분석", description: "전사 → Q&A 분리 → 핵심 정리 → 릴스 추천까지 Mac Studio가 처리합니다." },
  { icon: FileDown, title: "프리미어로 보내기", description: "Q&A 마커가 찍힌 시퀀스를 프리미어에서 엽니다." },
];
const RESULT: Step[] = [
  { icon: FileDown, title: "프리미어로 보내기", description: "본편(Q&A 마커) + 릴스별 세로 시퀀스 XML을 내려받습니다." },
  { icon: MousePointerClick, title: "파일 › 가져오기", description: "XML을 가져오면 원본 영상이 자동으로 연결됩니다." },
  { icon: ListTree, title: "마커 패널 더블클릭", description: "Q&A·릴스·편집 마커 위치로 바로 이동합니다." },
];
const REELS: Step[] = [
  { icon: CheckSquare2, title: "후보 채택", description: "쓸 릴스만 채택하세요. 채택이 없으면 전체를 보냅니다." },
  { icon: Scissors, title: "구간 다듬기", description: "시작·끝을 0.5초 단위로 조정합니다. 기본값은 말 사이 쉼에 맞춰져 있어요." },
  { icon: FileDown, title: "세로 시퀀스로 보내기", description: "1080×1920 시퀀스에 꽉 차게 배치된 상태로 열립니다." },
];
const WEBZINE: Step[] = [
  { icon: Newspaper, title: "초안 확인", description: "Q&A 내용을 바탕으로 쓴 웹진 초안입니다." },
  { icon: Copy, title: "블로그용 HTML 복사", description: "블로그 에디터에 붙여넣으면 웹진 스타일이 적용됩니다." },
  { icon: CheckSquare2, title: "사실 확인 후 발행", description: "병원명·수치·표현을 확인하고 발행하세요." },
];
const AUDIO: Step[] = [
  { icon: FolderOpen, title: "촬영 폴더 선택", description: "음성을 뽑을 영상이 있는 폴더를 고릅니다." },
  { icon: AudioLines, title: "음성 분리", description: "영상마다 원음 그대로 WAV 파일을 만듭니다." },
  { icon: FileDown, title: "결과 확인", description: "작업 디스크의 같은 경로 › 음성분리 폴더에 저장됩니다." },
];

export default function VideoStudioGuide({
  tab,
  result,
  editRoot,
  onEditRootChange,
}: {
  tab: VideoStudioTab;
  result: VideoInterviewResult | null;
  editRoot: string;
  onEditRootChange: (value: string) => void;
}) {
  const steps = tab === "interview" ? (result ? RESULT : SETUP) : tab === "reels" ? REELS : tab === "webzine" ? WEBZINE : AUDIO;
  const showSummary = tab === "interview" && result;
  return (
    <aside className={photoStyles.guide} aria-label="사용 가이드">
      <h2>{showSummary ? "요약" : "사용 가이드"}</h2>
      {showSummary ? <p className={styles.guideSummary}>{result.analysis.oneLine || result.analysis.summary}</p> : null}
      {showSummary ? <h2 style={{ marginBottom: 20 }}>프리미어에서 보기</h2> : null}
      <ol className={photoStyles.guideSteps}>
        {steps.map(({ icon: Icon, title, description }, index) => (
          <li key={title} className={photoStyles.guideStep}>
            <span className={photoStyles.guideIcon} aria-hidden="true"><Icon size={19} strokeWidth={1.7} /></span>
            <span className={photoStyles.guideNumber}>{index + 1}</span>
            <span className={photoStyles.guideCopy}><strong>{title}</strong><small>{description}</small></span>
          </li>
        ))}
      </ol>
      {(tab === "interview" && result) || tab === "reels" ? (
        <div className={styles.guideField}>
          <label htmlFor="video-studio-edit-root">편집하는 맥의 NAS 경로</label>
          <input
            id="video-studio-edit-root"
            value={editRoot}
            onChange={(event) => onEditRootChange(event.target.value)}
            placeholder={result?.sourceAbsoluteRoot ?? "/Volumes/Workstation(M.2SSD)"}
          />
          <small>Mac Studio가 아닌 다른 맥에서 편집하면, 그 맥에 마운트된 같은 NAS 경로를 적어주세요. 비워두면 Mac Studio 경로({result?.sourceAbsoluteRoot ?? "SOURCE_ROOT"})를 씁니다. 경로가 달라도 프리미어에서 파일 하나만 다시 연결하면 나머지는 자동으로 찾습니다.</small>
        </div>
      ) : null}
      {tab === "interview" && !result ? (
        <div className={photoStyles.tip}>
          <Sparkles size={16} aria-hidden="true" />
          <p><strong>TIP</strong><span>마이크를 차지 않은 질문자 목소리는 작게 녹음돼요. 목소리 크기·쉼·파일 바뀜을 함께 보고 질문과 답변을 나눕니다.</span></p>
        </div>
      ) : null}
    </aside>
  );
}
