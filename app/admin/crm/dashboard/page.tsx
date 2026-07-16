import Link from "next/link";
import {
  AlertTriangle, CalendarClock, Camera, CheckCircle2, ClipboardCheck, FileSignature,
  FolderKanban, Images, RefreshCw, UserRoundCheck, UsersRound,
} from "lucide-react";
import SummaryCard from "@/components/admin/SummaryCard";
import OliviaRecommendationPanel from "@/components/admin/OliviaRecommendationPanel";
import CategorySection from "@/components/admin/CategorySection";
import StatusBadge from "@/components/admin/StatusBadge";

const DEMO_CRM_SUMMARY = [
  { label: "진행중 프로젝트", value: "18", description: "이번 달 전체", icon: <FolderKanban size={18}/>, tone: "blue" as const },
  { label: "견적 대기", value: "3", description: "답변 확인 필요", icon: <ClipboardCheck size={18}/>, tone: "orange" as const },
  { label: "계약 대기", value: "2", description: "서명 전", icon: <FileSignature size={18}/>, tone: "orange" as const },
  { label: "촬영 예정", value: "5", description: "7일 이내", icon: <Camera size={18}/>, tone: "blue" as const },
  { label: "셀렉 대기", value: "4", description: "고객 진행 중", icon: <Images size={18}/>, tone: "green" as const },
  { label: "RAW 매칭 필요", value: "2", description: "작업 가능", icon: <RefreshCw size={18}/>, tone: "orange" as const },
  { label: "보정 진행", value: "6", description: "내부 작업 중", icon: <CheckCircle2 size={18}/>, tone: "green" as const },
  { label: "후속 관리 대상", value: "7", description: "후기·재계약", icon: <UserRoundCheck size={18}/>, tone: "red" as const },
];

const BOARD_COLUMNS = [
  { title: "상담 · 견적", count: 4, tone: "blue" as const, cards: ["온리원의원", "브라보마취통증의학과"] },
  { title: "촬영 준비", count: 3, tone: "orange" as const, cards: ["리움피부과", "심포니성형외과"] },
  { title: "셀렉 · 보정", count: 7, tone: "green" as const, cards: ["오블리브의원", "운정표병원"] },
  { title: "납품 · 후속", count: 4, tone: "gray" as const, cards: ["메이린클리닉", "서울바른정형외과"] },
];

export default function CrmDashboardPage() {
  return (
    <div className="oa-page pc-dash-home">
      <section className="oa-summary-grid oa-summary-grid--crm pc-dash-summary" aria-label="CRM 현황 요약">
        {DEMO_CRM_SUMMARY.map(item => <SummaryCard key={item.label} {...item}/>) }
      </section>

      <div className="oa-dashboard-layout pc-dash-layout">
        <div className="oa-main-column">
          <CategorySection
            eyebrow="PIPELINE"
            title="프로젝트 보드 미리보기"
            description="고객 프로젝트가 현재 어느 구간에 있는지 확인합니다."
            action={<Link className="oa-text-link" href="/admin/crm/board">전체 보드 보기</Link>}
          >
            <div className="oa-board-preview">
              {BOARD_COLUMNS.map(column => <div className="oa-board-column" key={column.title}>
                <header><strong>{column.title}</strong><StatusBadge tone={column.tone}>{column.count}</StatusBadge></header>
                {column.cards.map((name, index) => <article key={name}>
                  <span className="oa-project-index">0{index + 1}</span>
                  <div><strong>{name}</strong><p>{index === 0 ? "브랜드 촬영 프로젝트" : "월간 콘텐츠 촬영"}</p></div>
                  <CalendarClock size={15}/>
                </article>)}
              </div>)}
            </div>
          </CategorySection>

          <CategorySection eyebrow="CUSTOMERS" title="최근 고객" action={<Link className="oa-text-link" href="/clients">고객 목록 열기</Link>}>
            <div className="oa-customer-table">
              <div className="oa-table-head"><span>고객</span><span>프로젝트</span><span>현재 단계</span><span>다음 액션</span></div>
              {[
                ["오블리브의원", "2026년 7월 브랜드 촬영", "고객 사진 셀렉", "셀렉 링크 재전송"],
                ["브라보마취통증의학과", "여름 홈페이지 촬영", "RAW 매칭", "매칭 작업 시작"],
                ["심포니성형외과", "의료진 프로필 촬영", "보정 진행", "1차 검수"],
              ].map(row => <div className="oa-table-row" key={row[0]}>{row.map((cell, index) => <span key={cell} className={index === 0 ? "is-strong" : ""}>{cell}</span>)}</div>)}
            </div>
          </CategorySection>
        </div>

        <aside className="oa-right-column" aria-label="CRM 보조 패널">
          <CategorySection eyebrow="ISSUES" title="지연 / 확인 필요" action={<StatusBadge tone="red">3건</StatusBadge>}>
            <div className="oa-issue-list">
              <div><AlertTriangle size={17}/><p><strong>셀렉 대기 3일 초과</strong><span>오블리브의원 · 고객 확인</span></p></div>
              <div><AlertTriangle size={17}/><p><strong>계약 서명 미완료</strong><span>온리원의원 · D-2</span></p></div>
              <div><AlertTriangle size={17}/><p><strong>보정 일정 확인</strong><span>심포니성형외과 · 오늘</span></p></div>
            </div>
          </CategorySection>

          <OliviaRecommendationPanel items={[
            "이번 주 촬영 5건의 준비 체크리스트를 확인하세요.",
            "서명 대기 계약 2건에 리마인드를 보내세요.",
            "후속 관리 대상 7건을 후기와 재계약으로 나눠보세요.",
          ]}/>

          <CategorySection eyebrow="CRM" title="빠른 이동">
            <div className="oa-link-list">
              <Link href="/clients"><UsersRound size={17}/><span>고객 목록</span></Link>
              <Link href="/admin/crm/workflows"><FolderKanban size={17}/><span>프로젝트 워크플로우</span></Link>
              <Link href="/workflow/tasks"><AlertTriangle size={17}/><span>확인 필요 업무</span></Link>
            </div>
          </CategorySection>
        </aside>
      </div>
    </div>
  );
}
