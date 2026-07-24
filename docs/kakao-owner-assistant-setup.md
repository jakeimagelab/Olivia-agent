# 대표자 전용 Olivia 카카오 연동 설정

이 문서는 코드 배포 후 실제 카카오 계정을 연결하기 위한 운영 절차다. 고객용 챗봇 계정은 연결하지 않는다.

## 1. 데이터베이스

Supabase SQL Editor에서 다음 마이그레이션을 한 번 실행한다.

`supabase/migrations/20260724_owner_assistant_channels.sql`

기존 Olivia, 팀채팅, 텔레그램 테이블은 삭제하지 않으며 신규 테이블과 컬럼만 추가한다.

## 2. 환경변수

`.env.local.example`의 대표자용 카카오·Google 항목을 Vercel 환경변수에 등록한다.

- `ASSISTANT_ENCRYPTION_KEY`: 최소 32바이트의 무작위 비밀 문자열
- `KAKAO_SKILL_SECRET`: 카카오 스킬 요청을 Olivia가 추가 검증하는 비밀값
- `KAKAO_BOT_ID`
- `KAKAO_REST_API_KEY`
- `KAKAO_ADMIN_KEY`
- `KAKAO_CHANNEL_PUBLIC_ID`
- `KAKAO_CALLBACK_ENABLED`: Callback API 승인 전에는 `false`
- `KAKAO_BRIEFING_EVENT_NAME`
- `KAKAO_NOTIFICATION_EVENT_NAME`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `NEXT_PUBLIC_BASE_URL`
- 기존 `CRON_SECRET`, Supabase, Anthropic, OpenAI 키

비밀값은 클라이언트 공개 환경변수로 만들지 않는다.

## 3. 카카오 개발자·오픈빌더

1. 카카오 디벨로퍼스에서 앱을 만들고 카카오톡 채널을 연결한다.
2. 카카오 i 오픈빌더에서 대표자 전용 챗봇을 생성한다.
3. 스킬 URL을 `https://배포주소/api/kakao/skill`로 등록한다.
4. 스킬 요청에 `x-olivia-kakao-skill-secret` 헤더와 `KAKAO_SKILL_SECRET` 값을 등록한다.
5. 채널 관계 웹훅 URL을 `https://배포주소/api/kakao/channel-webhook`로 등록한다.
6. Callback API는 사용 신청이 승인된 뒤 `KAKAO_CALLBACK_ENABLED=true`로 바꾼다.
7. Event API 사용 조건(비즈니스 채널·앱·봇·월렛)을 충족한 뒤 브리핑과 알림 이벤트를 등록한다.
8. 이벤트 템플릿은 `text`, `title`, `briefingId` 또는 `messageId` 파라미터를 받을 수 있게 만든다.

카카오 Callback URL은 짧게 만료되므로 Olivia는 즉시 접수 응답 후 작업 큐에서 처리한다. Event API가 준비되지 않아도 웹 대화, 조회, 승인, 브리핑 저장은 동작한다.

## 4. 대표자 계정 연결

1. Olivia 관리자에서 `/admin/kakao-assistant`를 연다.
2. `연결 코드 발급`을 누른다.
3. 대표자 카카오톡에서 `올리비아 연결 123456` 형식으로 입력한다.
4. 설정 화면에서 연결 상태와 마지막 수신 시간을 확인한다.
5. 다른 카카오 계정은 연결 코드를 모르면 사용할 수 없고, 활성 연결은 대표자 한 명만 유지된다.

## 5. Google 메일 연결

Google Cloud OAuth 앱의 승인된 리디렉션 URI에 다음 주소를 추가한다.

`https://배포주소/api/assistant/google/callback`

관리자 설정 화면에서 Google 연결을 누른다. Olivia는 Gmail 읽기와 초안 작성 범위만 요청하며 자동 발송하지 않는다.

## 6. 음성 입력

표준 카카오 스킬 payload가 음성 바이너리를 직접 전달하지 않으므로 1차 버전은 보안 녹음 링크를 사용한다. 카카오에서 “음성으로 입력”이라고 요청하고, 10분짜리 일회용 링크에서 녹음한다. 원본 음성은 DB나 스토리지에 저장하지 않고 STT 처리 후 즉시 폐기한다.

## 7. 점검 시나리오

1. `오늘 일정 알려줘` → 즉시 조회 결과
2. `내일 오전 10시에 테스트 회의 등록해줘` → 승인 버튼 → 일정 생성
3. 같은 시간 일정 재등록 → 충돌 안내
4. `내일 빈 시간 알려줘` → 09:00~18:00 기준 빈 시간
5. `안 읽은 중요한 메일 알려줘` → Gmail 검색
6. `오블리브 프로젝트 상태 알려줘` → 기존 프로젝트 조회
7. `음성으로 입력` → 일회용 녹음 링크
8. 관리자 설정의 시뮬레이터 → 같은 Core와 승인 상태 확인
9. 미등록 카카오 계정 → 연결 안내만 노출
10. 동일 웹훅 재전송 → 중복 실행 없이 접수 안내
