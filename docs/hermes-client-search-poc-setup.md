# Hermes × Olivia client.search PoC 실행

이 PoC는 Olivia 채팅 UI와 대화 저장 구조를 유지한 채 Agent Engine만 Hermes로 전환한다. Hermes가 사용하는 Olivia 업무 도구는 `client.search` 하나뿐이다.

## 1. Olivia(MacBook) 환경변수

`.env.local`에 아래 값을 추가한다. 두 secret은 서로 다른 긴 임의 문자열을 사용하고 저장소에 커밋하지 않는다.

```dotenv
OLIVIA_AGENT_ENGINE=hermes
HERMES_BASE_URL=http://100.89.79.55:8642
HERMES_API_KEY=<Mac Studio API_SERVER_KEY와 같은 값>
HERMES_MODEL=hermes-agent
HERMES_TOOL_SHARED_SECRET=<Olivia MCP 전용 shared secret>
```

기존 Agent로 즉시 되돌리려면 `OLIVIA_AGENT_ENGINE=legacy`로 바꾸고 Olivia 서버를 재시작한다.

## 2. Hermes(Mac Studio) API Server

Hermes의 `.env`에 다음 값을 넣는다.

```dotenv
API_SERVER_ENABLED=true
API_SERVER_HOST=0.0.0.0
API_SERVER_PORT=8642
API_SERVER_KEY=<Olivia의 HERMES_API_KEY와 같은 값>
```

설정 후 Hermes 서비스를 재시작하고 MacBook에서 확인한다.

```bash
curl -i http://100.89.79.55:8642/health
```

## 3. Hermes에 Olivia MCP 등록

Hermes의 MCP 설정에 Streamable HTTP 서버를 등록한다. MacBook의 현재 Tailscale IP는 `100.91.105.62`이며, Olivia 개발 서버는 외부 인터페이스에 바인딩해야 한다.

```yaml
mcp_servers:
  olivia:
    url: "http://100.91.105.62:3000/api/hermes/mcp"
    headers:
      Authorization: "Bearer <Olivia의 HERMES_TOOL_SHARED_SECRET와 같은 값>"
    tools:
      include: [client.search]
      prompts: false
      resources: false

# API server Agent에는 이번 PoC의 Olivia MCP만 노출한다.
platform_toolsets:
  api_server:
    - olivia
```

Hermes 설정 파일의 정확한 위치와 편집 명령은 설치 방식에 따라 다르므로 `hermes mcp --help`와 `hermes config --help`로 확인한다. secret은 명령 이력이나 저장소에 넣지 않는다.

## 4. Olivia 실행

로컬 PoC에서는 Mac Studio가 MCP endpoint에 접근할 수 있도록 다음처럼 실행한다.

```bash
npm run dev -- --hostname 0.0.0.0 --port 3000
```

## 5. 테스트

Olivia 채팅에서 순서대로 확인한다.

1. `강재활의학과 찾아줘` — 실제 등록 고객 표시
2. `존재하지않는병원123 찾아줘` — `등록된 고객에서 찾지 못했습니다.`
3. `강재활 찾아줘` — 공백/부분명 fuzzy 검색
4. 같은 이름 후보가 여러 개면 후보 목록 표시
5. Mac Studio Hermes를 중지하면 연결 실패 메시지 표시

자동 검증:

```bash
npm test -- tests/hermesClientSearch.test.ts tests/hermesClient.test.ts
npm run typecheck
npm run lint
npm run build
```

## 보안 경계

- Hermes API key와 MCP shared secret은 브라우저 번들에 포함되지 않는다.
- Hermes는 Supabase를 직접 호출하지 않고 Olivia MCP의 `client.search`만 호출한다.
- MCP endpoint는 별도 Bearer secret을 요구한다.
- 고객검색 요청은 실제 MCP 실행 검증이 없으면 결과 문장을 차단한다.
