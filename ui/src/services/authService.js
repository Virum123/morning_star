import { supabase } from "../lib/supabaseClient";

/**
 * 이메일/비밀번호 회원가입
 */
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return data;
}

/**
 * 이메일/비밀번호 로그인
 */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return data;
}

/**
 * 비밀번호 재설정 메일 발송
 */
export async function requestPasswordReset(email) {
  const isWebUrl = ["http:", "https:"].includes(window.location.protocol);
  const options = isWebUrl
    ? { redirectTo: `${window.location.origin}${window.location.pathname}` }
    : undefined;
  const { error } = await supabase.auth.resetPasswordForEmail(email, options);

  if (error) {
    throw error;
  }
}

/**
 * 비밀번호 재설정 링크로 인증된 사용자의 비밀번호 변경
 */
export async function updatePassword(password) {
  const { data, error } = await supabase.auth.updateUser({ password });

  if (error) {
    throw error;
  }

  return data;
}

/**
 * 로그아웃
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}

/**
 * 현재 로그인한 사용자 가져오기
 */
export async function getCurrentUser() {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  if (!session) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  return data.user;
}

/**
 * 로그인 상태 변화 감지
 */
export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user ?? null, event);
  });

  return data.subscription;
}
