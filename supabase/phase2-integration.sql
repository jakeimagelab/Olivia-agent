-- Phase 2: 워크플로우 중심 통합 스키마 확장
-- 각 블록이 독립적으로 실행되어 한 곳에서 실패해도 나머지는 계속 진행됩니다.
-- 실행 순서: workflow-agent.sql → phase2-integration.sql

-- ─────────────────────────────────────────────────────────────
-- 1. client_portal_events: 워크플로우 컬럼 추가
-- ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.client_portal_events
    ADD COLUMN IF NOT EXISTS workflow_run_id   uuid,
    ADD COLUMN IF NOT EXISTS workflow_step_key text NOT NULL DEFAULT '';
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'client_portal_events 테이블 없음 - 건너뜀';
END $$;

DO $$ BEGIN
  ALTER TABLE public.client_portal_events
    ADD CONSTRAINT fk_cpe_workflow_run
    FOREIGN KEY (workflow_run_id) REFERENCES public.workflow_runs(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_cpe_workflow_run
    ON public.client_portal_events(workflow_run_id);
EXCEPTION WHEN undefined_table OR undefined_column THEN
  RAISE NOTICE 'client_portal_events 인덱스 생성 건너뜀';
END $$;

-- ─────────────────────────────────────────────────────────────
-- 2. mailing_queue: 워크플로우/고객/태스크 연결 컬럼 추가
-- ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.mailing_queue
    ADD COLUMN IF NOT EXISTS client_id         uuid,
    ADD COLUMN IF NOT EXISTS scheduled_at      timestamptz,
    ADD COLUMN IF NOT EXISTS workflow_run_id   uuid,
    ADD COLUMN IF NOT EXISTS workflow_step_key text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS agent_task_id     uuid,
    ADD COLUMN IF NOT EXISTS approval_id       uuid;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'mailing_queue 테이블 없음 - 건너뜀';
END $$;

DO $$ BEGIN
  ALTER TABLE public.mailing_queue
    ADD CONSTRAINT fk_mq_client
      FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_mq_workflow_run
      FOREIGN KEY (workflow_run_id) REFERENCES public.workflow_runs(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_mq_agent_task
      FOREIGN KEY (agent_task_id) REFERENCES public.agent_tasks(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_mq_approval
      FOREIGN KEY (approval_id) REFERENCES public.agent_approvals(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_mq_client       ON public.mailing_queue(client_id);
  CREATE INDEX IF NOT EXISTS idx_mq_workflow_run ON public.mailing_queue(workflow_run_id);
  CREATE INDEX IF NOT EXISTS idx_mq_agent_task   ON public.mailing_queue(agent_task_id);
EXCEPTION WHEN undefined_table OR undefined_column THEN
  RAISE NOTICE 'mailing_queue 인덱스 생성 건너뜀';
END $$;

-- ─────────────────────────────────────────────────────────────
-- 3. agent_tasks: 출처 컬럼 추가
-- ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.agent_tasks
    ADD COLUMN IF NOT EXISTS source           text NOT NULL DEFAULT 'system',
    ADD COLUMN IF NOT EXISTS portal_target_id text NOT NULL DEFAULT '';
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'agent_tasks 테이블 없음 - 건너뜀';
END $$;

-- ─────────────────────────────────────────────────────────────
-- 4. agent_logs: 출처 컬럼 추가
-- ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.agent_logs
    ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'system';
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'agent_logs 테이블 없음 - 건너뜀';
END $$;

-- ─────────────────────────────────────────────────────────────
-- 5. workflow_runs: 인덱스 추가
-- ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS workflow_runs_updated_idx
    ON public.workflow_runs(updated_at DESC);
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'workflow_runs 테이블 없음 - 건너뜀';
END $$;

-- ─────────────────────────────────────────────────────────────
-- 6. clients: workflow_status 컬럼 추가
-- ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS workflow_status text NOT NULL DEFAULT '상담완료';
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'clients 테이블 없음 - 건너뜀';
END $$;
