# Hermes × Olivia 고객검색 PoC 설계

작성일: 2026-09-08  
대상 Hermes: v0.21.1 (2026.9.7), upstream `fef0e16f`

## 1. 목표와 범위

Olivia 메인 채팅에서 고객검색 요청을 Hermes Agent가 해석하고, Hermes가 `olivia.client.search` 도구를 실제 호출한 경우에만 Olivia 고객 DB 검색 결과를 답하도록 연결한다.

이번 PoC는 다음 하나만 지원한다.

- 고객명·병원명 검색: `olivia.client.search`

일정, 콘티, 견적, 계약, 메일, 워크플로우, 메모 이전, 터미널·파일·컴퓨터 제어는 노출하지 않는다. 기존 Olivia Agent, UI, Supabase 스키마 및 기존 도구는 삭제하거나 교체하지 않는다. 운영 배포와 GitHub push도 하지 않는다.

## 2. 선택한 연결 방식

### Olivia → Hermes

Hermes v0.21.1의 공식 OpenAI 호환 API인 `POST /v1/chat/completions`를 사용한다. 기본 주소와 인증 값은 서버 전용 환경변수에서 읽는다.

- `HERMES_BASE_URL=http://100.89.79.55:8642`
- `HERMES_API_KEY=<Hermes API_SERVER_KEY와 동일한 값>`
- `OLIVIA_AGENT_ENGINE=legacy|hermes`

기존 Olivia 브라우저 스토어는 계속 `/api/olivia/v2/stream`만 호출한다. 이 서버 라우트가 `OLIVIA_AGENT_ENGINE`을 확인해 `legacy`이면 현재 코드를 그대로 실행하고, `hermes`이면 Hermes adapter로 위임한다. 브라우저에는 Hermes URL, API 키, Agent Engine 환경변수를 전달하지 않는다.

Hermes 호출은 최대 60초 timeout을 사용한다. Hermes가 꺼져 있거나 Tailscale 연결이 끊기면 내부 오류를 숨기고 다음 문구를 반환한다.

> Hermes Agent에 연결할 수 없습니다. Mac Studio Hermes Server 상태를 확인해 주세요.

### Hermes → Olivia

Hermes의 공식 원격 Streamable HTTP MCP를 사용한다. Olivia가 `/api/hermes/mcp`에서 MCP 서버 역할을 하고, Hermes의 `~/.hermes/config.yaml`에는 이 URL과 서버 전용 공유 비밀키를 등록한다.

Hermes에 보이는 도구는 정확히 하나다.

- MCP 등록명: `olivia`
- MCP tool name: `client.search`
- Hermes 내 실제 이름: `mcp_olivia_client_search`
- 사용자 의미 이름: `olivia.client.search`

도구 설명에는 고객 존재 여부를 대화로 추측하지 말 것, 검색 요청에는 반드시 도구를 실행할 것, 0건·복수건·오류를 임의 확정하지 말 것을 명시한다.

공식 근거:

- Hermes API Server: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/api-server.md
- Hermes programmatic integration: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/programmatic-integration.md
- Hermes native MCP: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/mcp.md

## 3. 데이터 흐름

```text
Olivia 채팅 UI
  → POST /api/olivia/v2/stream
  → OLIVIA_AGENT_ENGINE 확인
  → Hermes POST /v1/chat/completions
  → Hermes가 mcp_olivia_client_search 필요성 판단
  → POST /api/hermes/mcp (tools/call)
  → Olivia client search service
  → 기존 fuzzyNameSearch + getSupabaseAdmin
  → 구조화 결과 + OliviaToolVerification
  → Hermes 최종 답변
  → Olivia SSE 형식으로 normalize
  → 기존 Olivia 채팅 UI
```

Hermes는 Supabase URL, anon key, service-role key, 테이블 구조를 받지 않는다. MCP 응답은 고객 검색 결과에 필요한 최소 필드만 포함한다.

## 4. Olivia 고객검색 재사용 경계

현재 `lib/olivia/nameSearch.ts`의 `fuzzyNameSearch`가 공백 차이와 부분일치를 처리한다. 이를 중복 구현하지 않고 새 서버 서비스가 재사용한다.

권장 서비스:

`lib/olivia/clientSearch.ts`

- 입력: `query`, optional `limit`
- 내부: `getSupabaseAdmin()` + `fuzzyNameSearch`
- select 최소 필드: `id, hospital_name, specialty`
- 결과: `clients[]`, `matchCount`, `verification`

기존 `select_project`는 고객 한 명과 프로젝트까지 확정하는 도구이므로 복수 후보를 온전히 돌려줘야 하는 이번 검색 요구와 의미가 다르다. 공통 검색 primitive인 `fuzzyNameSearch`를 재사용하되 프로젝트 선택 동작은 호출하지 않는다.

## 5. API와 타입

### Hermes client

- `lib/hermes/types.ts`: Hermes 요청·SSE·normalized response 타입
- `lib/hermes/client.ts`: 환경변수 검증, Bearer 요청, AbortController timeout, 응답 normalize
- `lib/hermes/systemPrompt.ts`: 검색 사실성 규칙과 허용 도구 범위

API 키와 전체 사용자 payload는 로그에 기록하지 않는다. 오류 로그는 endpoint host, status, timeout 여부처럼 진단에 필요한 최소 정보만 남긴다.

### MCP bridge

- `app/api/hermes/mcp/route.ts`: Streamable HTTP MCP endpoint
- `lib/hermes/mcpServer.ts`: `client.search` schema와 handler
- 인증: `Authorization: Bearer ${HERMES_TOOL_SHARED_SECRET}`
- runtime: Node.js
- 허용 메서드: MCP SDK가 요구하는 GET/POST/DELETE만 처리

비밀키가 없거나 일치하지 않으면 401을 반환한다. `/api/hermes` prefix는 기존 관리자 쿠키와 별도로 route-level shared secret 검증을 필수로 한다.

### Debug route

- `app/api/hermes/chat/route.ts`

로그인된 Olivia 관리자만 호출할 수 있는 비스트리밍 디버그 route다. 실제 UI 경로와 같은 `lib/hermes/client.ts`를 사용하며, 다음 형태로 normalize한다.

```json
{
  "success": true,
  "message": "...",
  "runId": "...",
  "toolCalls": [],
  "data": {}
}
```

## 6. 사실성 게이트

시스템 프롬프트만 신뢰하지 않는다. Olivia adapter가 다음 규칙을 추가로 강제한다.

1. 고객검색 요청에서 완료된 `mcp_olivia_client_search` 실행 신호가 없으면 고객 존재를 확정한 Hermes 답변을 그대로 전달하지 않는다.
2. 도구 결과 0건이면 `등록된 고객에서 찾지 못했습니다.`로 normalize한다.
3. 결과가 여러 건이면 후보 목록을 표시하고 하나를 임의 선택하지 않는다.
4. 도구/API 오류이면 `고객 검색에 실패했습니다.`로 처리하고 `찾았습니다` 표현을 허용하지 않는다.
5. 결과가 1건이어도 MCP verification의 `executed`와 `resourceExists`를 확인한 뒤 표시한다.

MCP 응답 구조:

```json
{
  "success": true,
  "clients": [
    { "id": "...", "name": "강재활의학과", "specialty": "재활의학과" }
  ],
  "verification": {
    "executed": true,
    "resourceExists": true,
    "verifiedAt": "2026-09-08T00:00:00.000Z"
  }
}
```

## 7. 대화와 스트리밍

기존 `OliviaStreamEvent` 형식을 유지한다. Hermes 응답을 다음 이벤트로 변환한다.

- 시작: `message_start`
- Hermes 처리 상태: `agent_status`
- MCP 시작/완료: `tool_start`, `tool_result`
- 답변: `text_delta`
- 종료: `message_complete`
- 연결·도구 실패: 기존 `error` block

기존 메시지 저장과 conversationId 흐름은 유지한다. Hermes Chat Completions가 stateless이므로 이번 PoC에서는 Olivia가 전달한 제한된 최근 대화만 messages에 포함하고, Hermes memory migration은 하지 않는다.

## 8. Hermes 측 설정

Mac Studio의 `~/.hermes/.env`:

```dotenv
API_SERVER_ENABLED=true
API_SERVER_HOST=0.0.0.0
API_SERVER_PORT=8642
API_SERVER_KEY=<HERMES_API_KEY와 같은 값>
```

Mac Studio의 `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  olivia:
    url: "http://<MACBOOK_TAILSCALE_IP>:3000/api/hermes/mcp"
    headers:
      Authorization: "Bearer <HERMES_TOOL_SHARED_SECRET>"
    tools:
      include: ["client.search"]
```

Olivia `.env.local`:

```dotenv
OLIVIA_AGENT_ENGINE=hermes
HERMES_BASE_URL=http://100.89.79.55:8642
HERMES_API_KEY=<Mac Studio API_SERVER_KEY>
HERMES_TOOL_SHARED_SECRET=<별도 랜덤 비밀키>
```

Olivia 개발 서버는 Hermes가 접근할 수 있도록 `next dev --hostname 0.0.0.0`으로 실행한다. 이 설정은 로컬 PoC에만 사용한다.

## 9. 테스트

### 자동 테스트

- feature flag `legacy`: Hermes client가 호출되지 않음
- feature flag `hermes`: Hermes adapter가 호출됨
- exact search: 강재활의학과 1건
- fuzzy search: 강재활 후보 반환
- missing search: 0건 및 고정 없음 문구
- duplicate search: 모든 후보 반환, 단일 확정 금지
- DB error: verification success 금지 및 실패 문구
- Hermes timeout/offline: 연결 안내 문구
- MCP auth 없음/오류: 401
- 응답/로그/API bundle에 server secret 없음

### 실제 통합 테스트

1. MacBook·Mac Studio Tailscale 연결 확인
2. Olivia 개발 서버를 `0.0.0.0:3000`으로 시작
3. Hermes gateway 시작 후 `/health`와 `/v1/models` 확인
4. `hermes mcp test olivia`로 `client.search` 발견 확인
5. Olivia 채팅에서 다음 실행
   - `강재활의학과 찾아줘`
   - `존재하지않는병원123 찾아줘`
   - `강재활 찾아줘`
6. MCP tool 실행 로그와 Olivia 화면 결과를 함께 확인
7. bridge를 의도적으로 중단해 허위 성공이 나오지 않는지 확인

## 10. 기존 기능 영향과 확장성

`OLIVIA_AGENT_ENGINE` 기본값은 `legacy`다. Hermes 환경변수가 없거나 flag가 `legacy`이면 기존 `/api/olivia/v2/stream` 코드 경로가 그대로 실행된다. 기존 DB/API/schema/UI에 마이그레이션은 없다.

향후 calendar/conti를 연결할 때는 MCP registry에 새 handler를 추가할 수 있지만, 각 handler는 반드시 기존 Olivia domain service를 호출하고 고유 verification 정책을 가져야 한다. 이번 PoC에서 만든 Hermes client, MCP 인증, SSE normalize, timeout, 사실성 게이트는 그대로 재사용한다.

## 11. 완료 기준

코드와 mock test만으로 완료 처리하지 않는다. 실제 Hermes v0.21.1이 MCP `client.search`를 호출하고, Olivia 실제 고객 DB의 exact/none/fuzzy 결과가 기존 채팅 UI에 표시되며, tool/DB 오류 시 성공을 주장하지 않는 것까지 확인해야 PoC 완료다.
