# Olivia 문서 생성·내보내기 설계

작성일: 2026-07-19  
대상: Olivia Agent / Next.js 15 / Supabase PostgreSQL

## 1. 목표

올리비아 채팅에서 등록된 고객·견적·계약·콘티·워크플로우 데이터를 조회해 업무 문서를 생성하고 다운로드할 수 있게 한다. 기존 페이지의 다운로드 기능은 유지하며, 서버 공통 문서 엔진을 추가해 채팅과 향후 API에서 재사용한다.

대표 사용 예시:

- "라셀의원 최신 견적서를 PDF로 만들어줘."
- "오블리브의원 계약서를 PDF로 내려받게 해줘."
- "브라보의원 촬영 콘티를 PDF로 만들어줘."
- "전체 고객 목록을 엑셀로 정리해줘."
- "이번 달 프로젝트 현황을 CSV로 내보내줘."
- "이번 달 견적 매출을 엑셀로 만들어줘."

## 2. 1차 범위

### 생성 문서

| 문서 | 형식 | 데이터 원본 |
| --- | --- | --- |
| 견적서 | PDF | `quotes`, 연결 고객 |
| 계약서 | PDF | `contracts`, 연결 견적·고객 |
| 촬영 콘티 | PDF | `conti_saves` |
| 고객 목록 | XLSX, CSV | `clients` |
| 프로젝트 현황 | XLSX, CSV | `workflow_runs` |
| 견적·매출 정리 | XLSX, CSV | `quotes` |

### 제외 범위

- Word/DOCX와 한글/HWP 생성
- 생성 파일의 자동 이메일 발송
- 실제 NAS 파일 업로드·이동·삭제
- 전자서명 위변조 검증
- 브라우저 화면 캡처 방식의 PDF 생성

Word/HWP는 안정적인 서버 라이브러리와 템플릿이 확정된 후 별도 단계로 구현한다. NAS는 기존 공유 링크 저장 기능만 유지한다.

## 3. 구조

### 3.1 문서 레지스트리

`lib/olivia/documents/registry.ts`에서 지원 문서와 허용 형식을 정의한다.

```ts
type OliviaDocumentDefinition = {
  type: "quote" | "contract" | "conti" | "clients" | "projects" | "revenue";
  formats: Array<"pdf" | "xlsx" | "csv">;
  requiresTarget: boolean;
};
```

모델이 임의의 테이블·컬럼이나 파일 경로를 지정하지 못하게 한다.

### 3.2 데이터 조회

`lib/olivia/documents/dataResolver.ts`가 대상 문서의 원본 데이터를 조회한다.

- 명시적인 레코드 ID 우선
- 견적번호·고객명·콘티 제목 등 자연키 검색
- 정확히 일치하는 최신 레코드 우선
- 복수 후보가 모호하면 생성하지 않고 후보 반환
- 목록형 보고서는 기간·상태·고객 필터만 허용

금액과 개인정보는 문서 목적에 필요한 필드만 포함한다.

### 3.3 렌더러

```text
lib/olivia/documents/renderers/pdf.ts
lib/olivia/documents/renderers/spreadsheet.ts
lib/olivia/documents/renderers/csv.ts
```

PDF는 서버에서 데이터 기반으로 직접 그린다. 기존 브라우저용 `html2canvas`는 사용하지 않는다. 현재 저장소에는 배포 가능한 한글 폰트 파일이 없으므로 SIL Open Font License의 `NotoSansKR-Regular.ttf`와 라이선스 파일을 프로젝트 자산으로 추가하고 PDF에 임베딩한다. 폰트 로딩이 실패하면 깨진 문서를 반환하지 않고 PDF 기능을 실패 처리한다.

XLSX는 이미 설치된 `xlsx`를 동적 로드하거나 서버 전용 모듈에서 사용한다. CSV는 UTF-8 BOM과 RFC 4180 형식의 이스케이프를 적용해 Excel에서 한글이 정상 표시되게 한다.

### 3.4 파일 저장과 다운로드

생성 파일을 영구적인 공개 디렉터리에 쓰지 않는다. 1차에서는 다음 중 저장소 환경에 맞는 방식을 사용한다.

1. 작은 파일은 API가 바로 바이너리 응답
2. 채팅에서는 서명된 다운로드 토큰을 발급하고 다운로드 API가 요청 시 파일을 재생성

서버리스 파일 시스템에 영구 저장하지 않는다. 다운로드 토큰에는 문서 종류, 대상 ID, 형식, 만료시간만 포함하고 DB 접속정보나 개인정보를 넣지 않는다.

## 4. API

```text
GET  /api/olivia/documents/capabilities
POST /api/olivia/documents/prepare
GET  /api/olivia/documents/download?token=...
```

### prepare

입력:

```ts
{
  documentType: "quote" | "contract" | "conti" | "clients" | "projects" | "revenue";
  format: "pdf" | "xlsx" | "csv";
  target?: { id?: string; name?: string; naturalKey?: string };
  filters?: { dateFrom?: string; dateTo?: string; status?: string; clientId?: string };
}
```

반환:

```ts
{
  ok: true;
  fileName: string;
  downloadUrl: string;
  expiresAt: string;
  sourceSummary: string;
}
```

### download

- 토큰 서명과 만료시간 검증
- 동일한 허용 목록 검증 재실행
- DB에서 최신 데이터를 다시 조회
- 바이너리 응답과 안전한 `Content-Disposition` 반환
- `Cache-Control: private, no-store`

## 5. 올리비아 도구

신규 도구:

```text
generate_document
export_business_data
```

`generate_document`는 견적·계약·콘티 PDF에 사용한다. `export_business_data`는 고객·프로젝트·매출 XLSX/CSV에 사용한다.

문서 생성은 데이터 변경이나 외부 전송이 없으므로 자동 실행할 수 있다. 다만 대상이 모호하면 자동 실행하지 않고 대상 선택을 요청한다.

채팅 결과 카드:

- 문서 유형
- 고객·프로젝트 또는 조회 기간
- 데이터 기준 시각
- 파일 형식과 파일명
- `다운로드` 버튼
- `메일 초안에 첨부`는 표시하지 않음

## 6. 문서 구성

### 견적서 PDF

- 포토클리닉 로고·문서 제목
- 견적번호와 유효기간
- 고객·담당자 정보
- 촬영 항목·수량·단가·금액
- 공급가·할인·부가세·합계
- 계약금·잔금
- 비고

### 계약서 PDF

- 계약 기본정보
- 연결 견적 요약
- 고객·담당자
- 촬영일과 서비스 범위
- 계약 조건
- 서명 이미지는 존재할 때만 표시

### 콘티 PDF

- 병원·진료과·제목
- 촬영 장면 목록
- 준비 체크리스트
- 촬영 시간표
- 긴 표는 페이지를 자동 분할하고 표 머리글을 반복

### 업무 XLSX/CSV

- 고객 목록: 병원명, 담당자, 연락처, 진료과, 등록일
- 프로젝트: 고객, 프로젝트, 촬영일, 현재 단계, 다음 행동, 상태
- 매출: 견적번호, 고객, 견적일, 촬영일, 공급가, 할인, 부가세, 합계
- XLSX 첫 행 고정, 자동 필터, 날짜·금액 셀 형식 적용

## 7. 보안

- 서버에서만 Supabase service role 사용
- 다운로드 토큰은 HMAC 서명 및 짧은 만료시간 적용
- 임의 테이블·컬럼·파일 경로 입력 금지
- CSV formula injection 방지: `=`, `+`, `-`, `@`로 시작하는 사용자 문자열 이스케이프
- 파일명에서 경로 문자 제거
- 다운로드 응답은 private/no-store
- 문서 생성 로그에는 전체 이메일·전화번호·계약 내용을 복제하지 않음

## 8. 오류 처리

- 대상 없음: 검색 조건과 함께 명확한 안내
- 복수 후보: ID·제목·날짜 후보 반환
- 잘못된 형식 조합: capabilities 기준으로 차단
- 폰트 또는 렌더링 실패: 빈 파일을 반환하지 않고 JSON 오류 응답
- 테이블·컬럼 누락: 해당 문서만 사용 불가 처리
- 파일이 커질 경우 최대 행 수를 제한하고 안내

## 9. 테스트

### 단위 테스트

- 문서/형식 허용 목록
- 대상 해석과 복수 후보 처리
- 파일명 정리
- CSV 이스케이프와 formula injection 차단
- 날짜·금액 정규화
- 다운로드 토큰 서명·만료 검증

### 통합 테스트

1. 견적 ID → PDF 생성 → PDF 헤더 확인
2. 고객명 → 최신 계약 PDF 생성
3. 콘티 → 다중 섹션 PDF 생성
4. 고객 목록 → XLSX 시트와 행 확인
5. 기간 필터 → 매출 CSV 내용 확인
6. 변조 토큰 → 401
7. 만료 토큰 → 401

최종적으로 `npm run typecheck`, 전체 Vitest, `npm run build`가 성공해야 한다.

## 10. 완료 기준

- 올리비아가 견적·계약·콘티 PDF를 생성한다.
- 고객·프로젝트·매출 XLSX/CSV를 생성한다.
- DB에 등록된 데이터만 사용한다.
- 모호한 대상을 임의로 선택하지 않는다.
- 채팅에 만료되는 다운로드 링크를 표시한다.
- 한글과 금액·날짜가 정상 출력된다.
- 외부 발송이나 NAS 업로드를 자동 수행하지 않는다.
- 토큰 변조·CSV 수식 삽입·경로 조작이 차단된다.
- 타입 검사, 테스트, 빌드가 통과한다.
