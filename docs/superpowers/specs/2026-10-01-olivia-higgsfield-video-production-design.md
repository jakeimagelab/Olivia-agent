# Olivia OS Higgsfield 영상제작 통합 설계

작성일: 2026-10-01  
상태: 구현 완료 — API 자격증명 등록 대기

## 목적

Olivia OS 안에 `/video-production` 영상제작 기능을 추가한다. 사용자는 Olivia 화면에서 이미지 또는 텍스트, 모델, 프롬프트, 모델별 옵션을 선택하고 영상 생성·상태 확인·취소·결과 확인을 수행한다.

Higgsfield의 생성 기능은 공식 `higgsfield-js` SDK와 `app-templates`의 Generation Core를 재사용한다. Higgsfield 원본 UI, 브랜드, 사이드바, 키 입력 UI는 사용하지 않는다.

## 확인한 공식 소스

제공된 압축 파일은 아래 경로로 원본 그대로 풀어 통합 기준 소스로 둔다. 이 폴더는 분석·업데이트 비교용 로컬 참조이며, 실제 제품은 필요한 공식 Generation Core만 `lib/higgsfield/vendor/template`에 보존한다.

- `external/higgsfield-js-main` — 공식 SDK V2. 서버 전용 `createHiggsfieldClient`, `subscribe`, 인증 형식, SDK 오류 타입을 제공한다.
- `external/app-templates-main` — 공식 모델 카탈로그, 옵션 schema, 입력 media 검증, request mapper, presigned upload, status, cancel, browser polling 패턴을 제공한다.

제공 압축 파일은 `/Users/jakembpm2/Downloads/`에도 보관되어 있다.

## 재사용 경계

| 분류 | 원본 | Olivia에서의 처리 |
| --- | --- | --- |
| 그대로 재사용 | SDK V2 `createHiggsfieldClient`·`subscribe` | 서버 Adapter가 `withPolling: false`로 generation request를 실행한다. |
| 그대로 재사용 | App Template의 catalog, model registry, `parse-settings`, media validation, `to-platform` | `lib/higgsfield/vendor/template`에 원본 단위로 보존한다. Olivia는 Adapter로만 호출한다. |
| 그대로 재사용 | App Template의 platform submit/status/cancel, upload contract·upload | 업로드 ticket, status, cancel은 이 공식 core를 감싸 사용한다. 직접 API fetch를 새로 구현하지 않는다. |
| Olivia Adapter | 환경변수 읽기, 오류 정규화, API request/response type | API 키 노출 방지 및 Olivia 상태 문구 변환만 담당한다. |
| 제거 | App Template의 Studio layout, sidebar, key cookie UI, Higgsfield branding | Olivia OS 네비게이션과 `VideoProductionWorkspace`로 대체한다. |

SDK V2는 `withPolling: false` 뒤의 공개 status/cancel 메서드를 제공하지 않는다. 따라서 generation request는 SDK V2가 수행하고, 비동기 status/cancel·presigned upload는 제공된 공식 app-template core를 사용한다. 이는 API 호출을 새로 재구현하지 않으면서 화면 이탈 뒤 복구와 취소를 지원하는 결합이다.

## 구조

```text
Olivia VideoProductionWorkspace
  -> /api/higgsfield/models
  -> /api/higgsfield/upload
  -> /api/higgsfield/generate
  -> /api/higgsfield/status
  -> /api/higgsfield/cancel
  -> lib/higgsfield/adapter
       -> official higgsfield-js SDK V2
       -> official app-template Generation Core
```

예정 파일 구성:

```text
app/video-production/page.tsx
app/api/higgsfield/models/route.ts
app/api/higgsfield/upload/route.ts
app/api/higgsfield/generate/route.ts
app/api/higgsfield/status/route.ts
app/api/higgsfield/cancel/route.ts

components/video-production/
  VideoProductionWorkspace.tsx
  VideoProductionWorkspace.module.css
  VideoModelSelector.tsx
  VideoInputPanel.tsx
  VideoPromptPanel.tsx
  VideoOptionsPanel.tsx
  VideoGenerationProgress.tsx
  VideoResultViewer.tsx
  VideoHistory.tsx

lib/higgsfield/
  adapter.ts
  config.ts
  types.ts
  normalize.ts
  history.ts
  vendor/template/...
```

기존 Olivia 네비게이션 등록부에는 `/video-production`과 `영상제작`을 추가한다. 사진 작업실, 콘티, 사진 보정 등 기존 route와 작업 로직은 변경하지 않는다.

## 인증과 보안

- 서버 환경변수: `HIGGSFIELD_API_CREDENTIALS=KEY_ID:KEY_SECRET`를 표준으로 사용한다. 공식 SDK의 `HF_CREDENTIALS`/`HF_KEY` 또는 `HF_API_KEY` + `HF_API_SECRET`도 호환한다.
- 공식 template 기준 base URL: `HF_API_BASE_URL=https://api.higgsfield.ai`
- 키는 서버 Adapter에서만 읽는다. `NEXT_PUBLIC_*`, localStorage, API 응답, 로그에는 포함하지 않는다.
- 모든 API route는 현행 Olivia 관리자 세션 규칙을 적용한다.
- 키가 없으면 모델·UI는 표시할 수 있지만 생성은 막고 `Higgsfield API 연결이 필요합니다.`를 표시한다.
- upload route는 파일 크기·MIME·모델 capability를 검증한 뒤 짧은 수명의 official presigned upload ticket만 반환한다.

## 생성 데이터 흐름

1. UI가 `/api/higgsfield/models`에서 공개 capability를 가져온다.
2. 사용자가 모델을 선택하면 catalog의 `mediaModes`, `roles`, `settings`로 가능한 입력과 옵션만 렌더링한다.
3. 입력 미디어가 필요하면 official upload core가 upload ticket을 만들고 브라우저는 원본 bytes를 해당 ticket의 storage로 업로드한다.
4. `/api/higgsfield/generate`가 template mapper로 model plane을 검증·정규화한 뒤 SDK V2 `subscribe(path, { input, withPolling: false })`를 호출한다.
5. 서버는 즉시 `requestId`와 실제 queued status만 반환한다.
6. 브라우저 polling은 official template의 4초 interval, 10분 deadline, 연속 오류 허용 규칙을 사용해 `/status`를 조회한다.
7. terminal status(`completed`, `failed`, `nsfw`, `canceled`)에서 history를 갱신한다. 완료 시 provider video URL을 player와 download action에 사용한다.
8. queued 상태에서만 official cancel core를 호출한다.

가짜 진행률은 사용하지 않는다. 실제 percent가 제공될 때만 percent bar를 표시하고, 그렇지 않으면 실제 상태 텍스트·spinner만 표시한다.

## UI

### 데스크톱

- 상단: `영상 생성 | 생성 기록`
- 좌측: 생성 방식, 모델 선택, 입력 이미지/영상/참조 미디어, 프롬프트, 모델 옵션, 생성 CTA
- 우측: 빈 Preview, 실제 생성 상태, 결과 video player와 다운로드·다시 생성·Reference 사용
- 하단: 최근 생성 기록 카드

Olivia의 밝은 배경, 연민트 navigation, 차콜 작업 패널, `#155855` 딥그린 CTA, 둥근 카드, 현행 typography를 사용한다. Higgsfield 원본 header·sidebar·brand UI는 포함하지 않는다.

### 모바일

설정, Preview, History를 단일 열로 배치한다. 모델 capability가 지원하지 않는 입력이나 옵션을 숨기며, 데스크톱 레이아웃을 축소해서 사용하지 않는다.

## 기록과 복구

V1 history는 versioned localStorage에 최소 데이터만 저장한다.

- request id
- 모델 id와 생성 방식
- prompt 일부
- 생성 시각
- 실제 status
- 결과 URL 및 thumbnail URL

페이지 새로고침 또는 재진입 시 terminal이 아닌 request id는 `/status`로 다시 조회한다. 결과 URL은 provider가 제공하는 URL을 그대로 사용하며, V1에서 별도 장기 저장을 약속하지 않는다.

## 오류 정규화

| 공급자/입력 오류 | UI 문구 |
| --- | --- |
| credentials 없음 | Higgsfield API 연결이 필요합니다. |
| 401/403 | Higgsfield 인증 또는 이용 권한을 확인해주세요. |
| upload 오류 | 입력 파일 업로드에 실패했습니다. |
| validation 오류 | 선택한 모델의 생성 옵션을 확인해주세요. |
| rate/credit 제한 | Higgsfield 사용량 또는 요청 제한을 확인해주세요. |
| failed/nsfw/canceled | 영상 생성이 완료되지 않았습니다. |

원문 오류는 접힌 `상세 오류 보기`에서만 표시한다.

## 테스트와 완료 기준

1. `/video-production` route와 전체기능·Olivia OS 메뉴 등록을 검증한다.
2. model catalog가 capability별 입력·옵션을 정확히 노출하는지 단위 테스트한다.
3. 키 없음, invalid request, queued response, terminal status, cancel, provider 오류를 API route 테스트한다.
4. versioned history의 저장·복구·in-progress status 재조회와 polling terminal transition을 테스트한다.
5. Playwright로 desktop/mobile 진입, 모델 전환, 키 없음 empty state, history 복구를 검증한다.
6. API 키 등록 후 실제 image-to-video generation, polling, player, download, cancel을 수동으로 검증한다.
7. `npm run typecheck`, `npm test`, `npm run build`를 실행한다.

## 비범위

- 브라우저에서 API 키 입력·저장
- Higgsfield API를 Olivia가 임의 fetch로 새로 구현
- 모델 목록을 손으로 중복 관리
- 가짜 생성 percentage
- Higgsfield 원본 Studio UI, iframe, 별도 앱 창
- cross-device durable generation history 및 결과 media archival
- 이번 V1의 Olivia AI prompt generation
