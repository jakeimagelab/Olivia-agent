# Hermes-assisted Scene labeling design

Date: 2026-09-23  
Repository: `jakeimagelab/Olivia-agent`

## Goal

After the existing Scene Engine has determined Scene boundaries, resolve only Scenes whose label is still `기타`. Reuse the existing representative-frame and scene-analysis code. Do not change boundary decisions, source storage, or photo-copy safety rules.

## Existing implementation

- `candidate-builder.ts`, `boundary-score.ts`, and `scene-builder.ts` determine Scene boundaries.
- `remotePhotoSortRunner.ts` already selects up to six representative frames from the beginning, middle, and end of a Scene.
- `sceneAi.ts#analyzePhotoScene()` already classifies a representative set as `profile`, `consultation`, `treatment`, `skin_care`, `interior`, or `etc`.
- `hermesPhotoBrain.ts` already lets Hermes review structured Vision observations for ambiguous boundary decisions.
- Folder creation and JPG copying already use sanitized names and preserve `JPG전체` as read-only.

The missing connection is that the precise classifier does not run the existing scene-level analysis after building Scene ranges, and automatically claimed jobs set `ai_naming_enabled` to `false`.

## Design

### Data flow

1. The existing precise Scene Engine creates boundaries and Scene ranges without modification.
2. Select only unresolved Scenes: `sceneType` is null/`etc`, or the planned folder name ends in `_기타`.
3. Select at most six representative frames using the existing beginning/middle/end sampling rule.
4. Resize those representatives before transfer. Never send every JPG in a Scene.
5. The Mac Studio worker calls a worker-authenticated Olivia server endpoint for scene analysis. This keeps OpenAI and Hermes credentials on the server rather than copying them to Mac Studio.
6. The server reuses `analyzePhotoScene()` to obtain structured visual observations.
7. When the photo brain is configured for Hermes, Hermes reviews those observations and may select only one of the department's existing scene types.
8. Convert the accepted type through the department configuration to a fixed Korean folder label, for example `03_시술` or `04_상담`.
9. If Vision/Hermes fails or remains uncertain, retain `기타` and record a warning. Classification itself continues safely.

### Provider responsibility

- Vision inspects the representative images.
- Hermes receives the structured Vision result and acts as the final reviewer for unresolved labels.
- Hermes does not receive file-system access and cannot change boundaries or move files.
- Arbitrary folder names from either model are not accepted. Folder labels must come from the existing department configuration.

### Security and storage

- The new analysis endpoint uses existing worker authentication.
- Request size is bounded by the representative count and thumbnail dimensions.
- `JPG전체` remains read-only.
- `씬별분류` remains COPY output.
- RAW handling is unchanged.
- Scene boundary logic, minimum Scene rules, and time bands are unchanged.

### Job configuration

- New automatically claimed classification jobs enable scene naming.
- Profile classification remains disabled by default, consistent with the current classifier defaults.
- Existing explicit job payloads can still override the option.

### Failure behavior

- Server timeout, provider error, invalid response, or low confidence produces a warning and retains `기타`.
- A naming failure never deletes partial output, changes the source, or changes Scene boundaries.
- If the server is unreachable, classification falls back to the existing unresolved label rather than failing the whole photo workflow.

## Tests

- Precise classification invokes scene analysis only for unresolved Scenes.
- A resolved Scene is not re-analyzed.
- Representative count never exceeds six.
- A valid Hermes-reviewed type produces the expected numbered Korean folder name.
- An invalid or unsupported type is rejected and retains `기타`.
- Provider failure retains `기타` and records a warning.
- The worker endpoint rejects unauthenticated requests.
- Existing `photoClassifyWork`, storage integrity, and pipeline tests continue to pass.

## Non-goals

- No changes to Scene boundary decisions.
- No analysis of every JPG.
- No direct photo access for Hermes.
- No RAW changes.
- No SSD1 changes.
- No new classification taxonomy or free-form folder names.
