# 비용 청구 동의서 전자서명 설계

## 목표

기존 고객, 계약서, 견적서 데이터를 이용해 청구 내용을 작성하고 고객의 본인 확인, 내용 확인, 동의 서명을 받은 뒤 위·변조 여부를 검증할 수 있는 PDF와 감사 기록을 남긴다.

이 기능은 단순 결제 요청이 아니라 다음 증거 사슬을 서버에서 일관되게 보존하는 것이 핵심이다.

- 누가 어떤 문서를 언제 받았는지
- 인증된 연락처가 무엇인지
- 고객이 어떤 고정된 청구 내용에 동의했는지
- 고객이 어떤 이름과 서명으로 동의했는지
- 생성된 PDF가 이후 변경되지 않았는지
- 발송, 열람, 인증, 서명, 이의, 다운로드가 어떤 순서로 일어났는지

운영 DB는 이 작업에서 직접 변경하지 않는다. 기존 마이그레이션은 수정하지 않고 신규 마이그레이션만 추가한다.

## 확정한 접근

`billing-consent`를 초상권 동의서와 분리된 독립 도메인으로 구현한다. 기존 초상권 동의 기능의 공개 토큰, 서명 패드, 사용자 정보 수집 방식은 참고하되, 클라이언트에서 PDF를 만드는 방식과 서명 이미지를 DB에 직접 보관하는 방식은 재사용하지 않는다.

관리자가 고객·계약·견적 데이터를 불러온 뒤 발송하면 해당 시점의 내용을 청구 문서 스냅샷으로 고정한다. 고객 인증, 동의, PDF 생성, 해시 계산, 비공개 Storage 저장, 이벤트 기록은 모두 서버가 수행한다.

초기 인증 채널은 현재 저장소에 이미 구성된 SMTP 이메일 OTP를 기본으로 한다. SMS는 같은 인증 채널 인터페이스를 사용하되 공급자와 환경변수가 설정되기 전에는 관리자 설정에서 `설정 필요`로 비활성화한다.

## 사용자 흐름

### 관리자 작성

진입점은 두 곳이다.

- 고객 상세의 `비용 청구`
- 촬영 건의 계약·견적 상세의 `비용 청구`

연결된 화면에서 고객, 계약서, 견적서 정보를 기본값으로 채우되 청구서에 저장되는 값은 원본 레코드 참조가 아니라 발송 시점의 스냅샷이다. 원본 고객명, 계약명, 견적 금액이 나중에 바뀌어도 이미 발송하거나 서명한 문서는 바뀌지 않는다.

작성 항목은 다음과 같다.

- 고객
- 연결 계약서 또는 견적서(선택)
- 청구 항목: 이름, 수량, 단가, 금액
- 공급가액, 부가세 10%, 합계
- 청구 사유
- 계약 조항 문구
- 고객 요청 캡처 이미지
- 입금 계좌
- 입금 기한
- 링크 만료 기간, 기본 14일
- 인증 채널

금액은 원 단위 정수로 계산한다. 항목 금액은 `수량 × 단가`이며 공급가액은 항목 합계, 부가세는 공급가액의 10%를 원 단위 반올림하고 총액은 공급가액과 부가세의 합으로 계산한다. 서버가 다시 계산한 값만 저장하며 클라이언트가 보낸 합계는 신뢰하지 않는다.

`미리보기`는 저장된 초안 스냅샷으로 문서를 보여준다. `고객에게 보내기`를 누르면 추측할 수 없는 토큰을 만들고 원문은 한 번만 반환하며 DB에는 SHA-256 해시만 저장한다. 발송 후 내용 변경은 허용하지 않는다. 수정이 필요하면 기존 문서를 취소하고 새 버전을 만든다.

발송 완료 화면은 다음을 제공한다.

- 고객 링크 복사
- 카카오톡·문자용 안내 문구 복사
- 이메일 발송 상태
- 만료일
- 문서 ID

### 고객 확인과 서명

고객 화면은 모바일 우선 4단계로 구성한다.

1. 본인 확인
2. 청구 내용 확인
3. 동의 서명 또는 이의 제출
4. 완료 및 PDF 다운로드

인증 전에는 고객 표시명과 총액, 문서 발송 업체, 만료 여부만 보여준다. 청구 항목, 사유, 근거, 계좌 등 상세 정보는 인증 성공 후에만 반환한다.

고객은 이메일 주소 또는 휴대폰 번호를 입력한다. 서버는 해당 문서에 고정된 수신 연락처와 정규화해 비교하며 일치할 때만 OTP를 발송한다. 존재 여부를 추측하지 못하도록 불일치 응답도 일반적인 안내 문구를 사용한다.

OTP는 6자리, 5분 유효이며 원문은 저장하지 않는다. 5회 실패하면 요청 범위를 15분 잠근다. 인증 성공 후에는 문서 ID, 인증 채널, 인증 대상 버전, 만료 시각을 담은 서명된 httpOnly 쿠키를 발급한다.

청구 상세는 전체 내용을 스크롤한 뒤 동의 영역이 활성화된다. 스크롤 완료는 UI 개방 조건이며 법적 동의 자체로 간주하지 않는다. 증거에는 고객이 두 확인란을 직접 체크하고 최종 서명 요청을 보낸 사실을 기록한다.

- `위 청구 내용을 확인했습니다`
- `위 금액을 지급하는 데 동의합니다`

서명은 손가락·마우스 캔버스 서명과 서명자 이름을 함께 받는다. 빈 서명, 빈 이름, 체크되지 않은 동의는 서버가 거절한다.

고객이 동의하지 않으면 `이의 있음`을 선택해 필수 사유를 제출한다. 이 경우 서명 동의로 처리하지 않고 상태를 `disputed`로 변경하며 관리자에게 알린다.

### 서명 완료

서명 트랜잭션은 다음 순서로 수행한다.

1. 토큰, 만료, 취소 여부와 인증 쿠키를 재검증한다.
2. 현재 상태가 서명 가능한 상태인지 확인한다.
3. 고정 문서 스냅샷과 동의값, 서명 이미지 해시, 인증 정보를 원자적으로 기록한다.
4. 서버가 서명 기록 페이지를 포함한 PDF를 생성한다.
5. PDF 파일 SHA-256을 계산한다.
6. PDF와 서명 이미지를 비공개 Storage에 저장한다.
7. 경로와 해시를 DB에 고정하고 `signed` 이벤트를 남긴다.
8. 고객과 관리자에게 PDF를 첨부해 이메일을 발송한다.

메일 전송 실패는 이미 성립된 서명을 되돌리지 않는다. `email_failed` 이벤트를 남기고 관리자 상세에서 다시 보낼 수 있게 한다.

## PDF와 해시

권위 있는 PDF는 브라우저에서 만들지 않고 서버의 기존 Chromium PDF 렌더러 구조를 재사용한다. 한국어 폰트와 표 레이아웃을 고정하며 서명 기록 페이지를 마지막에 넣는다.

PDF 내용은 다음과 같다.

- 업체 정보와 문서 ID
- 고객 표시명
- 청구 항목표와 금액
- 청구 사유
- 근거 문구와 첨부 이미지
- 입금 정보와 기한
- 동의 문구
- 서명 이미지와 서명자 이름
- 인증 연락처 마스킹 값
- 동의 시각(KST, 초 단위)
- IP와 브라우저·기기 요약
- 문서 증거 SHA-256

완성된 PDF 파일은 자기 자신의 최종 SHA-256 값을 내부에 포함할 수 없다. 해시 문자열을 PDF에 넣는 순간 PDF 바이트가 달라지기 때문이다. 따라서 두 값을 명확히 분리한다.

- `document_evidence_sha256`: 고정된 문서 JSON, 서명 이미지 해시, 인증·동의 기록으로 만든 정규 증거 해시. PDF 하단과 서명 기록 페이지에 표시한다.
- `pdf_sha256`: 완성된 PDF 파일 전체 바이트의 SHA-256. DB에 저장하고 위변조 확인 페이지에서 업로드한 파일과 비교한다.

PDF에는 문서 ID와 증거 해시를 표시하고, 최종 PDF 파일 해시는 DB와 검증 결과에 사용한다. 두 값의 의미를 PDF와 관리자 화면에서 구분해 표시한다.

## 위변조 확인

공개 경로 `/verify/[documentId]`는 파일 입력만 제공한다. 브라우저가 선택한 PDF를 서버에 보내면 서버가 스트리밍으로 SHA-256을 계산해 저장된 `pdf_sha256`과 상수 시간 비교를 수행한다.

결과는 다음 정보만 반환한다.

- 문서 ID
- `원본과 같음` 또는 `원본과 다름`
- 검증 시각

고객명, 금액, 연락처, 서명, 문서 URL은 노출하지 않는다. 업로드한 검증 파일은 저장하지 않는다.

## 데이터 모델

신규 마이그레이션 `supabase/migrations/20261119_billing_consents.sql`을 추가한다.

### billing_consents

요청된 필드에 증거 보존과 버전 관리에 필요한 필드를 더한다.

- `id uuid primary key`
- `document_id text unique not null`: 공개 검증용 추측 방지 식별자
- `customer_id uuid not null`
- `contract_id uuid null`
- `quote_id uuid null`
- `supersedes_id uuid null`: 이전 버전 참조
- `version integer not null default 1`
- `customer_snapshot jsonb not null`
- `issuer_snapshot jsonb not null`
- `contract_snapshot jsonb null`
- `items jsonb not null`
- `subtotal bigint not null`
- `vat bigint not null`
- `total bigint not null`
- `reason text not null default ''`
- `evidence jsonb not null default '[]'`
- `bank_info text not null default ''`
- `due_date date null`
- `status text not null`
- `token_hash text unique null`
- `expires_at timestamptz null`
- `verification_channel text not null default 'email'`
- `verification_target_masked text null`
- `signer_name text null`
- `signed_at timestamptz null`
- `signed_ip inet null`
- `signed_ua text null`
- `signature_path text null`
- `document_evidence_sha256 text null`
- `pdf_path text null`
- `pdf_sha256 text null`
- `objection_reason text null`
- `disputed_at timestamptz null`
- `canceled_at timestamptz null`
- `payment_confirmed_at timestamptz null`
- `created_by uuid null`
- `created_at timestamptz not null default now()`

상태 값은 `draft | sent | viewed | signed | disputed | expired | canceled`로 제한한다. `payment_confirmed_at`은 서명 상태와 별개의 업무 완료 표시다.

`sent` 이후 청구 스냅샷, 금액, 근거, 계좌, 기한, 토큰 해시를 바꾸지 못하게 DB 트리거로 보호한다. `signed` 이후에는 서명·PDF·해시·인증 증거 필드도 바꾸지 못한다. 관리자가 할 수 있는 변경은 취소, 이메일 재전송 이벤트, 입금 확인처럼 문서 내용과 무관한 상태 전이뿐이다.

### billing_consent_events

이벤트는 append-only다.

- `id uuid primary key`
- `consent_id uuid not null`
- `type text not null`
- `at timestamptz not null default now()`
- `ip inet null`
- `ua text null`
- `meta jsonb not null default '{}'`

이벤트 유형은 `created`, `previewed`, `sent`, `email_sent`, `email_failed`, `viewed`, `otp_requested`, `otp_failed`, `otp_verified`, `signed`, `disputed`, `pdf_downloaded`, `resent`, `canceled`, `payment_confirmed`, `verified_match`, `verified_mismatch`를 사용한다.

이 테이블은 일반 update/delete를 금지하고 서비스 역할도 애플리케이션에서는 insert/select만 사용한다.

### billing_consent_auth_challenges

OTP 원문과 공개 인증 상태를 청구 문서에서 분리한다.

- `id uuid primary key`
- `consent_id uuid not null`
- `channel text not null`
- `target_hash text not null`
- `code_hash text not null`
- `expires_at timestamptz not null`
- `attempts integer not null default 0`
- `locked_until timestamptz null`
- `verified_at timestamptz null`
- `created_at timestamptz not null default now()`

새 코드를 발급하면 이전 미사용 코드를 무효화한다. OTP 해시는 서버 비밀을 포함한 HMAC으로 만들며 숫자 100만 개를 오프라인 대입해서 복구할 수 없게 한다.

### RLS와 Storage

세 테이블 모두 RLS를 활성화하고 `anon`, `authenticated`의 직접 접근 권한을 회수한다. 브라우저는 Supabase에 직접 접근하지 않고 관리자·공개 API만 사용한다.

비공개 `billing-consents` 버킷을 만든다.

- `billing-consents/{consentId}/evidence/...`
- `billing-consents/{consentId}/signature.png`
- `billing-consents/{consentId}/signed-v{version}.pdf`

다운로드는 권한을 확인한 서버가 짧은 signed URL을 발급하거나 서버가 스트리밍한다. 관리자와 인증 완료 고객만 접근할 수 있다.

## API 경계

### 관리자 API

- `GET /api/billing-consents`: 목록과 필터
- `POST /api/billing-consents`: 초안 생성
- `GET /api/billing-consents/[id]`: 상세와 이벤트
- `PATCH /api/billing-consents/[id]`: 발송 전 초안 수정, 취소, 입금 확인
- `POST /api/billing-consents/[id]/preview`: 서버 미리보기 데이터 또는 PDF
- `POST /api/billing-consents/[id]/send`: 스냅샷 고정과 링크 발급
- `POST /api/billing-consents/[id]/resend`: 기존 링크 재안내
- `GET /api/billing-consents/[id]/pdf`: 관리자 PDF 다운로드
- `POST /api/billing-consents/[id]/email`: PDF 이메일 재전송

모든 관리자 API는 기존 관리자 세션을 확인한다.

### 공개 고객 API

- `GET /api/billing-consent/public/[token]`: 인증 전 최소 정보와 상태
- `POST /api/billing-consent/public/[token]/otp/request`
- `POST /api/billing-consent/public/[token]/otp/verify`
- `GET /api/billing-consent/public/[token]/document`: 인증 후 상세
- `POST /api/billing-consent/public/[token]/sign`
- `POST /api/billing-consent/public/[token]/dispute`
- `GET /api/billing-consent/public/[token]/pdf`

공개 API는 기존 `consume_select_public_rate_limit` 패턴을 재사용하되 토큰 해시, 작업 종류, IP를 키로 사용한다. OTP 요청, 검증, 서명, 이의 제출에는 작업별 한도를 둔다.

공개 API는 토큰 원문, OTP, 전체 연락처, Storage 경로를 로그에 남기지 않는다.

### 검증 API

- `POST /api/verify/[documentId]`: PDF 바이트 해시 비교

문서 ID가 없거나 일치하지 않아도 개인 정보는 반환하지 않는다.

## UI 구조

`olivia-workspace-ui`의 밝은 문서형 화면 규칙을 적용한다. 배경은 `#FDFCFA`, 카드와 표는 흰색, 선은 기존 `--ui2-line`, 주요 상태는 `--ui2-green`, 화면의 유일한 채운 실행 버튼은 `--ui2-run`을 사용한다. 글자 굵기는 600을 넘기지 않는다.

### 관리자 목록

- 상단: `비용 청구 동의서`, 검색, 상태 필터, `새 청구서`
- 목록: 상태, 고객, 총액, 연결 문서, 발송일, 만료일, 서명일, 입금 확인
- 상태 칩: 작성 중, 발송, 열람, 서명 완료, 이의, 만료, 취소
- 행 선택 시 상세로 이동

### 관리자 작성

두 칸 와이드 레이아웃을 사용한다.

- 왼쪽: 고객·연결 문서·항목·사유·근거·계좌·기한 입력
- 오른쪽: 고정 미리보기와 합계
- 하단: `미리보기` 보조 버튼, `고객에게 보내기` 하나만 채운 주 실행 버튼

근거 이미지는 업로드 즉시 비공개 임시 경로에 두고 초안 삭제 시 정리한다. 항목 표는 키보드 입력과 모바일 가로 스크롤을 지원한다.

### 관리자 상세

- 문서 요약과 상태
- PDF 다운로드
- 링크·안내 문구 복사
- 재발송, 취소, 입금 확인
- 이벤트 로그 타임라인
- 이의 내용
- 이메일 실패와 재시도 상태

서명 완료 문서에는 편집 UI를 표시하지 않는다.

### 고객 모바일

- 공통 헤더: 업체명, 문서 ID 일부, 단계 표시
- OTP 입력은 기존 `PersonSelectLogin`의 밀도와 입력 피드백을 재사용
- 청구 내용은 모바일 표 대신 항목 카드와 합계 표를 함께 제공
- 근거 이미지는 눌러 확대
- 서명 패드는 최소 높이 180px, 지우기 버튼 제공
- 하단 safe-area 고정 영역에 현재 단계의 실행 버튼 하나만 표시
- 인증·서명 실패 이유와 재시도 가능 시각을 버튼 바로 위에 표시

### 검증 페이지

중앙 카드 하나에 문서 ID, PDF 선택, `위변조 확인` 버튼, 결과를 표시한다. 일치하면 초록, 불일치하면 빨간 상태를 사용하며 개인 정보나 원본 PDF 링크는 표시하지 않는다.

## 오류와 동시성

- 만료 링크: 410과 만료 안내
- 취소 링크: 410과 취소 안내
- 잘못된 토큰: 404와 일반 안내
- OTP 불일치: 남은 횟수를 과도하게 노출하지 않는 일반 문구
- OTP 잠금: 429와 다시 시도 가능한 시각
- 중복 서명 요청: 최초 성공 결과를 멱등하게 반환
- 서명 중 PDF 생성 실패: 서명 증거를 `signing` 상태로 유지하지 않고 트랜잭션과 작업 상태를 분리해 재시도 가능하게 함
- Storage 저장 실패: DB에 완성 상태를 기록하지 않음
- 이메일 실패: 서명은 유지하고 이벤트와 관리자 재전송 기능 제공
- 동시에 두 번 발송: idempotency key와 상태 조건부 update로 토큰 하나만 유효하게 함

서명 PDF 생성은 요청 안에서 완료하는 것을 기본으로 하되 실행 시간이 긴 환경에서는 기존 원격 작업이 아니라 서버 작업 상태를 둬 재시도할 수 있게 모듈을 분리한다. 고객 완료 화면은 PDF 준비 중 상태를 폴링할 수 있다.

## 알림

- 발송: 고객 OTP·링크 이메일
- 서명 완료: 고객과 관리자에게 PDF 사본
- 이의 제출: 관리자 이메일과 기존 Olivia 알림 수단
- 이메일 실패: 관리자 상세 경고

메일 주소와 인증 코드는 서버 로그에 원문으로 남기지 않는다.

## 테스트

### 순수 함수

- 항목 합계, 부가세 반올림, 총액
- 토큰 만료와 상태 계산
- OTP 5분 만료
- OTP 5회 실패 후 15분 잠금
- 동일 OTP 요청의 멱등 처리
- 문서 증거 JSON 정규화와 해시 안정성
- PDF SHA-256 일치·불일치

### API와 DB

- 인증 전 상세 정보 차단
- 토큰 원문이 DB에 저장되지 않음
- OTP 원문이 DB에 저장되지 않음
- 발송 후 청구 스냅샷 수정 거절
- 서명 후 서명·PDF·해시 수정 거절
- 동일 서명 요청 두 번이 문서 하나와 이벤트 하나만 생성
- 이의 후 서명 불가
- 서명 완료 후 인증 고객과 관리자만 PDF 접근
- 공개 API rate limit
- 검증 API가 개인 정보를 반환하지 않음

### UI

- 관리자 작성 → 미리보기 → 발송
- 모바일 이메일 인증 → 전체 스크롤 → 체크 두 개 → 서명 → 완료
- 이의 제출
- 서명 패드 빈 값 거절
- 모바일 safe-area에서 버튼이 가려지지 않음
- 관리자 이벤트 타임라인과 입금 확인
- PDF 검증 일치와 불일치 화면

### 실제 확인 캡처

개발 환경의 테스트 고객과 메일 수신 주소로 다음 캡처를 남긴다.

- 관리자 청구서 작성과 미리보기
- 모바일 OTP 인증
- 모바일 청구 내용과 서명
- 완료 화면과 PDF 다운로드
- 서명 기록 페이지가 포함된 PDF 렌더
- 원본 PDF 검증 성공
- 한 바이트가 바뀐 PDF 검증 실패
- 관리자 상세 이벤트 타임라인

캡처 없이 완료로 보고하지 않는다.

마지막으로 `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`과 관련 Vitest를 실행한다.

## 범위 밖

- 운영 DB 직접 적용
- 실제 SMS 공급자 계약과 키 발급
- 전자세금계산서 발행
- 카드·계좌 결제 처리
- 서명 완료 문서의 내용 수정
- 검증 페이지의 개인 정보 공개
- 기존 초상권 동의서 데이터 마이그레이션
