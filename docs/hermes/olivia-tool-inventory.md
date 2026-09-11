# Olivia OS → Hermes Tool Inventory

이 문서는 `lib/olivia/v2/toolExecutors/*`의 실제 executor와 Hermes MCP 노출 상태를 함께 기록한다. Hermes는 공개 이름만 사용하며, 내부 이름은 Olivia Web/OS와 공유하는 실행 경로다.

| Domain | Olivia executor tools | Hermes MCP exposure | Policy / reason |
|---|---|---|---|
| Client | `select_project`, `client_get`, `client_create`, `client_update`, `memo_add`, `run_brand_diagnosis` | `client.search`, `client.get`, `client.create`, `client.update` | verified read/mutation만 공개. legacy `memo_add`와 진단 alias는 canonical Memo/Analysis 도구로 대체 |
| Agent operations / meetings | `get_today_briefing`, `get_urgent_insights`, `search_client_projects`, `get_project_status`, `list_pending_approvals`, `list_commitments`, `prepare_followup`, `manage_olivia_action`, `run_observer`, `check_recent_errors`, `generate_dev_request`, `list_upcoming_meetings`, `prepare_meeting_brief`, `analyze_meeting_memo`, `complete_meeting`, `get_meeting_followups`, `link_meeting_client` | 미공개 | 일부 조회가 DB 오류를 fallback 데이터로 숨기며, 일부는 외부/복합 mutation이다. domain별 상태·검증 계약 정규화 후 공개 |
| Calendar | `calendar_list`, `calendar_add`, `calendar_add_bulk`, `calendar_update`, `calendar_complete`, `calendar_delete`, `calendar_availability`, `calendar_list_month` | 동일 public names | 조회 및 read-back 검증 mutation 공개. 삭제는 기존 recoverable trash 사용 |
| Today Work | `work_list_today`, `work_create`, `work_complete` | `work.list_today`, `work.create`, `work.complete` | 일정과 별도 canonical 모델/검증 경로 |
| Quote | `create_quote`, `get_quote`, `start_quote_wizard`, `update_quote_item`, `add_quote_item`, `remove_quote_item`, `update_quote_note`, `update_quote_info`, `apply_quote_discount`, `update_quote_vat_mode`, `rebalance_quote_total`, `apply_quote_rebalance`, `preview_quote`, `request_quote_publish`, `download_quote_pdf`, `publish_quote`, `resolve_quote_client`, `link_new_client_to_quote` | `create_quote`, `get_quote`, `add_quote_item`, `update_quote_item`, `remove_quote_item`, `apply_quote_discount`, `preview_quote`, `request_quote_publish`, `publish_quote` | 핵심 verified 경로 공개. wizard/PDF/UI 및 보조 연결 작업은 기존 Olivia UI에 유지 |
| Contract | `create_contract`, `get_contract`, `preview_contract`, `update_contract_terms`, `request_contract_signature`, `request_contract_publish`, `publish_contract`, `download_contract_pdf` | `create_contract`, `get_contract`, `preview_contract`, `update_contract_terms`, `request_contract_publish`, `publish_contract` | 발행 전 승인 요청. 서명/PDF는 Desktop UI 전용 |
| Conti legacy | `get_conti_status`, `create_conti`, `add_conti_shots`, `update_conti_shot`, `remove_conti_shot`, `apply_remove_conti_shot`, `reorder_conti_shot`, `duplicate_conti_shot`, `estimate_conti_duration`, `generate_shoot_prep_from_conti` | 미공개 | `conti_saves` split-brain 방지. Hermes 확장 금지 |
| Conti V2 canonical | `create_conti_v2`, `get_conti_v2`, `update_conti_scene_v2`, `add_conti_scene_v2`, `request_remove_conti_scene_v2`, `remove_conti_scene_v2`, `reorder_conti_scene_v2`, `get_conti_field_view_v2`, `preview_conti_v2` | `create_conti`, `get_conti`, `update_conti_scene`, `add_conti_scene`, `remove_conti_scene`, `confirm_remove_conti_scene`, `reorder_conti_scene`, `get_conti_field_view`, `preview_conti` | Desktop canonical `conti_runs/groups/scenes`. 삭제는 request/confirm 분리 |
| Memo | `memo_create`, `memo_list`, `memo_search`, `memo_get`, `memo_update` | `memo.create`, `memo.list`, `memo.search`, `memo.get`, `memo.update` | canonical API/service 및 read-back 검증 |
| Analysis | `trend_analysis_run`, `trend_analysis_get_latest`, `trend_analysis_preview`, `brand_analysis_run`, `brand_analysis_get_latest`, `brand_analysis_preview` | dot-style 동일 기능 | 기존 분석 pipeline과 canonical result resource 사용 |
| Workflow | `get_workflow_status`, `list_active_workflows`, `advance_workflow_step`, `complete_workflow_retroactively`, `list_workflow_step_tasks`, `process_workflow_step`, `approve_workflow_task`, `link_document_to_client` | `workflow.list_active` | 안전한 전체 조회만 공개. 이름 기반 단일 선택과 legacy mutation의 ambiguity/read-back 검증 보완 전까지 보류 |
| Document | `open_feature`, `search_documents`, `get_recent_documents`, `open_document` | `ui.open_feature` | 화면 열기는 Desktop UI action. 문서 검색의 legacy `conti_saves` 의존을 제거하기 전 document open/search는 보류 |
| Gallery | `get_gallery`, `create_gallery`, `start_select_match_flow` | 미공개 | create self-fetch/legacy 결과 및 브라우저 File System API 의존 때문에 보류 |
| Mailing | `list_mailing_queue`, `send_mailing`, `apply_send_mailing`, `email_search`, `email_read`, `email_summarize`, `email_create_draft` | 미공개 | 외부 발송/개인정보가 포함된 sensitive domain. 승인 및 delivery verification 추가 후 공개 |
| Feature Record | `create_feature_record`, `update_feature_record`, `apply_feature_record_write` | 미공개 | 광범위 CRUD 승인 도구라 domain별 MCP가 우선 |
| Memory | `save_agent_memory`, `update_agent_memory`, `disable_agent_memory`, `list_agent_memories` | 미공개 | Primary Brain 장기 규칙 변경은 별도 권한/승인 정책 필요 |
| Task Session | `start_task_session`, `get_task_session_status`, `continue_task_session`, `pause_task_session` | 미공개 | 기존 agent-run session이며 새 resource Work Session과 혼동 방지를 위해 보류 |
| Photo Classification | `rename_photo_scene`, `merge_photo_scenes`, `split_photo_scene`, `start_ai_photo_classification`, `refine_photo_classification` | 미공개 | 열린 브라우저 File System 상태에 의존하는 Desktop-only UI action |
| Common UI | `show_workspace`, `maximize_active_window`, `close_active_window`, `minimize_active_window` | `ui.open_feature`만 공개 | `show_workspace`의 “최신 문서” 임의 선택 방지. 창 조작은 현재 Desktop UI 전용 유지 |

## Primary Brain boundary

- `OLIVIA_AGENT_ENGINE=hermes`인 텍스트 OS 요청은 Hermes가 판단하고 Olivia MCP를 실행한다.
- MCP는 executor/service를 호출하며 Supabase credential을 Hermes에 노출하지 않는다.
- Mutation 완료의 ground truth는 Hermes 문장이 아니라 MCP audit + verification이다.
- Work Session은 새 DB를 만들지 않고 canonical resource metadata로 구성한다.
- legacy/OpenAI 경로는 연결 전 장애의 rollback과 아직 Hermes에 열지 않은 브라우저 전용 기능을 위해 남아 있다. 새 Agent 판단 기능은 여기에 추가하지 않는다.
