export default function OliviaApprovalSummary({ actions }: { actions: any[] }) {
  const pending = actions.filter((action) => action.status === "waiting_approval");
  return <div className="olivia-approval-summary"><span>승인 대기</span><strong>{pending.length}</strong><small>고객 전달과 단계 이동은 승인 후 실행됩니다.</small></div>;
}
