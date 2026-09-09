# Hermes cloud fallback design

## Goal

Keep the Mac Studio Hermes engine as Olivia's primary chat engine while preserving the existing cloud Olivia API as a standby path for web and Telegram chat.

## Safety boundary

Fallback is allowed only when Hermes is unavailable before producing user-visible text or beginning a tool operation. Connection refusal, upstream unavailability, and pre-response timeout are safe. Stream interruption, tool verification failure, and errors after output begins are not retried because a second engine could duplicate a mutation.

## Web chat

The v2 stream reports a provider-switch status and continues through the existing OpenAI Responses/tool pipeline. Conversation storage records the engine that actually completed the response.

## Telegram

Text requests call Hermes first. The Hermes bridge returns an explicit `fallbackSafe` flag for failures. Only safe failures enter the existing cloud `/api/olivia` path; images already use that cloud path. Replies and verified tool results keep the existing Telegram delivery behavior.

## Verification

Tests cover safe and unsafe Hermes failures. Type checking and route linting must pass before deployment.
