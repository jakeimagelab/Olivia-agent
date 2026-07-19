/** @type {import('next').NextConfig} */
const nextConfig = {
  // Olivia 챗봇의 자유 형식 PDF 생성(generate_document)이 서버에서 한글 폰트 파일을 읽는데,
  // Vercel 서버리스 함수 트레이싱이 동적으로 안 읽히는 에셋을 놓칠 수 있어 명시적으로 포함시킨다.
  outputFileTracingIncludes: {
    "/api/olivia/**": ["./lib/olivia/fonts/**"],
  },
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
