-- PER 포인트 백필 스크립트 (1회성 데이터 복구, 스키마 변경 없음)
--
-- 원인: lib/workflowAutomation.ts의 ensureRewardTransaction()에 남아있는 주석에서 확인된 대로,
-- 예전 코드는 reward_transactions 테이블에만 직접 insert하고 clients 테이블의
-- available_points / total_earned_points / total_paid_amount / per_joined 는 갱신하지 않던
-- 버그가 있었다. 이후 lib/per.ts의 addPoints()/deductPoints()로 교체되어 신규 적립/사용 건은
-- 정상 반영되지만, 그 버그가 있던 시절에 쌓인 reward_transactions 기록은 clients 테이블에
-- 소급 반영되지 않은 채로 남아있어 "PER 포인트가 있어야 하는데 안 보인다"는 증상이 나타난다.
--
-- 이 스크립트는 reward_transactions을 기준(source of truth)으로 clients 테이블의
-- 누적 포인트/등급/가입 여부를 다시 계산해서 맞춰준다. 여러 번 실행해도 안전하다(idempotent).

with agg as (
  select
    client_id,
    sum(points)                                                    as net_points,
    sum(points) filter (where points > 0)                          as earned_points,
    sum(-points) filter (where type = 'use')                       as used_points,
    sum(-points) filter (where type = 'donate')                    as donated_points,
    sum(amount) filter (where type = 'earn')                       as paid_amount,
    min(created_at)                                                as first_tx_at
  from public.reward_transactions
  group by client_id
)
update public.clients c
set
  available_points     = greatest(coalesce(agg.net_points, 0), 0),
  total_earned_points   = coalesce(agg.earned_points, 0),
  total_used_points     = coalesce(agg.used_points, 0),
  total_donated_points  = coalesce(agg.donated_points, 0),
  total_paid_amount     = greatest(c.total_paid_amount, coalesce(agg.paid_amount, 0)),
  reward_tier = case
    when coalesce(agg.earned_points, 0) >= 500000 then 'vip'
    when coalesce(agg.earned_points, 0) >= 200000 then 'gold'
    when coalesce(agg.earned_points, 0) >= 50000  then 'silver'
    else 'standard'
  end,
  per_joined    = true,
  per_joined_at = coalesce(c.per_joined_at, agg.first_tx_at)
from agg
where c.id = agg.client_id
  and (
    c.per_joined is distinct from true
    or c.available_points     is distinct from greatest(coalesce(agg.net_points, 0), 0)
    or c.total_earned_points  is distinct from coalesce(agg.earned_points, 0)
    or c.total_used_points    is distinct from coalesce(agg.used_points, 0)
    or c.total_donated_points is distinct from coalesce(agg.donated_points, 0)
  );

-- 실행 후 확인용: 백필 대상이었던 고객 목록 조회
-- select hospital_name, per_joined, available_points, total_earned_points, reward_tier
-- from public.clients
-- where id in (select client_id from public.reward_transactions)
-- order by available_points desc;
