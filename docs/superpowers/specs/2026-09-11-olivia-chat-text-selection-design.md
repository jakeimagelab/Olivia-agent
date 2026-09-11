# Olivia 채팅 텍스트 선택 복구 설계

## 목표

Desktop Olivia 창과 Olivia Mobile OS에서 사용자·Olivia 메시지 본문을 마우스 드래그 또는 모바일 길게 누르기로 선택하고 복사할 수 있게 한다.

## 확인된 원인

정상적으로 끝난 새 브라우저 세션에서는 메시지 선택이 동작한다. 다만 Desktop 창을 이동하거나 크기를 바꾸는 동안 `document.body.style.userSelect`를 `none`으로 설정하고, 현재 구현은 `pointerup`·`pointercancel`·컴포넌트 정리에 주로 의존한다. 브라우저 포커스 이탈이나 pointer capture 유실 시 정리가 누락되면 전역 선택 금지 상태가 남을 수 있다.

## 설계

1. 채팅 메시지 본문에는 `user-select: text`와 `-webkit-user-select: text`를 명시한다.
2. 메시지 안의 버튼, 승인 액션, Resource Card처럼 클릭 조작이 우선인 요소는 `user-select: none`을 유지한다.
3. Desktop 창 이동·크기 조절의 정리 함수를 `lostpointercapture`, 브라우저 `blur`, 문서 visibility 변경에서도 실행한다.
4. 창 제목 영역의 이동 동작과 기존 Dock·자석 결합 동작은 변경하지 않는다.
5. 복사 전용 버튼은 추가하지 않는다. 기존 UI를 유지하면서 기본 브라우저 선택 동작을 복원한다.

## 테스트

- Desktop Olivia 채팅에서 메시지 문장을 좌우로 드래그했을 때 Selection 문자열이 생성된다.
- Mobile Olivia 채팅에서 메시지 본문의 계산된 `user-select`가 `text`다.
- 창 이동 중 `blur` 또는 `lostpointercapture`가 발생한 뒤 `document.body.style.userSelect`가 이전 값으로 복구된다.
- 메시지 내부 Resource Card와 승인 버튼은 기존처럼 클릭할 수 있다.
- TypeScript, 대상 ESLint, 관련 단위 테스트와 프로덕션 빌드를 통과한다.

## 제외 범위

- 메시지별 복사 버튼 추가
- 채팅 레이아웃 또는 말풍선 디자인 변경
- Desktop 창 이동·Dock UX 변경
- 대화 데이터와 Agent 동작 변경
