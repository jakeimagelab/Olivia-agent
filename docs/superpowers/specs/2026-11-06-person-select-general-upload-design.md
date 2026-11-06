# 사진선택 범용화와 지속 업로드 설계

## 범위

기존 `person-select`의 사람별 PIN, 사진 접근, 선택, 주문, RAW 매칭을 유지하면서 프로젝트 설정을 세 축으로 분리한다.

- `project_type`: `general | school | medical | business`
- `access_mode`: `individual | project_shared`
- `customer_view_mode`: `classic | bridge`

기존 행은 `individual + classic`으로 유지한다. 학교용 항목이나 벨라비타 상품은 기존 행에 저장된 값을 그대로 사용하며 새 일반 프로젝트에 복사하지 않는다.

## 프로젝트 기본값

프로젝트 유형은 생성 시 추천 항목만 복사한다. 이후 항목은 프로젝트별 JSON 설정으로 독립 편집한다.

- general: 사진
- school: 선생님 프로필, 담임 사진
- medical: 프로필, 진료 연출, 단체사진
- business: 프로필, 단체사진

새 프로젝트의 상품, 추가 선택 가격, 추가 선택 최대 수, 전용 안내 문구는 비어 있거나 0이다. 기존 프로젝트의 저장값은 변경하지 않는다.

## 접근 방식

`individual`은 현재 테이블과 세션을 그대로 쓴다. `project_shared`는 사람/PIN을 만들지 않고, 충분히 긴 공유 토큰으로 프로젝트 단위 draft와 최종 제출을 저장한다. 공개 API는 토큰, 상태, 만료, 이미지 소속, 메모 길이를 매 요청 검증한다.

공동 초안은 revision 충돌을 감지한다. 클라이언트는 최신 상태를 다시 받아 사용자에게 충돌을 알리며 다른 담당자의 저장을 조용히 덮지 않는다.

## 고객 화면

`classic`은 현재 사람별 고객 화면을 유지한다. `bridge`는 기존 고객용 Bridge 컴포넌트를 같은 선택 데이터 어댑터로 사용한다. 관리자 Bridge와 고객 선택은 별도 저장소이며 자동 동기화하지 않는다.

## 지속 업로드

`PersonSelectUploadProvider`를 Olivia Desktop 최상단에 둔다. 상세 페이지는 파일 목록을 Provider에 넘기고 즉시 작업 ID를 받는다. Provider가 파일 객체, derivative 생성, 제한 동시성(3), pause/resume/retry/cancel을 소유하므로 OS 앱 전환이나 상세 페이지 unmount가 전송을 취소하지 않는다.

서버에는 job과 파일 체크포인트를 저장한다. 성공 여부는 이미지 DB insert 성공 후 기록한다. `event_id + source_rel_path`와 job 파일 식별자로 멱등성을 보장한다. 새로고침 뒤에는 서버 완료분을 복구하고, 브라우저 권한상 남은 로컬 파일은 사용자가 동일 폴더/파일을 재선택해 이어서 올린다.

전역 표시줄은 현재 OS 토큰으로 작업명, 장수, 진행률과 상태만 간결하게 표시한다. 실패는 완료로 표시하지 않는다.
