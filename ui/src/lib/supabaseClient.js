import { createClient } from "@supabase/supabase-js"

const supabaseURL = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseURL || ! supabaseAnonKey) {
    throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
}

export const supabase = createClient(supabaseURL, supabaseAnonKey);