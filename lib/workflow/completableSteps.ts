import { ACTIVE_WORKFLOW_STEP_KEYS } from "@/lib/workflow";

// 상태 패널의 완료 처리와 워크플로 카탈로그가 어긋나지 않게 활성 12단계를 그대로 쓴다.
export const COMPLETABLE_STEP_KEYS = new Set<string>(ACTIVE_WORKFLOW_STEP_KEYS);
