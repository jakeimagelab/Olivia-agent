# Metadata Select: 동일시간 다중 RAW와 복사·이동

## 목표

선택본의 `DateTimeOriginal`이 같은 초에 찍힌 RAW 여러 장을 연사 그룹으로 보고 모두 처리한다. 일반 메타데이터 셀렉에서는 사용자가 RAW를 `Selected_RAW`로 복사하거나, 검증 후 이동할 수 있다. 기존 완료 제외 흐름은 계속 `Finished_RAW`로 안전 이동한다.

## 매칭 모델

`MetadataSelectRow`는 기존 단일 소비자를 위해 `rawName`과 `matchedOriginalName`을 유지한다. 다중 결과는 `rawNames`와 `matchedOriginalNames`에 모두 저장한다.

- 직접 DateTime 매칭: 같은 촬영시간 RAW가 하나 이상이면 성공이다. 첫 파일은 호환용 `rawName`, 전부는 `rawNames`에 둔다.
- 원본 JPG 경유 매칭: 같은 촬영시간 원본 JPG를 모두 찾고, 각 basename의 RAW를 합쳐 성공 처리한다. 일부 RAW가 없으면 찾은 RAW는 유지하고, 메시지에 발견·미발견 수를 함께 적는다.
- RAW가 하나도 없을 때만 `raw_missing`이다.
- 같은 basename에 서로 다른 경로로 중복된 RAW처럼 DateTime 그룹이 아닌 모호한 이름 매칭은 기존 `needs_review` 안전장치를 유지한다.

## 중복과 출력

같은 촬영시간 그룹을 여러 선택본이 참조할 수 있다. 이는 오류가 아니므로 행을 `needs_review`로 바꾸지 않는다. 전송 대상은 `rawNames`를 평면화한 뒤 NFC·소문자·파일 leaf 기준으로 한 번만 dedupe한다.

서로 다른 촬영시간이 같은 RAW를 참조하는 비정상 매칭은 기존처럼 검토 대상으로 남긴다. 최종 전송 전에도 `assertNoDestinationCollisions`를 적용한다.

## 파일 처리

`MetadataRawTransferMode`는 `copy | move`이며 기본은 `copy`다.

- 일반 + copy: `Selected_RAW`로 복사하고 원본은 유지한다.
- 일반 + move: `Selected_RAW`로 복사·크기 검증 후 원본을 삭제한다.
- 완료 제외: 선택값과 관계없이 `Finished_RAW`로 이동한다.

모든 이동은 기존 `transferFilesSafely`를 사용한다. 직접 rename이나 선삭제는 하지 않으며, 실패 시 기존 롤백을 유지한다.

## UI

일반 모드에는 복사/이동 선택기를 표시하고, 완료 제외 모드에서는 `완료 RAW로 이동`으로 고정 표시한다. 분석 결과와 확인 영역에는 선택본 수와 dedupe된 매칭 RAW 수를 분리해 보여주고, 수가 다를 때만 동일시간 추가 RAW 수도 표시한다. 다중 성공 행에는 성공 색상으로 RAW 목록과 연사 수를 표시한다.

## 검증

1. 매처 단위 테스트: 직접 RAW와 원본 JPG 경유의 2·5장 다중 매칭, 일부 RAW 누락, 동일 시간 중복 선택, 비정상 중복 안전 차단.
2. 출력 계획 테스트: copy, move, 완료 제외 강제 move, 중복 RAW dedupe.
3. 파일 전송 회귀: 기존 copy/verify/delete/rollback과 대상 충돌 차단.
4. `npm run typecheck`, `npm test`, `npm run build`.
