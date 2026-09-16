# Olivia OS 2.0 — 사진분류 AI를 Hermes Brain 중심 구조로 전환: 개발 완료 보고서

작성일: 2026-09-17

---

## 1. 기존 구조

`remotePhotoSortRunner.ts`의 `classifyPrecise()`가 AI를 호출하는 지점은 정확히 3곳뿐이었다:
`analyzeFolderPattern()`(폴더당 1회), `scanScenePurposes()`(8장 이상 세그먼트마다), `analyzeSceneBoundary()`
(로컬 필터를 통과한 경계마다). 나머지(candidate-builder/boundary-score/boundary-stabilizer/scene-builder)는
이미 순수 로컬 함수였고, `SceneFrameAnalysis`는 이미 "관찰 결과" 모양이었으며 최종 split/merge/review는
이미 `decideBoundary()`(boundary-score.ts)가 결정하고 있었다. 즉 요청서가 지적한 "OpenAI가 Brain" 문제는
이 3개 함수(sceneAi.ts 2개 + folderPatternAi.ts 1개)에 한정된 것이었다.

## 2. 변경 구조

```
[변경 전]                                    [변경 후, 플래그 off(기본값)]
classifyPrecise → sceneAi.ts → OpenAI 직접     classifyPrecise → localPhotoBrain → sceneAi.ts → OpenAI (동일)

[변경 후, OLIVIA_PHOTO_HERMES_BRAIN=1]
classifyPrecise → hermesPhotoBrain.analyzeBoundary
  → localPhotoBrain.analyzeBoundary(Vision Tool, 변경 없음) → SceneFrameAnalysis
  → confidence < 0.75 인 경우만 → Hermes에게 관찰 결과+판단기준 제시 → 보정 JSON(선택)
  → 화이트리스트 필드만 병합 → decideBoundary()(변경 없음)가 최종 split/merge/review 결정
```

## 3. 새로 만든 파일

- `lib/photo-classifier/brain/types.ts` — `PhotoSceneBrain` 인터페이스(기존 AiAdapter의 4개 슬롯을 `typeof` 그대로 승격)
- `lib/photo-classifier/brain/localPhotoBrain.ts` — 기존 함수를 그대로 가리키는 기본 구현체
- `lib/photo-classifier/brain/hermesPhotoBrain.ts` — Hermes 보정 로직(아래 5번 참고)
- `lib/photo-classifier/brain/index.ts` — `OLIVIA_PHOTO_HERMES_BRAIN` 플래그로 선택
- `tests/photoSceneBrain.test.ts`, `tests/photoLocalBrainIdentity.test.ts`
- 이 보고서

## 4. 수정 파일

- `lib/photo-classifier/node/remotePhotoSortRunner.ts` — `defaultAi` 구성을 `resolvePhotoSceneBrain()` 경유로 교체(4줄). `profile`(Anthropic)은 무관하므로 그대로.
- `lib/photo-classifier/server/sceneAi.ts` — 헤더에 "Vision observation adapter" 문서화 주석만 추가. **로직 변경 0줄.**
- `.env.local.example` — `OLIVIA_PHOTO_HERMES_BRAIN=0` 문서화

## 5. Hermes가 판단하는 부분

`analyzeBoundary()`에서만, 그것도 **Vision Tool 결과의 confidence < 0.75일 때만** 개입한다. Hermes에게
이미지는 보내지 않고(§2 전제) Vision 관찰 결과(JSON) + 고정 판단 기준(주체 의료진/장비/장소/촬영목적
변경 vs 구도/포즈/인원수 변화)을 텍스트로 제시해 보정을 요청한다. 반환값 중 `primaryClinicianChanged`,
`roomChanged`, `primaryMedicalDeviceChanged`, `sceneTypeChanged`와 그 confidence, `reasons`만 화이트리스트로
반영하고 타입이 안 맞으면(§ 테스트로 검증: `confidence:42`, `primaryClinicianChanged:"yes"`) 무시한다.

## 6. Deterministic 코드가 담당하는 부분 (변경 없음)

`candidate-builder.ts`(경계 후보 생성), `boundary-score.ts`의 `decideBoundary`/`forcedReasons`/
`calculateBoundaryScore`(최종 split/merge/review, 강제분리 임계값), `boundary-stabilizer.ts`(짧은 Scene
병합), `scene-builder.ts`(폴더명), `classification-settings.ts`(5분 hard split 등 시간대). **이 6개 파일은
이번 작업에서 한 줄도 바꾸지 않았다** — `tests/photoClassificationHybrid.test.ts`(기존, 27개 테스트)가
그대로 통과하는 것으로 확인.

## 7. OpenAI Vision이 담당하는 부분

`sceneAi.ts`의 `analyzeSceneBoundary`/`scanScenePurposes`/`analyzePhotoScene`, `folderPatternAi.ts`의
`analyzeFolderPattern` — 함수 시그니처·로직 전부 그대로. Hermes 경로에서도 1차 관찰은 항상 이 함수들이
만든다(§2 "Vision Tool" 역할).

## 8. Fallback 흐름

```
Vision(OpenAI) 호출 (항상 먼저, 변경 없음)
  ↓ 성공, confidence >= 0.75
그대로 반환 (Hermes 호출 안 함 — 성능 예산 보호)
  ↓ confidence < 0.75 이고 OLIVIA_PHOTO_HERMES_BRAIN=1
Hermes에게 보정 요청 (20초 타임아웃)
  ↓ 실패(네트워크 오류/타임아웃/파싱 실패/설정 없음)
Vision 관찰 결과 그대로 사용 — 예외를 던지지 않는다
  ↓ Vision 호출 자체가 실패하면(기존과 동일)
remotePhotoSortRunner의 기존 try/catch가 aiFailed:true로 decideBoundary 호출(변경 없음)
```

`callHermesForJson()`은 모든 실패 경로에서 `null`을 반환하도록 설계했다 — 이 경로가 예외를 던지는 경우는
없다(테스트로 검증: 연결 실패, 깨진 JSON, 범위 밖 값 세 가지 모두 안전 폴백 확인).

## 9. 성능 영향

- 플래그 off(기본값): **0** — 함수 참조만 바뀌었을 뿐 호출 경로 동일.
- 플래그 on: Hermes 호출은 `requiresAi` 후보 중에서도 confidence < 0.75인 것만 대상이라 이미 로컬
  필터(candidate-builder.ts)를 통과한 후보의 일부에만 추가 왕복이 생긴다. 타임아웃을 대화형 chat(60초)
  보다 훨씬 짧은 20초로 제한해 배치 전체가 걸리지 않게 했다.

## 10. 왜 §7의 MCP Tool(photo_inspect_boundary 등)을 만들지 않았는가 — 중요한 구조적 이유

`remotePhotoSortRunner.ts`는 Mac Studio에서 도는 **독립 CLI worker 프로세스**(`scripts/photo-classify-work-runner.ts`)로
실행된다. `lib/assistant/brain/hermesProvider.ts`(제가 지난 세션에 만든 채팅용 OliviaBrain)를 그대로
재사용하려 했으나, `runHermesChat()`은 `lib/hermes/executionContext.ts`의 **in-memory Map**에 requestId를
등록하고 Hermes가 그 requestId로 `/api/hermes/mcp`를 **같은 Next.js 서버 프로세스 안에서** 콜백하는 걸
전제로 한다. CLI worker는 그 서버와 별개 프로세스라 이 전제가 성립하지 않는다 — 그래서 MCP tool-calling
왕복 대신, 이미 확보한 Vision 관찰 결과를 prompt에 직접 넣는 단순 chat completion(`callHermesForJson`)을
새로 만들었다.

같은 이유로 §7의 `photo_inspect_boundary`(대화형 채팅에서 Hermes가 즉석으로 사진을 조회하는 Tool)도
만들지 않았다 — 실제 JPG 파일은 SSD2(Mac Studio 마운트)에 있고 `/api/olivia/v2/stream`을 서빙하는 Vercel
서버는 그 파일시스템에 접근할 수 없다. 이건 코드 설계 문제가 아니라 배포 구조상의 제약이라, 임시방편으로
얕게 구현하지 않고 다음 단계로 남겼다.

## 11. 남아있는 legacy OpenAI direct call

- `sceneAi.ts`/`folderPatternAi.ts`의 OpenAI 호출 자체 — 의도적으로 유지(Vision Tool 역할, §2가 요구하는 그대로).
- `scanPurpose`/`analyzeFolderPattern`은 `hermesPhotoBrain`에서도 아직 `localPhotoBrain`으로 그대로 통과시킨다
  (호출 빈도가 낮아 우선순위를 `analyzeBoundary`에 뒀다).
- `analyzeProfilePhoto`(Anthropic, 프로필 판정) — 이번 요청 범위 밖이라 손대지 않음.

## 12. 테스트 결과 / Build 결과

```
npm run typecheck  → 0 errors
npm run test       → 160 files, 1075 tests, 0 failed (기존 1066개 + 신규 9개)
npm run lint(변경 파일) → 0 errors/warnings
npm run build      → exit 0
```

기존 `tests/photoClassificationHybrid.test.ts`(27개, 요청서 §16 A/C/D/E/F/G/J에 대응하는 hard-split/
purpose-transition/stabilizer/accuracy 테스트)는 제가 손대지 않은 파일들을 검증하므로 그대로 통과 확인만
했다. 신규 9개 테스트가 H/I(Hermes·Vision 폴백 체인)와 B(60~180초 저확신 구간에서만 Hermes 개입)를 커버한다.

## 13. 다음 단계 추천

1. `scanPurpose`/`analyzeFolderPattern`에도 같은 패턴(낮은 확신 시 Hermes 보정)을 확장
2. §10 "Scene summary 일괄 검토" — `photo_storage_projects`에 scene 목록(이름/개수)을 Supabase로
   동기화하는 컬럼을 추가하면(새 테이블 아님, PHASE 6에서 merge_* 컬럼 추가한 것과 같은 패턴) 웹 채팅에서
   Hermes가 이미 완료된 분류 결과를 검토하는 MCP Tool을 안전하게 만들 수 있다
3. `lib/hermes/executionContext.ts`를 in-memory 대신 공유 저장소(Redis/Supabase)로 바꾸면 CLI worker
   프로세스에서도 진짜 MCP tool-calling을 쓸 수 있게 된다 — 다만 이건 사진분류뿐 아니라 채팅 Brain에도
   영향을 주는 더 큰 변경이라 별도 검토 필요
4. `OLIVIA_PHOTO_HERMES_BRAIN=1`을 실제로 켜보려면 먼저 Mac Studio worker 프로세스가 Hermes에 도달
   가능한지(Tailscale 등) 확인 — 채팅 Brain과 달리 이건 Vercel이 아니라 worker가 직접 호출하므로
   지난번 Vercel↔Hermes 연결 문제와는 무관하다
