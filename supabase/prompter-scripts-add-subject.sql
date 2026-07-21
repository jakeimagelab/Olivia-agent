-- 편집 화면에 "촬영대상" 필드가 추가되면서 필요해진 컬럼. 기존 대본 행은 빈 문자열로 채워진다.
alter table public.prompter_scripts add column if not exists subject text not null default '';

notify pgrst, 'reload schema';
