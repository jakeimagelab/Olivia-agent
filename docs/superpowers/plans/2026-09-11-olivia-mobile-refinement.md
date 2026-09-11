# Olivia Mobile OS 개선 구현 계획

1. 모바일 Home Header만 포토클리닉 마크·딥그린 Surface로 변경하고, 기능별 Header에는 로고를 넣지 않는다.
2. Quick Menu와 Bottom Navigation을 Desktop `AppIcon`·`CalendarAppIcon`으로 교체하고 하단 바를 오렌지로 변경한다.
3. 각 기능 Header 제목을 16px로 조정하고 화면별 Subtitle을 연결한다.
4. Desktop Quote/Contract 문서 Renderer를 공용화하고 Mobile Preview가 같은 Renderer를 사용하게 한다.
5. 기존 Olivia Conversation Guide를 모바일 채팅 오른쪽 Rail과 탭 기반 패널로 연결한다.
6. 메시지 본문 선택 CSS와 Desktop 창 상호작용 정리를 보강한다.
7. 단위 테스트, TypeScript, 대상 ESLint, 전체 테스트와 프로덕션 빌드를 실행한다.
8. Playwright로 네 가지 iPhone viewport와 1440px Desktop 회귀를 확인한다.
9. 변경사항만 커밋·푸시하고 Vercel 배포 성공과 운영 응답을 확인한다.
