import CategorySection from "@/components/admin/CategorySection";
import DocumentSearchPanel from "@/components/admin/DocumentSearchPanel";

// 전체보기(기능) 페이지 안에 끼어 있던 통합 문서함을 사이드바 독립 메뉴로 분리한 페이지다
// (전체보기 개편, 2026-08-31). DocumentSearchPanel/api/documents/search는 그대로 재사용 —
// 새 문서 시스템을 만들지 않는다.
export default function AdminDocumentsPage() {
  return (
    <div className="oa-page">
      <CategorySection
        eyebrow="DOCUMENT HUB"
        title="문서함"
        description="저장된 견적·계약·콘티·메모·갤러리를 고객명이나 문서명으로 한 번에 찾습니다."
      >
        <DocumentSearchPanel />
      </CategorySection>
    </div>
  );
}
