# Olivia Voice Brand Interview System V1 — Design

**Date:** 2026-09-30  
**Baseline:** `b207f63bd291954e983f35674128eb47446a79a5`  
**Scope:** Independent Olivia Voice interview mode. The existing general voice recorder remains intact.

## Goal

Turn a prepared, selected set of interview questions into one immutable source of
truth used by the hospital PDF, the on-site recorder, question markers, and the
post-recording brand summary. The product must never create a fake recording to
represent preparation, never lose recorded audio when AI processing fails, and
never silently change the question set after a PDF has been sent.

## Non-goals

- Do not modify `components/memo/VoiceMemoPanel.tsx` or merge with Memo Voice.
- Do not replace or regress the current general recorder, its private
  `voice-recordings` bucket, diarization, speaker rename, history, or detail UI.
- Do not infer a workflow run from a hospital name.
- Do not automatically email or text a PDF in V1.
- Do not use html2canvas, jsPDF, a public storage URL, AI-selected questions, or
  an in-memory full-interview Blob.

## Architecture and ownership

`voice_interview_preparations` is a mutable planning record. It contains the
currently editable hospital, interviewee, date, selected questions, optional
explicit client/workflow links, and lifecycle status. It is not a recording.

`voice_interview_preparation_versions` is an immutable, versioned snapshot.
Ready creates a new version instead of updating an old one. PDF storage belongs
to that version. The preparation points at the version through
`current_version_id` only after the snapshot and PDF have both succeeded.

`voice_recordings` remains the canonical recording entity. New nullable,
additive interview columns link an interview recording to the exact preparation
version. `voice_recording_chunks` stores durable audio segments. Event markers
are stored separately in `voice_recording_events` and are idempotent by
`(recording_id, event_id)`.

The dependency graph is deliberately one-way:

```text
mutable preparation --Ready--> immutable version --> PDF
                                            \----> interview recording
                                                     |--> chunks
                                                     |--> markers / notes
                                                     \--> transcript groups --> interview summary
```

Neither the PDF nor an interview recording reads a mutable question list.

## Data model and migration

One additive migration creates:

- `voice_interview_preparations`, with the status set `draft`, `ready`,
  `recording`, `completed`, and `canceled`; indexes on client, workflow run,
  status, and interview date.
- `voice_interview_preparation_versions`, unique on `(preparation_id, version_no)`.
- `voice_recording_chunks`, unique on `(recording_id, sequence)`.
- `voice_recording_events`, unique on `(recording_id, event_id)`.

It also adds nullable interview metadata to `voice_recordings`:
`recording_mode` (default `general`), preparation/version/client/workflow links,
interviewee, selected questions, question/highlight markers, field notes,
interview result, finalization time, and independent `audio_status` and
`analysis_status`. Existing rows retain their current general-recording behavior.

Preparation uses `draft` when a PDF fails and persists the failure text in an
additive `ready_error` column. This avoids presenting a failed PDF as ready
without expanding the requested status enum. Editing a ready preparation resets
it to `draft`, clears the current-version pointer only from the active view, and
keeps all historical versions and PDF files.

## Question template

`lib/voice/interview/templates.ts` exports one versioned template,
`doctor_brand_interview_v1` / version `1`, containing the exact 35 supplied
questions: 30 brand questions across six sections and five PhotoClinic feedback
questions. Template validation asserts unique question ids/numbers and exactly
30 brand plus five feedback questions.

The UI exposes section accordions and checkboxes, shows a 5–7 recommendation but
does not impose a maximum, and retains the user's selected order. A selected
question snapshot has `id`, `number`, `sectionId`, `sectionTitle`, `text`,
`order`, and `type` (`brand` or `feedback`).

## Preparation and ready flow

The Voice entry point offers distinct **일반 녹음** and **인터뷰 모드** options.
Interview mode lists standby and recent interviews and has **새 인터뷰 준비**.
The preparation editor collects hospital, interviewee, optional date, and only
explicitly chosen client/workflow links; it does not guess either relation.

The user selects questions, reviews/reorders only selected questions, then clicks
**준비 완료**. The server atomically validates inputs, creates the next immutable
snapshot, renders the PDF, uploads it to the private
`voice-interview-documents` bucket at
`{preparationId}/version-{NNN}/interview-questions.pdf`, and finally updates the
preparation to `ready` with its new `current_version_id`. If any PDF step fails,
the preparation stays `draft`, records the server error, and offers **PDF 다시
생성**. Older version rows/files are never overwritten or deleted.

PDF previews and downloads use the same HTML builder. Downloads use a short-lived
signed URL and a sanitized Korean filename. The renderer is Playwright Core plus
`@sparticuz/chromium`, with `page.pdf`, `printBackground`, A4 portrait,
zero margins, and CSS page size. The Vercel trace include is extended only for
`/api/voice/interviews/**`.

## PDF layout

For 5–7 questions the renderer creates exactly four print pages:

1. PhotoClinic logo, title, subtitle, and a compact interview-information card.
2. Exactly the selected questions, in snapshot order, with number/section/text.
3. The three prescribed interview guidance blocks.
4. A completely white closing page containing only the current PhotoClinic logo
   and the two exact supplied Korean lines.

The logo asset will be visually verified before implementation and the existing
current PhotoClinic logo asset will be used; no guessed legacy orange-camera asset
will be substituted. Questions above seven may create additional question pages
rather than shrinking type to force them onto page two.

## Interview recorder and durability

Starting an interview loads `current_version_id` and immediately enters a
mobile-first recorder. It does not show the mutable question-picker. The UI
shows REC, timer, question position/text, waveform, previous/next, manual
highlight, follow-up, field note, pause, and guarded end controls.

The existing MediaRecorder, Wake Lock, visibility handling, `pagehide`, and
`beforeunload` protections are reused. Interview mode keeps one MediaStream but
rotates a recorder segment every four minutes. Each segment receives a sequence
number and must be signed-uploaded to the existing private voice audio bucket,
then persisted in `voice_recording_chunks`, before its sequence is considered
uploaded. The UI treats this as one continuous recording. Segment size is capped
below the existing 25 MB limit.

On reload, local recovery stores only the preparation/version/recording identity,
current sequence, uploaded sequences, snapshot questions, markers, highlights,
and field notes. Recovery never sends a completed sequence again. Ending requires
confirmation, final-segment upload, chunk sequence validation, and marker-event
validation before assigning `audio_status = stored`. Missing chunks leave the
recording incomplete and display the exact reason.

## Events, transcript, and results

Moving to a main question creates a `question_started` event. Manual highlights,
follow-up questions, and field notes are separate events; AI never creates a
user-highlight. Events are posted idempotently with a client event id.

Chunk transcription continues to use `gpt-4o-transcribe-diarize` and offsets each
chunk timeline by `start_seconds`. Existing primary-speaker reference handling and
speaker rename remain available. No uncertain speaker is auto-named as the
interviewee.

`groupTranscript.ts` groups transcript segments by explicit question-marker
intervals, not AI guessing. The interview-specific summarizer produces structured
brand core, keywords, per-question answers, and PhotoClinic feedback. Unanswered
questions receive an empty summary and no quotes. Every displayed key quote is a
verbatim transcript excerpt, with manual-highlight windows considered first.
AI/Hermes failure preserves chunks, snapshots, events, notes, and transcript and
offers a retry rather than deleting the recording.

The detail UI adds question answers, brand core, full conversation, and field
notes; playback maps a global timestamp to the relevant chunk and local seek
offset, without exposing chunks to the user. A photographer impression remains
user authored; AI may only refine text the user supplied.

## API boundary

Preparation endpoints are `GET/POST /api/voice/interviews/preparations`,
`GET/PATCH /api/voice/interviews/preparations/[id]`,
`POST /api/voice/interviews/preparations/[id]/ready`, and
`GET /api/voice/interviews/preparations/[id]/pdf`. Existing sessions gain
interview-aware creation, idempotent event posting, chunk upload, and finalization
endpoints. Each API returns the server's specific error text; no client silently
converts a failed save/AI operation into success.

## Delivery slices and verification

1. Template/types and pure tests.
2. Migration, preparation/version API, ready state, and tests.
3. Desktop/tablet/mobile preparation, selection/order, and standby UI.
4. Native PDF renderer, storage, preview/download, and four-page tests.
5. Interview recorder controls, event persistence, and normal recorder regression.
6. Segmented upload, recovery, finalization validation, and 25 MB tests.
7. Diarized timeline merge, deterministic question grouping, interview summary,
   and result UI.

Every slice runs targeted tests before proceeding. The completed work runs
`npm run typecheck`, `npm test`, and `npm run build`; existing tests are neither
deleted nor skipped. Browser checks cover desktop, tablet, and iPhone layouts,
plus the complete ready-to-record workflow and general-mode regression.

## Acceptance checks

- A seven-question ready preparation creates version 1, PDF storage, and a
  `current_version_id`; PDF questions and recorder questions are byte-for-byte
  equivalent snapshot data and order.
- Editing a ready preparation preserves version 1/PDF, returns to draft, and a
  new ready action creates version 2/PDF.
- A 20-minute four-minute recording produces chunks 0–4, and recovery after chunk
  2 does not re-upload 0–2.
- Markers at 10, 120, and 280 seconds group Q1/Q2/Q3 as 10–120, 120–280, and
  280–duration.
- A failed transcribe/summary leaves confirmed audio retrievable and marks only
  analysis as failed.
