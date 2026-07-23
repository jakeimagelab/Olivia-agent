"use client";

const FILTERS = [
  ["mine", "내 업무"],
  ["all", "전체"],
  ["todo", "해야 함"],
  ["in_progress", "진행 중"],
  ["review", "확인 요청"],
  ["completed", "완료"],
  ["overdue", "지연"],
] as const;

export default function TaskFilters({
  filter,
  sort,
  onFilter,
  onSort,
}: {
  filter: string;
  sort: string;
  onFilter: (value: string) => void;
  onSort: (value: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {FILTERS.map(([value, label]) => (
          <button key={value} type="button" onClick={() => onFilter(value)} className={`team-button ${filter === value ? "" : "secondary"}`}>
            {label}
          </button>
        ))}
      </div>
      <select className="team-select" value={sort} onChange={(event) => onSort(event.target.value)} style={{ width: 145 }}>
        <option value="due">마감 임박순</option>
        <option value="priority">우선순위순</option>
        <option value="recent">최근 생성순</option>
      </select>
    </div>
  );
}
