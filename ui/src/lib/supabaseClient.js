import { createClient } from "@supabase/supabase-js"

const supabaseURL = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const AUTH_STORAGE_MODE_KEY = "morning-star-auth-storage-mode";

if (!supabaseURL || ! supabaseAnonKey) {
    throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
}

function getSelectedAuthStorage() {
    return localStorage.getItem(AUTH_STORAGE_MODE_KEY) === "session"
        ? sessionStorage
        : localStorage;
}

const authStorage = {
    getItem(key) {
        return getSelectedAuthStorage().getItem(key);
    },
    setItem(key, value) {
        const selectedStorage = getSelectedAuthStorage();
        const otherStorage = selectedStorage === localStorage ? sessionStorage : localStorage;
        otherStorage.removeItem(key);
        selectedStorage.setItem(key, value);
    },
    removeItem(key) {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
    },
};

export function getRememberLoginPreference() {
    return localStorage.getItem(AUTH_STORAGE_MODE_KEY) !== "session";
}

export function setRememberLoginPreference(rememberLogin) {
    localStorage.setItem(AUTH_STORAGE_MODE_KEY, rememberLogin ? "local" : "session");
}

export const supabase = createClient(supabaseURL, supabaseAnonKey, {
    auth: {
        persistSession: true,
        storage: authStorage,
    },
});
