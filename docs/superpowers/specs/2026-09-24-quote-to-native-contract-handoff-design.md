# 견적서 → 네이티브 계약서 전환 설계

작성일: 2026-09-24  
대상 리포지토리: `jakeimagelab/Olivia-agent`

## 1. 문제

견적서의 `고객 승인 후 계약서 생성`과 최근 견적의 `계약서` 버튼은 아직 `window.open('/contract?data=...')`를 사용한다. 이 때문에 OLIVIA OS 안에서도 예전 전체 페이지 UI가 새 탭으로 열리고, `/contract`의 `OliviaWorkspaceRouteBridge`가 `data` 쿼리를 계약서 워크스페이스에 전달하지 않아 견적 항목도 사라진다.

## 2. 목표

- OLIVIA OS 안에서는 새 탭을 열지 않고 네이티브 `contract` 창을 연다.
- 새 계약서는 정확한 원본 견적 ID로 canonical 견적 데이터를 다시 읽는다.
- 병원명, 담당자, 연락처, 촬영일, 견적 항목, 금액, 메모가 계약서에 표시된다.
- 기존 계약서 열기(`contractId`)와 견적 기반 새 계약서 만들기(`sourceQuoteId`)를 구분한다.
- 직접 URL 경로는 기존 호환성을 유지하되 OS 전환에서는 사용하지 않는다.

## 3. 데이터 흐름

1. 계약서 생성 버튼을 누르면 현재 견적 저장을 `await`한다.
2. 저장 결과의 `quoteId`를 확인한다. 저장 실패 또는 ID 부재 시 계약서 창을 열지 않고 이유를 표시한다.
3. OLIVIA OS의 `contract` 앱을 `sourceQuoteId` 컨텍스트와 함께 연다.
4. `ContractBuilderWindowContent`가 `sourceQuoteId`를 `ContractBuilder`에 전달한다.
5. `ContractBuilder`는 기존 계약서 `resourceId`가 없고 `sourceQuoteId`가 있으면 `/api/quotes/{sourceQuoteId}`에서 견적을 읽어 계약서 초안을 채운다.
6. 기존 계약서 `resourceId`가 있으면 기존 계약서 로딩이 항상 우선한다.

최근 견적 목록의 계약서 버튼도 같은 함수와 같은 `quoteId` 흐름을 사용한다. 아직 DB ID가 없는 최근 항목은 먼저 저장한 뒤 연다.

## 4. 컨텍스트 규칙

`WindowContext`에 `sourceQuoteId?: string`을 추가한다.

- `resourceId`: 이미 존재하는 계약서 ID
- `sourceQuoteId`: 새 계약서의 원본 견적 ID

두 값을 혼용하지 않는다. singleton 계약서 창이 이미 열려 있어도 `openApp`이 새 컨텍스트로 갱신하므로 선택한 견적이 즉시 다시 로드돼야 한다.

## 5. UI와 오류 처리

- 저장·전환 중 버튼을 비활성화하고 `계약서 준비 중…`을 표시한다.
- 견적 저장 실패 시 기존 견적 화면에 오류를 표시하고 전환하지 않는다.
- 견적 조회 실패 또는 항목이 비어 있는 경우 계약서 화면에 구체적인 오류를 표시한다.
- `window.open()`은 OLIVIA OS 경로에서 호출하지 않는다.
- 직접 페이지 모드의 기존 URL 호환 동작은 제거하지 않는다.

## 6. 변경 범위

- `components/quote/QuoteBuilder.tsx`
- `lib/store/useOliviaDesktopStore.ts`
- `components/olivia-os/adapters/ContractBuilderWindowContent.tsx`
- `components/contract/ContractBuilder.tsx`
- `components/workspace/WorkspaceRegistry.ts`
- 관련 단위 테스트

메타데이터 셀렉 작업과 다른 문서 UI는 이번 수정에서 건드리지 않는다.

## 7. 검증

- 현재 견적에서 계약서 생성 시 새 탭이 열리지 않고 네이티브 계약서 창이 열린다.
- 최근 견적 항목에서도 같은 동작을 한다.
- 계약서에 견적 항목과 합계가 표시된다.
- 다른 견적을 선택하면 이미 열린 singleton 계약서 창이 새 견적으로 갱신된다.
- 기존 계약서 `resourceId` 열기는 계속 정상 동작한다.
- 저장 실패 시 계약서 창이 열리지 않는다.
- `npm run typecheck`, `npm test`, `npm run build`를 통과한다.

