import { supabase } from '../lib/supabaseClient';
import { getCurrentUser } from '../services/authService';

const TABLE_NAME = 'daily_reflections';
const PAGE_SIZE = 1000;

async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user?.id) {
    throw new Error('회고 저장을 사용하려면 로그인이 필요합니다.');
  }
  return user;
}

export async function getDailyReflections() {
  const user = await requireCurrentUser();
  const rows = [];
  let page = [];
  let pageStart = 0;

  do {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('reflection_date, content')
      .eq('user_id', user.id)
      .order('reflection_date', { ascending: false })
      .range(pageStart, pageStart + PAGE_SIZE - 1);

    if (error) {
      console.error('Failed to load daily reflections from Supabase:', error);
      throw error;
    }

    page = data || [];
    rows.push(...page);
    pageStart += page.length;
  } while (page.length > 0);

  return rows;
}

export async function upsertDailyReflection(reflectionDate, content) {
  const user = await requireCurrentUser();
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .upsert({
      user_id: user.id,
      reflection_date: reflectionDate,
      content,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,reflection_date' })
    .select('reflection_date, content')
    .single();

  if (error) {
    console.error('Failed to save daily reflection to Supabase:', error);
    throw error;
  }

  return data;
}

export async function deleteDailyReflection(reflectionDate) {
  const user = await requireCurrentUser();
  const { error } = await supabase
    .from(TABLE_NAME)
    .delete()
    .eq('user_id', user.id)
    .eq('reflection_date', reflectionDate);

  if (error) {
    console.error('Failed to delete daily reflection from Supabase:', error);
    throw error;
  }

  return { success: true };
}
