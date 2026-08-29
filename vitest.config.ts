import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  // tsconfig.json은 jsx를 "preserve"로 둔다(Next.js의 SWC가 실제 변환을 담당) — esbuild가 이
  // 설정을 그대로 읽으면 .tsx 파일을 변환하지 않고 그대로 둬서 vite의 import 분석이 깨진다.
  // 테스트가 (렌더링은 안 해도) 모듈 그래프상 .tsx를 import하기만 해도 재현되므로 vitest
  // 변환 파이프라인에서만 명시적으로 override한다 — tsconfig/Next 빌드에는 영향 없음.
  oxc: { jsx: { runtime: "automatic" } },
  test: { environment: "node", include: ["tests/**/*.test.ts", "lib/**/*.test.ts"] },
});
