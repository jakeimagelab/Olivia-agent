// PrompterClient는 client component라 여기서 route segment config(dynamic)를 못 준다.
// 이 서버 wrapper에서 force-dynamic을 걸어야 Vercel Edge가 이 페이지를 정적으로 캐싱하지
// 않는다 — 안 그러면 배포 직후에도 브라우저가 최대 5분간 예전 화면을 계속 받아볼 수 있다.
export const dynamic = "force-dynamic";

import PrompterClient from "./PrompterClient";

export default function PrompterPage() {
  return <PrompterClient />;
}
