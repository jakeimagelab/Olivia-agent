import Link from "next/link";
import {
  AlertTriangle, CalendarDays, Camera, CheckCircle2, Clock3,
  Images, Mail, Scissors, Target, WandSparkles,
} from "lucide-react";
import SummaryCard from "@/components/admin/SummaryCard";
import ActionCard from "@/components/admin/ActionCard";
import OliviaRecommendationPanel from "@/components/admin/OliviaRecommendationPanel";
import CategorySection from "@/components/admin/CategorySection";
import StatusBadge from "@/components/admin/StatusBadge";
import { DailyBriefCard, TodayScheduleCard } from "@/components/dashboard/TodayAlertBanner";
import DailyQuoteWidget from "@/components/dashboard/DailyQuoteWidget";

/* 숫자·업무 목록은 2차 데이터 연동 전까지 쓰는 프레젠테이션 값 — 색은 6개 카드가
   전부 다른 톤을 쓰도록 다양화해서(파랑=테일 하나로만 안 몰리게) 화면에 생동감을 준다. */
const DEMO_SUMMARY = [
  { label: "오늘 할 일", value: "12", description: "완료 4 · 남음 8", icon: <CheckCircle2 size={18}/>, tone: "blue" as const },
  { label: "촬영 예정", value: "1", description: "오늘 오후 2시", icon: <Camera size={18}/>, tone: "orange" as const },
  { label: "메일 대기", value: "4", description: "발송 확인 필요", icon: <Mail size={18}/>, tone: "green" as const },
  { label: "셀렉 완료", value: "2", description: "다음 단계 이동 가능", icon: <Images size={18}/>, tone: "orange" as const },
  { label: "RAW 매칭 필요", value: "2", description: "신규 작업", icon: <Scissors size={18}/>, tone: "blue" as const },
  { label: "지연 프로젝트", value: "3", description: "오늘 확인 권장", icon: <AlertTriangle size={18}/>, tone: "red" as const },
];

const DEMO_ACTIONS = [
  { title: "메일 발송 대기 4건", description: "자동 생성된 초안의 수신자와 첨부 파일을 확인한 뒤 발송하세요.", meta: "통합 메일링", status: "확인 필요", href: "/mailing" },
  { title: "오블리브의원 원본 셀렉 대기 2일차", description: "고객 셀렉 진행 여부를 확인하고 필요하면 링크를 다시 보내세요.", meta: "고객 셀렉", status: "대기 2일", href: "/select-galleries" },
  { title: "브라보마취통증의학과 RAW 매칭 필요", description: "셀렉 완료 파일과 원본 RAW를 연결할 준비가 됐습니다.", meta: "사진 작업", status: "작업 가능", href: "/select-match" },
];

export default function AdminDashboardHomePage() {
  return (
    <div className="oa-page pc-dash-home">
      <div className="pc-dash-brief">
        <DailyBriefCard/>
        <TodayScheduleCard/>
        <DailyQuoteWidget/>
      </div>

      <section className="oa-summary-grid pc-dash-summary" aria-label="운영 현황 요약">
        {DEMO_SUMMARY.map(item => <SummaryCard key={item.label} {...item}/>) }
      </section>

      <div className="oa-dashboard-layout pc-dash-layout">
        <div className="oa-main-column">
          <CategorySection
            eyebrow="TODAY"
            title="오늘 처리할 업무"
            description="지금 움직이면 다음 단계로 넘길 수 있는 업무입니다."
            action={<StatusBadge tone="blue">우선순위 {DEMO_ACTIONS.length}</StatusBadge>}
          >
            <div className="oa-action-list">
              {DEMO_ACTIONS.map(item => <ActionCard key={item.title} {...item}/>) }
            </div>
          </CategorySection>

          <CategorySection eyebrow="QUICK" title="빠른 실행">
            <div className="oa-quick-grid oa-quick-grid--row">
              <Link href="/memo"><WandSparkles size={16}/><span>메모 작성</span></Link>
              <Link href="/calendar"><CalendarDays size={16}/><span>일정 추가</span></Link>
              <Link href="/mailing"><Mail size={16}/><span>메일 확인</span></Link>
              <Link href="/admin/tools"><Clock3 size={16}/><span>기능 열기</span></Link>
            </div>
          </CategorySection>
        </div>

        <aside className="oa-right-column" aria-label="운영 보조 패널">
          <OliviaRecommendationPanel items={[
            "셀렉 대기 3일차 고객에게 리마인드 메일을 보내세요.",
            "RAW 매칭 완료 고객 2건의 보정 단계를 시작하세요.",
            "최종 납품 완료 고객 3건에 후기 요청을 보내세요.",
          ]}/>

          <CategorySection eyebrow="ACTIVITY" title="최근 활동">
            <div className="oa-compact-list">
              <div><span className="oa-mini-icon is-orange"><Mail size={14}/></span><p><strong>메일 초안 2건 생성</strong><small>12분 전</small></p></div>
              <div><span className="oa-mini-icon is-blue"><Images size={14}/></span><p><strong>고객 셀렉 완료</strong><small>38분 전</small></p></div>
              <div><span className="oa-mini-icon is-green"><Target size={14}/></span><p><strong>워크플로우 단계 이동</strong><small>1시간 전</small></p></div>
            </div>
          </CategorySection>
        </aside>
      </div>
    </div>
  );
}
