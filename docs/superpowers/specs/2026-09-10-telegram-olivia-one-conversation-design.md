# Telegram ↔ Olivia Chat One Conversation 설계

작성일: 2026-09-10  
대상 저장소: `jakeimagelab/Olivia-agent`  
대상 브랜치: `main`

## 1. 목표

Telegram, Olivia Desktop, Olivia Mobile이 채널별 대화를 만들지 않고 대표자 소유의 하나의 active `assistant_conversations` 레코드와 그에 속한 `olivia_chat_messages`를 공동 사용한다.

채널은 메시지의 출처와 전송 상태를 설명하는 metadata일 뿐 대화 identity나 history 경계를 만들지 않는다. Olivia Chat의 `새 대화`가 기존 active conversation을 archive하면 Telegram도 다음 요청부터 새 active conversation을 사용한다.

## 2. 현재 구조와 문제

Web v2 경로는 이미 `ensurePrimaryAssistantOwner()`, `getOrCreateAssistantConversation()`, `saveAssistantMessage()`를 사용한다. 반면 Telegram webhook은 다음과 같이 canonical service를 우회한다.

- `saveChat()`이 `owner_id`, `conversation_id`, `channel`, `external_message_id` 없이 `olivia_chat_messages`에 직접 insert한다.
- `getHistory()`가 owner와 conversation을 제한하지 않고 전체 메시지의 최근 10건을 조회한다.
- Hermes session key에 canonical conversation UUID 대신 Telegram `chatId`를 사용한다.
- Telegram 첨부 binary와 message metadata가 기존 Olivia attachment storage에 연결되지 않는다.
- Web conversation store는 최초 hydrate 이후 외부 채널 insert를 실시간 반영하지 않는다.

## 3. 선택한 접근

Telegram을 Olivia v2의 공통 turn 처리 경로에 연결한다.

Telegram adapter가 인증, identity mapping, canonical inbound 저장, Telegram attachment 수집, Telegram delivery만 담당한다. 대화 history, Hermes 실행, cloud fallback, tool 실행 및 assistant 응답 저장은 Web이 사용하는 v2 처리 경로를 재사용한다.

기존 Telegram Hermes 직접 호출을 확장하는 방법은 fallback과 message persistence가 계속 중복되므로 채택하지 않는다. Kakao와 Voice까지 한 번에 범용 gateway로 바꾸는 방법은 이번 요청 범위를 넘기므로 채택하지 않는다.

## 4. Conversation identity

1. Telegram webhook은 기존 `TELEGRAM_ALLOWED_USER_ID` 검사를 먼저 수행한다.
2. 허용된 사용자는 `ensurePrimaryAssistantOwner()`로 대표자 owner를 resolve한다.
3. 기존 `assistant_channel_connections`에 Telegram user identity를 연결한다.
   - `external_user_id_hash`: Telegram user ID의 해시
   - `channel_user_key_hash`: Telegram chat ID의 해시
   - 원문 ID는 기존 암호화 helper를 사용한다.
4. `getOrCreateAssistantConversation(db, owner.id)`로 대표자의 active conversation을 resolve한다.
5. Telegram chat ID는 identity/delivery metadata에만 사용하며 conversation ID가 되지 않는다.

대표자마다 active conversation은 하나만 존재해야 한다. 마이그레이션은 active conversation이 여러 개인 기존 상태가 있으면 최신 한 건만 active로 유지하고 나머지를 archive한 뒤 partial unique index를 추가한다. archive는 삭제가 아니며 기존 메시지는 보존한다.

## 5. Telegram inbound

처리 순서는 다음과 같다.

1. Telegram user 인증
2. primary owner resolve
3. Telegram channel identity resolve/update
4. active conversation resolve
5. attachment를 기존 storage에 저장
6. `saveAssistantMessage()`로 user message 저장
7. duplicate 여부를 확인
8. Olivia v2/Hermes turn 실행

Telegram external message ID는 Telegram message ID가 chat별로만 유일하다는 점을 반영해 `telegram:{chatId}:{messageId}` 형식을 사용한다.

중복 webhook이 도착하면 같은 user row를 다시 만들지 않는다. 이미 `processed`인 webhook은 즉시 성공 응답하고, `processing`인 webhook은 다른 실행이 처리 중인 것으로 보고 성공 응답한다. `received` 또는 `failed` 이벤트만 조건부 update로 `processing` 상태를 획득해 재개할 수 있다. 따라서 동시에 들어온 duplicate 중 하나만 Agent 작업을 실행한다.

## 6. 공통 turn 실행과 history

내부 호출로 v2 stream route를 사용할 때 다음 trusted input을 전달한다.

- canonical `conversationId`
- `channel: "telegram"`
- 이미 저장된 user message ID
- Telegram request/external ID
- attachment metadata

외부 브라우저 요청은 임의로 channel을 바꿀 수 없다. `channel`과 기존 message ID 입력은 올바른 `x-internal-key`를 가진 서버 간 요청에서만 허용한다. 일반 Olivia Web 요청은 항상 `channel: "web"`이다.

v2/Hermes history는 canonical conversation의 모든 channel 메시지를 `created_at` 오름차순으로 사용한다. 현재 Telegram inbound는 이미 DB에 있으므로 history에 포함하되 새 prompt로 한 번 더 중복 전달하지 않는다. Web의 optimistic message는 기존처럼 서버 저장과 병합한다.

Hermes `X-Hermes-Session-Key`는 `olivia:{canonicalConversationId}`를 사용한다. 따라서 Telegram에서 시작한 문맥과 Web에서 시작한 문맥이 같은 Hermes session과 DB history를 공유한다.

## 7. Assistant message와 resource metadata

Agent 결과는 Telegram 전송 전에 `saveAssistantMessage()`로 같은 conversation에 저장한다.

- `role: "assistant"`
- 실제 요청 채널 (`web` 또는 `telegram`)
- `parent_message_id`: 해당 user message ID
- `external_message_id`: transport별 안정적인 응답 ID
- `delivery_status`: Telegram은 최초 `queued`, Web은 필요 시 null

tool 결과에 리소스가 있으면 message metadata에 정규화해서 저장한다.

```json
{
  "resourceType": "quote",
  "resourceId": "…",
  "version": 3
}
```

기존 rich block, `agentRunId`, `hermesRunId`, tool call metadata는 유지한다. 견적서, 계약서, 일정, 콘티, 분석 결과에 resource 정보가 실제로 존재할 때만 연결하고 모델 텍스트에서 ID를 추측하지 않는다.

## 8. Telegram outbound와 delivery

순서는 다음과 같다.

1. Agent 결과 확정
2. canonical assistant message 저장 (`delivery_status=queued`)
3. 기존 `assistant_delivery_attempts`에 전송 시도 기록
4. Telegram API 전송
5. message와 delivery attempt를 `delivered` 또는 `failed`로 갱신

DB 저장 실패와 Telegram 전송 실패는 별도 오류로 취급한다. DB 저장에 실패한 응답은 정상 대화처럼 보내지 않는다. DB에는 저장됐지만 Telegram 전송만 실패한 경우 message를 삭제하거나 되돌리지 않고 `failed` 상태와 오류 metadata를 보존한다.

Telegram API의 HTTP 성공뿐 아니라 응답 JSON의 `ok`도 검사한다. 견적 preview 전송과 일반 텍스트 전송도 동일한 delivery 기록 원칙을 적용한다.

## 9. 첨부파일

Telegram 사진과 지원 파일은 기존 private `olivia-chat-attachments` bucket에 업로드한다. binary나 Telegram bot token이 포함된 file URL은 message row에 저장하지 않는다.

저장 경로는 기존 validator와 호환되는 `uploads/YYYY-MM-DD/{uuid}/{safeFileName}` 형식을 사용한다. message metadata에는 정규화된 attachment 정보만 둔다.

- ID
- kind
- file name
- MIME type
- size
- storage path
- analysis status

conversation GET API가 private object의 단기 signed URL을 생성한다. Olivia Chat은 기존 `OliviaChatMessageAttachments` 컴포넌트로 `[이미지] + 본문` 또는 파일 카드를 표시한다.

첨부 업로드 일부가 실패해도 텍스트나 음성 transcript가 있으면 성공한 첨부와 본문으로 Agent 처리를 계속하고 실패 목록을 message metadata에 남긴다. 첨부만 있는 메시지에서 모든 첨부 업로드가 실패하면 user에게 오류를 알리고 Agent는 실행하지 않는다.

## 10. Web/Mobile 표시와 Realtime

conversation GET은 channel 필터를 사용하지 않고 현재 canonical conversation의 모든 메시지를 시간순으로 반환한다. UI message model에 `channel`과 `attachments`를 추가하며 channel badge는 작은 보조 정보로만 표시한다.

열려 있는 Olivia Chat은 현재 conversation ID로 `olivia_chat_messages` INSERT 이벤트를 구독한다. Realtime payload 자체를 canonical 데이터로 사용하지 않고 변경 신호로만 취급한 뒤 인증된 conversation GET을 재호출한다. 연속 이벤트는 짧게 합쳐 중복 fetch를 줄인다.

Realtime 연결이 실패해도 polling은 시작하지 않는다. 창이 다시 focus되거나 document가 visible 상태로 돌아올 때 한 번 refetch한다.

서버 hydrate와 Realtime refetch는 다음 identity 순서로 메시지를 병합한다.

1. DB message `id`
2. `clientRequestId`
3. channel + `externalMessageId`

이를 통해 Web optimistic message와 DB persisted message가 두 번 표시되지 않는다.

## 11. 정렬과 조회

`listAssistantMessages()`는 owner ID와 conversation ID를 항상 조건으로 사용한다. 최근 N건을 가져온 뒤 UI와 Agent에는 오래된 항목부터 전달한다. 동일 timestamp에서도 테스트가 안정적이도록 `created_at` 뒤에 `id` 정렬을 추가한다.

Agent history에는 `web`, `telegram`, `voice`, `kakao` 메시지를 모두 포함하고 channel은 metadata로만 유지한다.

## 12. 데이터베이스 변경

새 대화/message 테이블을 만들지 않는다. 기존 테이블과 bucket만 보완한다.

- 대표자별 active conversation partial unique index
- `olivia_chat_messages`의 canonical 조회/index 및 Realtime publication 확인
- 필요한 경우 message delivery 갱신을 위한 기존 필드/constraint 보완
- 기존 `assistant_webhook_events`, `assistant_delivery_attempts` 재사용

마이그레이션은 반복 실행 가능해야 하며 실제 DB 적용 후 index, publication, constraint를 조회해 확인한다.

## 13. 오류 처리

- 인증 실패: 메시지 저장과 Agent 실행 없이 거절
- attachment 수집 실패: 본문이 있으면 성공한 첨부만 기록하고 계속 처리하며, 첨부만 있고 전부 실패하면 Agent 실행 금지
- canonical inbound 저장 실패: Agent 실행 금지
- Hermes 안전 실패: 같은 v2 turn 안에서 cloud Olivia fallback
- Agent 결과 저장 실패: Telegram 정상 응답 전송 금지
- Telegram delivery 실패: 저장된 assistant message 보존, delivery만 failed
- Realtime 실패: UI 유지, focus/visibility refetch

## 14. 테스트

자동 테스트는 다음을 검증한다.

1. Telegram user message가 primary active conversation에 `channel=telegram`으로 저장된다.
2. Telegram Agent response가 같은 conversation에 저장된다.
3. Web user/assistant message가 같은 conversation에 `channel=web`으로 저장된다.
4. Telegram 다음 요청의 Hermes history에 이전 Web 메시지가 포함된다.
5. 같은 Telegram `message_id` webhook 두 번이 user row와 Agent 실행을 중복 생성하지 않는다.
6. Web + Telegram message가 `created_at` 순서로 반환된다.
7. Telegram attachment metadata가 저장되고 Olivia Chat message에 표시된다.
8. Telegram delivery 실패 뒤에도 assistant message가 남고 delivery status만 failed가 된다.
9. `새 대화` 뒤 Telegram 요청이 새 active conversation을 사용한다.
10. Realtime insert 신호가 열린 Web chat의 authenticated refetch와 deduplicated merge를 발생시킨다.

기존 Hermes fallback, Olivia stream, conversation store 테스트도 함께 실행한다. 타입 검사, lint, production build를 통과시킨 뒤 실제 Telegram 중복 webhook과 Desktop 표시를 가능한 범위에서 검증한다.

## 15. 완료 기준

대표자가 Telegram과 Olivia Desktop/Mobile을 번갈아 사용해도 active conversation, message history, Agent context가 끊기지 않는다. 모든 메시지는 `assistant_conversations`와 `olivia_chat_messages`만을 canonical source로 사용하고, 채널은 source/delivery metadata 역할만 한다.
