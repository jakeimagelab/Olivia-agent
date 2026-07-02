# 영상 분류 (Video Classification) 기능 설계

## 배경

사진작업실(`app/(photo-studio)/`)에는 이미 "사진 분류" 기능이 있으며, 두 모드로 구성된다:

- **필드 모드**: 진료 현장에서 촬영된 사진을 시간 간격 기준으로 씬(scene) 단위로 그룹핑하고, 각 씬을 진료과별 장면 유형(주사시술/레이저시술/상담 등)으로 AI 분류
- **스튜디오 모드**: 프로필 촬영 사진을 의상/포즈/조명/인물별로 그룹핑

이번에 추가하는 "영상 분류"는 **필드 모드 로직을 영상 파일에 적용**한 새로운 기능이다. 사진분류 기능과는 완전히 별도로 동작하며, 기존 사진분류 코드는 수정하지 않는다.

## 목표

- 진료 현장에서 촬영된 영상 클립들을 시간 간격 기준으로 그룹핑(씬)하고, 각 씬의 영상 내용을 AI로 분석해 진료과별 장면 유형을 판별
- 분류 결과에 따라 씬별 폴더를 생성하고 영상 파일을 이동
- 사진작업실 레이아웃에 "🎥 영상 분류"라는 이름의 5번째 메뉴 항목으로 추가

## 비목표 (Out of scope)

- 스튜디오 모드에 대응하는 영상 기능(인물/포즈 기반 그룹핑)은 이번 범위에 포함하지 않는다
- 영상 파일을 여러 씬으로 잘라내는(cut) 기능은 포함하지 않는다 — 입력 영상 파일은 이미 개별 클립으로 분리되어 있다고 가정
- RAW 페어링(사진분류 필드모드의 RAW 파일 관리)에 대응하는 기능 없음 — 영상에는 해당 개념이 없음
- 자동화 테스트 스위트 구축은 범위 밖 (기존 사진분류 관례와 동일하게 수동 QA)

## 아키텍처

- **신규 페이지**: `app/(photo-studio)/video-sorting/page.tsx`
- **신규 API 라우트**: `app/api/video-scene-analyze/route.ts`
- **신규 타입**: `lib/video-classifier/types.ts`
- **재사용 (import만, 수정 없음)**:
  - `lib/photo-classifier/departments/*` — 진료과 및 장면 유형(scene type) 설정
  - `lib/ai/openai.ts` — OpenAI 클라이언트
- **수정**: `app/(photo-studio)/layout.tsx` — 메뉴 항목 추가

기존 사진분류 파일(`photo-sorting/page.tsx`, `photo-scene-analyze/route.ts`)은 전혀 수정하지 않는다. 씬 그룹핑(시간 간격 계산) 로직은 필드모드의 구현을 개념적으로 참고하여 새 파일에 독립적으로 재작성한다 (import 의존성 없음).

## 데이터 흐름

1. **폴더 선택**: File System Access API로 폴더 선택. mp4/mov/webm 등 영상 파일 스캔
2. **진료과 선택**: 분석 전 진료과(피부과/치과 등) 선택 — 해당 진료과의 scene-type 목록 및 프롬프트 가이드 결정
3. **씬 그룹핑**: 영상 파일들을 mtime 기준 시간 간격(설정 가능, 3~10분 — 필드모드와 동일)으로 그룹핑하여 씬(scene) 단위로 묶음
4. **대표 프레임 추출**: 씬에 속한 영상들에서 대표 프레임을 클라이언트 사이드에서 추출
   - 영상당 시작/중간/끝 지점(예: 10%/50%/90%)에서 `<video>` 엘리먼트 seek + Canvas 캡처로 base64 썸네일 생성
   - 씬 전체 기준 최대 6장까지 (필드모드가 씬당 최대 6장의 사진 썸네일을 쓰는 것과 동일한 한도) — 영상이 여러 개면 영상당 장수를 줄여서 총 6장 이내로 조정
5. **API 호출**: `/api/video-scene-analyze`에 `{ department, frames: base64[] }` 전달
   - 응답: `{ sceneType, displayName, suggestedFolderName, confidence, detectedCues, negativeCues, reason, needsReview }` (photo-scene-analyze와 동일한 응답 스키마)
   - 모델: OpenAI GPT-4.1-mini 기본, confidence 낮으면 GPT-4.1로 재분석 (필드모드와 동일한 에스컬레이션 정책)
6. **결과 표시 & 편집**: 씬(그룹) 단위 카드 UI로 표시. 사용자가 씬 타입 재분류 또는 폴더명 직접 수정 가능
7. **Export**: 씬별 폴더 생성 후 해당 씬에 속한 모든 영상 파일을 폴더로 이동

## 컴포넌트 & 타입

### `lib/video-classifier/types.ts` (신규)

```typescript
type VideoClipFile = {
  name: string;
  basename: string;
  handle: FileSystemFileHandle;
  mtime: number;
  duration?: number;
  frameThumbUrls?: string[];
};

type VideoScene = {
  index: number;
  folderName: string;
  editedName: string;
  startTime: number;
  endTime: number;
  clips: VideoClipFile[];
  sceneType: string;
  aiConfidence: number;
  aiReason: string;
  needsReview: boolean;
};
```

(필드모드의 `SceneFile`/`FieldScene` 구조를 영상에 맞게 재구성한 형태)

### `app/api/video-scene-analyze/route.ts` (신규)

`photo-scene-analyze`와 동일한 구조:
- Input: `{ department: string, frames: string[] }` (base64 JPEG, 최대 6장)
- Output: JSON 스키마 검증된 `VideoSceneAnalysisResult`
- 모델: `SCENE_MODEL` (gpt-4.1-mini) 기본 / `SCENE_MODEL_HIGH` (gpt-4.1) 저신뢰 시 에스컬레이션
- 프롬프트는 "정지 이미지"가 아닌 "영상에서 추출한 스틸컷 여러 장"이라는 맥락을 명시하도록 조정

### `app/(photo-studio)/video-sorting/page.tsx` (신규)

필드모드 UI 상호작용 패턴을 재구현:
- 폴더 선택 버튼
- 진료과 선택 드롭다운
- 씬 그룹 목록 (그룹핑 결과 미리보기)
- 분석 진행률 표시
- 씬별 결과 카드 (장면 유형, confidence, 대표 프레임 썸네일, 폴더명 편집 필드)
- Export 버튼 (폴더 생성 + 파일 이동)

### `app/(photo-studio)/layout.tsx` (수정)

기존 4개 메뉴 항목 옆에 "🎥 영상 분류" 항목 추가, `video-sorting` 라우트로 연결.

## 에러 처리

- **영상 메타데이터 로드 실패** (손상 파일, 미지원 코덱): 해당 파일을 "실패" 목록으로 분류, 스킵하고 나머지 진행. 사용자가 개별 재시도 가능
- **프레임 추출(seek) 실패**: 1회 재시도, 그래도 실패하면 해당 프레임만 제외하고 남은 프레임으로 진행 (완전 실패는 아님)
- **API 분류 실패/타임아웃**: 필드모드와 동일하게 씬 단위 재시도 버튼 제공
- **저신뢰 결과 (`needsReview`)**: 필드모드와 동일하게 UI에서 시각적으로 강조, 사용자 확인 유도

## 테스트 / 검증 계획

이 프로젝트는 자동화 테스트 스위트가 없는 관례를 따른다 (사진분류 기능도 동일). 구현 후 `/verify` 스킬을 사용해 개발 서버에서 샘플 영상 폴더로 다음을 직접 확인한다:

- 폴더 선택 → 진료과 선택 → 씬 그룹핑 결과가 시간 간격 기준으로 올바르게 나뉘는지
- 대표 프레임 썸네일이 정상적으로 추출·표시되는지
- AI 분류 결과와 confidence, needsReview 표시가 정상 동작하는지
- 폴더명 수정 후 export 시 실제 폴더 생성 및 파일 이동이 올바르게 되는지
- 손상된/코덱 미지원 영상 파일에 대한 에러 처리가 앱을 중단시키지 않는지
