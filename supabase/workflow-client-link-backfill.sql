-- 실행 전: select count(*) from workflow_runs w left join clients c on c.id = w.client_id
--          where w.client_name <> '' and c.id is null;  ← 몇 건인지 먼저 확인 추천

-- 1) 이름이 정확히 같은 기존 고객으로 재연결
update public.workflow_runs w
set client_id = c.id
from public.clients c
where (w.client_id is null or not exists (select 1 from public.clients cc where cc.id = w.client_id))
  and w.client_name <> ''
  and lower(regexp_replace(c.hospital_name, '\s+', '', 'g')) = lower(regexp_replace(w.client_name, '\s+', '', 'g'));

-- 2) 그래도 남은 건(매칭되는 고객이 아예 없던 경우) 새로 생성 후 연결
with missing as (
  select w.id as run_id, w.client_name
  from public.workflow_runs w
  where (w.client_id is null or not exists (select 1 from public.clients cc where cc.id = w.client_id))
    and w.client_name <> ''
),
created as (
  insert into public.clients (hospital_name)
  select distinct client_name from missing
  returning id, hospital_name
)
update public.workflow_runs w
set client_id = created.id
from missing, created
where w.id = missing.run_id
  and lower(regexp_replace(created.hospital_name, '\s+', '', 'g')) = lower(regexp_replace(missing.client_name, '\s+', '', 'g'));

-- 확인
select id, client_name, client_id from public.workflow_runs where client_id is null and client_name <> '';
