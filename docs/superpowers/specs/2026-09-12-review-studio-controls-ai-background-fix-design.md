# Review Studio Controls and AI Background Fix

## Goal

Finish the Review Content Studio polish without redesigning the workspace:

- Move canvas ratio selection from the context toolbar into the left content panel.
- Make font size, line-height, and letter-spacing sliders thinner and easier to control precisely.
- Restore AI background generation while preserving the current controlled-storage and canvas application flow.

## UI changes

### Canvas ratio

Add a compact `캔버스 비율` section in the left panel immediately before `템플릿 선택`. It continues to offer:

- 4:5 (Instagram), 1080×1350
- 3:4, 1080×1440
- 2:3, 1080×1620
- 1:1, 1080×1080

Changing the selection continues to call the existing document resize function. No canvas or export data model changes are required.

### Typography controls

Keep the existing context toolbar and controls, but tune their ranges and visual weight:

- Font size: 8–120px, 1px steps.
- Line height: 0.8–2.2, 0.02 steps.
- Letter spacing: -5–12px, 0.1px steps.
- Slider track: 2px.
- Slider thumb: 10px.
- Preserve the compact current-value display for exact feedback.

Existing stored values remain untouched. The change only makes subsequent interaction finer and less visually heavy.

## AI background root cause and repair

The current `gpt-image-1` generation request sends `response_format: "b64_json"`. GPT Image models already return base64 image data and use `output_format` for format selection; `response_format` is a DALL-E parameter. The incompatible option can cause the generation request to fail before storage is reached.

Repair the provider adapter as follows:

1. Resolve the image model from `REVIEW_BACKGROUND_MODEL`, then the project's existing `OPENAI_IMAGE_MODEL`, then the current fallback.
2. For GPT Image models, send `output_format: "png"` and omit `response_format`.
3. Request all selected variants in one API call with `n: count` instead of rejecting the whole operation across three concurrent calls.
4. Validate every returned `b64_json` item and convert it to the existing `GeneratedBackground` structure.
5. Preserve server-only credentials, Supabase controlled storage, signed URLs, asset records, and current canvas application behavior.
6. Return actionable errors from the route while avoiding secrets or raw credential details.

## Data flow

```text
AI Background modal
  -> POST /api/review-content/background/generate
  -> BackgroundGenerator
  -> OpenAI Images API (one request, up to three variants)
  -> review-content-assets bucket
  -> signed Olivia storage URLs
  -> current page backgroundImage
  -> shared ReviewCanvasRenderer
```

No external provider URL is stored or captured by the renderer.

## Error behavior

- Missing API credentials: report that the deployment environment needs the server credential.
- Provider rejection: return a concise generation failure message with a safe provider reason.
- Empty or partial provider result: fail clearly instead of claiming three backgrounds were created.
- Storage failure: preserve the current upload error and do not apply an incomplete asset.

## Tests

- Unit test that GPT Image requests omit `response_format` and include `output_format: "png"`.
- Unit test conversion of multiple base64 results.
- Unit test missing/empty image results.
- Existing Review Content Studio tests, typecheck, lint, and production build.
- Browser verification of the left-panel ratio control and thin typography sliders.
- Verify the generation endpoint response after deployment without exposing credentials.

## Out of scope

- General workspace redesign.
- Changing the canonical renderer or export architecture.
- Replacing Supabase storage.
- Baking review text into generated images.
