update public.per_settings
set reward_rate = 0.025,
    updated_at = now();

notify pgrst, 'reload schema';
