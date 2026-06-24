-- calendar_tasks 테이블에 end_time 컬럼 추가
ALTER TABLE calendar_tasks
  ADD COLUMN IF NOT EXISTS end_time text;
