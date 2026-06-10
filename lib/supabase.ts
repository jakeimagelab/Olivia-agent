import { createClient } from "@supabase/supabase-js";

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const svc  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// 클라이언트 (브라우저)
export const supabase = createClient(url, anon);

// 서버 전용 (Cron, API Route)
export const supabaseAdmin = createClient(url, svc);
