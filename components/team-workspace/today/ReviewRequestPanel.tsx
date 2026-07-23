import type { TeamTask } from "../types";
import MyTaskList from "./MyTaskList";

export default function ReviewRequestPanel(props: { tasks: TeamTask[]; onOpen: (id: string) => void; onAction: (id: string, action: string) => void; busyId: string }) {
  return <MyTaskList {...props} title="확인 요청" empty="확인 요청된 업무가 없습니다." />;
}
