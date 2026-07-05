-- select_gallery 타입 추가: 프론트엔드(app/mailing/page.tsx TYPE_LABELS,
-- app/api/select-galleries/[id]/send-mail/route.ts)는 이미 이 타입을 쓰고 있었는데
-- mailing_queue의 체크 제약에는 빠져 있어서 "셀렉 갤러리 메일 보내기"가 계속 실패하고 있었다.
alter table public.mailing_queue
  drop constraint if exists mailing_queue_type_check;

alter table public.mailing_queue
  add constraint mailing_queue_type_check check (type in (
    'quote','contract','conti','proposal','original_files','gallery',
    'review_form','monthly_report',
    'per_report','per_order','per_donation',
    'portal_notification','select_gallery'
  ));
