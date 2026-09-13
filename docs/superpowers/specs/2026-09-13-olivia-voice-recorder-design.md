# Olivia OS 음성 기록 V1 설계

## 범위

하나의 반응형 `OliviaRecorder`가 iPhone, 기타 모바일, iPad/Tablet, Desktop에서 동일한 DB, Storage, 전사 및 Hermes 분석 파이프라인을 사용한다.

흐름은 `녹음 → 비공개 Storage 업로드 → OpenAI 화자분리 전사 → Hermes 읽기 전용 정리 → 결과 저장`이다. 일정, To-do, 고객, 프로젝트 등 Olivia 업무 데이터는 생성하거나 수정하지 않는다.

## 데이터 보존

- 원본 오디오는 `voice-recordings` 비공개 버킷에 유지한다.
- timestamp와 speaker가 포함된 원본 segment 및 합쳐진 transcript를 별도로 유지한다.
- 제목, 요약, 핵심 내용, 할 일 후보는 파생 데이터로 따로 저장한다.
- Hermes가 실패하면 `transcribed` 상태로 남겨 원본 오디오와 전사 결과를 보호하고, 정리만 다시 실행할 수 있게 한다.

## 클라이언트

브라우저 `MediaRecorder`를 사용하고 MP4/M4A를 우선 선택한다. Web Audio analyser는 waveform과 화면용 화자 추정에만 쓰며, 최종 화자 정보는 OpenAI diarization 결과만 신뢰한다. 녹음 세션과 서명 업로드 정보를 `localStorage`에 임시 백업하고 성공 후 제거한다.

## 서버

신규 `/api/voice` 경로는 기존 관리자 세션 미들웨어로 보호한다. 서버만 service-role과 OpenAI/Hermes 자격 증명을 사용한다. 사용자는 제한된 단일 경로 signed upload URL로 원본을 올리고, 조회 시에는 짧은 수명의 signed download URL을 받는다.

Hermes에는 `canEdit: false`, `canFinalize: false` 컨텍스트를 전달하고 도구 호출이 발생한 결과는 정리 결과로 채택하지 않는다.

## 한계

OpenAI 파일 전사는 현재 25MB 이하만 처리한다. 더 큰 파일은 원본은 보존하되 V1에서는 자동 분할하지 않는다. 브라우저가 종료되면 메모리에 있던 녹음 Blob 자체는 복구할 수 없으므로, 종료 경고와 세션 식별자 복구 안내까지만 제공한다.
