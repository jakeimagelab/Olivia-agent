/** @type {import('next').NextConfig} */
const nextConfig = {
  // Olivia 챗봇의 자유 형식 PDF 생성(generate_document)이 서버에서 한글 폰트 파일을 읽는데,
  // Vercel 서버리스 함수 트레이싱이 동적으로 안 읽히는 에셋을 놓칠 수 있어 명시적으로 포함시킨다.
  outputFileTracingIncludes: {
    "/api/olivia/**": ["./lib/olivia/fonts/**"],
  },
  // Quote 서버사이드 프리뷰 렌더링(app/api/quotes/[id]/render)이 @sparticuz/chromium의 네이티브
  // 바이너리를 실행 시점에 그대로 실행해야 해서, Next가 번들링을 시도하지 않게 external로 둔다.
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com"
      }
    ]
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
