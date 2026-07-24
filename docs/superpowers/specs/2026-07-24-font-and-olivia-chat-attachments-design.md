# 전역 폰트 통일 및 Olivia Chat 첨부 설계

## 목적

Olivia 관리자 UI 전반에서 간헐적으로 달라 보이는 한글 폰트를 하나로 통일한다. 동시에 기존 Olivia Chat의 메시지, 도구 실행, 대화 저장 및 다중 기기 동기화를 유지하면서 사진과 파일을 첨부하고 Olivia가 지원 형식의 내용을 분석할 수 있게 한다.

## 범위

### 포함

- 저장소에 이미 포함된 `NanumSquare-Regular.ttf`의 로컬 웹폰트 적용
- 홈, 업무 브리핑, 마케팅 브리핑, Olivia Chat 및 일반 입력 UI의 폰트 상속 통일
- Olivia Chat의 파일 선택, 드래그앤드롭 및 클립보드 이미지 붙여넣기
- 업로드 대기 목록, 이미지 미리보기, 파일명, 용량, 상태, 삭제 및 재시도 UI
- 비공개 Supabase Storage 업로드
- 기존 `olivia_chat_messages.metadata`를 통한 첨부 참조 저장
- 이미지, PDF, TXT, CSV, XLSX 내용 분석
- 그 밖의 허용 파일 보관 및 다운로드
- 대화 재접속 및 다중 기기 폴링 시 첨부 복원

### 제외

- Google Drive와 Olivia 개인 채팅의 결합
- DOCX, ZIP 및 기타 바이너리 파일의 내용 추출
- 영상 및 오디오 전사
- 공개 파일 URL
- 기존 팀채팅 첨부 구조 변경

## 폰트 설계

`app/layout.tsx`에서 `next/font/local`로 `lib/olivia/fonts/NanumSquare-Regular.ttf`를 제공한다. 생성된 폰트 변수를 전역 `--font-sans`의 첫 번째 값으로 사용한다.

`body`, 관리자 셸, 홈 대시보드, 브리핑, Olivia Chat 및 폼 요소는 `var(--font-sans)` 또는 `inherit`를 사용한다. 코드 블록, 실행 타이머, 사용자가 프롬프터에서 직접 선택한 대본 글꼴처럼 의미가 있는 예외만 고정폭 또는 사용자 선택 글꼴을 유지한다.

외부 NanumSquare CDN 의존성은 제거한다. Google Fonts는 다른 기능에서 사용하는 선택 글꼴을 위해 유지한다.

## 첨부 데이터 모델

새 메시지 테이블은 만들지 않는다. 첨부 참조는 기존 `olivia_chat_messages.metadata`에 저장한다.

```ts
type OliviaChatAttachment = {
  id: string
  storagePath: string
  fileName: string
  mimeType: string
  sizeBytes: number
  kind: "image" | "pdf" | "text" | "spreadsheet" | "file"
  analysisStatus?: "supported" | "stored_only"
}
```

서명 URL과 브라우저 임시 미리보기 URL은 DB에 저장하지 않는다. 메시지 조회 시 서버가 짧은 만료 시간의 서명 URL을 생성한다.

## 저장 구조

`olivia-chat-attachments` 비공개 Storage 버킷을 additive migration으로 생성한다. 파일은 다음 경로에 저장한다.

```text
uploads/YYYY-MM-DD/<uuid>/<ascii-safe-file-name>
```

버킷은 service role만 직접 관리한다. 브라우저는 관리자 인증을 거친 업로드 세션 API가 발급한 일회성 서명 업로드 토큰으로 Storage에 직접 전송한다. service role 키는 클라이언트에 전달하지 않는다.

메시지당 최대 5개, 파일당 최대 10MB, 메시지 전체 최대 25MB로 제한한다. 서버는 파일명, 크기, MIME, 저장 경로 prefix 및 허용 형식을 다시 검증한다.

허용 형식은 다음으로 고정한다.

- 분석: JPEG, PNG, GIF, WebP, PDF, TXT, CSV, XLS, XLSX
- 보관만: DOC, DOCX, PPT, PPTX, ZIP
- 차단: 실행 파일, 스크립트, HTML, SVG 및 위 목록에 없는 형식

## API 설계

### 업로드 세션

`POST /api/olivia/attachments/upload-session`

입력:

- `fileName`
- `mimeType`
- `fileSize`

처리:

- 기존 관리자 인증 재사용
- 허용 형식과 용량 검증
- 안전한 Storage 경로 생성
- Supabase signed upload token 반환

### 메시지 조회 및 저장

기존 `/api/olivia/messages`를 확장한다.

- POST의 metadata sanitizer가 최대 5개의 첨부 참조만 허용한다.
- GET은 저장 경로를 검증한 뒤 서명 URL을 생성한다.
- 첨부 metadata가 없는 과거 메시지는 기존과 동일하게 처리한다.
- metadata 컬럼이 없는 오래된 DB fallback은 유지한다.
- 대화 초기화 시 기존 휴지통 복원을 위해 파일은 즉시 지우지 않는다. `lib/trash.ts`의 Olivia 대화 자산 목록에 첨부 경로를 포함해 영구 삭제 시에만 Storage 파일을 제거한다.

### Olivia 분석

기존 `POST /api/olivia` 요청에 첨부 참조 배열을 추가한다.

- 이미지: Anthropic image content block
- PDF: Anthropic document content block
- TXT/CSV: UTF-8 텍스트로 읽어 제한 길이만 포함
- XLSX: 기존 `xlsx` 의존성으로 각 시트의 표를 제한된 텍스트로 변환
- 기타: 파일명과 `stored_only` 상태만 모델 컨텍스트에 포함

첨부 다운로드와 추출은 독립 작업을 `Promise.all`로 병렬 실행한다. 파일 하나의 추출 실패가 전체 메시지 전송을 실패시키지 않으며, 모델에 실패 사실과 파일명을 전달한다.

## 클라이언트 흐름

1. 사용자가 파일 선택, 드롭 또는 이미지 붙여넣기를 한다.
2. 클라이언트가 개수와 용량을 즉시 검사한다.
3. 각 파일에 대해 업로드 세션을 요청한다.
4. 브라우저가 Supabase Storage로 직접 업로드한다.
5. 업로드 완료 항목만 전송 가능 첨부가 된다.
6. 텍스트가 없어도 첨부가 하나 이상 있으면 메시지를 전송할 수 있다.
7. 사용자 메시지를 즉시 목록에 추가하고 첨부 metadata와 함께 DB에 저장한다.
8. `/api/olivia`가 저장된 파일을 분석하고 기존 도구 및 응답 흐름을 그대로 처리한다.
9. 다른 기기에서는 메시지 폴링 시 서명 URL이 포함된 첨부를 표시한다.

## UI

입력창 왼쪽에 클립 버튼을 추가한다. 선택된 파일은 입력창 위의 좁은 첨부 트레이에 표시한다.

- 이미지는 정사각형 썸네일
- 일반 파일은 파일 아이콘, 축약 파일명, 용량
- 업로드 중 진행 상태
- 실패 시 오류와 재시도
- 전송 전 삭제

전송된 사용자 메시지에는 본문 위 또는 아래에 첨부 타일을 표시한다. 이미지는 클릭 시 새 탭으로 열고, 파일은 안전한 서명 링크로 다운로드한다. 기존 패널 크기 프리셋과 모바일 레이아웃을 유지하며 가로 스크롤을 만들지 않는다.

## 오류 처리

- 허용하지 않는 형식: 선택 즉시 인라인 오류
- 파일당 또는 전체 용량 초과: 업로드 전에 차단
- 업로드 세션 실패: 해당 항목만 실패 처리
- Storage 업로드 실패: 재시도 제공
- 분석 실패: 파일은 보관하고 답변에서 분석 불가를 안내
- 서명 URL 만료: 다음 메시지 조회 때 새 URL 발급
- 메시지 저장 실패: 기존 로컬 메시지 표시는 유지하되 첨부 이력 저장 실패를 표시

`alert`는 사용하지 않고 Olivia Chat 내부 인라인 상태를 사용한다.

## 보안

- 기존 middleware의 `/api/olivia` 관리자 보호를 재사용한다.
- 클라이언트가 보낸 Storage 경로를 신뢰하지 않는다.
- `uploads/` prefix, UUID 세그먼트, 허용 MIME 및 metadata 크기를 서버에서 검증한다.
- private bucket과 짧은 만료 서명 URL만 사용한다.
- service role 키는 서버에서만 사용한다.
- 모델에 전달하는 텍스트는 길이를 제한하고 바이너리 원문을 메시지 DB에 저장하지 않는다.

## 성능

- 파일 데이터는 API JSON에 base64로 넣지 않고 Storage로 직접 업로드한다.
- 첨부 전용 상태를 메시지 전체 상태와 분리한다.
- 브라우저 미리보기 URL은 필요할 때만 만들고 제거 시 revoke한다.
- 서버 파일 다운로드와 텍스트 추출은 병렬 수행한다.
- 과거 메시지 목록에는 첨부 원본이 아니라 metadata와 짧은 서명 URL만 전달한다.

## 테스트

단위 테스트:

- 파일 개수와 용량 제한
- 허용 MIME 및 확장자 검증
- 안전한 Storage 경로 검증
- 첨부 metadata sanitizer
- TXT/CSV/XLSX 추출 길이 제한
- stored-only 분류

통합 검증:

- 사진만 전송하고 Olivia가 내용을 설명
- PDF와 질문을 함께 전송
- XLSX 표 요약
- 지원하지 않는 파일의 저장 및 다운로드
- 업로드 실패 후 재시도
- 새로고침 후 첨부 복원
- 다른 기기 폴링에서 중복 없이 첨부 표시
- 기존 텍스트 채팅, 도구 승인, 텔레그램 메시지, 대화 초기화 회귀 확인

최종 명령:

```text
npm run typecheck
npm run test
npm run build
```

## 완료 조건

- 일반 UI 글꼴이 로컬 NanumSquare로 일관되게 표시된다.
- Olivia Chat에서 최대 5개 파일을 선택, 드롭 또는 붙여넣을 수 있다.
- 업로드 중, 완료, 실패 및 삭제 상태가 명확하다.
- 이미지, PDF, TXT, CSV, XLSX를 Olivia가 분석한다.
- 기타 허용 파일은 안전하게 보관하고 다시 다운로드할 수 있다.
- 새로고침과 다중 기기 동기화 후에도 첨부가 보인다.
- 기존 채팅 저장, 도구 실행, 인증 및 텔레그램 흐름이 깨지지 않는다.
- typecheck, test, build가 통과한다.
