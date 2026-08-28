import {
  deleteDailyReflection,
  getDailyReflections as getSupabaseDailyReflections,
  upsertDailyReflection,
} from '../repositories/supabaseDailyReflectionRepository';
import { appTodayDate, localDateFromStr, localDateStr } from '../utils/date';

export const DAILY_REFLECTION_MAX_LENGTH = 1000;

export function normalizeDailyReflections(rows = []) {
  if (!Array.isArray(rows)) return {};

  return rows.reduce((normalized, row) => {
    const dateStr = row?.reflection_date;
    const content = row?.content;
    if (!localDateFromStr(dateStr) || typeof content !== 'string') return normalized;

    const limitedContent = Array.from(content).slice(0, DAILY_REFLECTION_MAX_LENGTH).join('');
    if (limitedContent.trim()) {
      normalized[dateStr] = limitedContent;
    }
    return normalized;
  }, {});
}

export async function getDailyReflections() {
  const rows = await getSupabaseDailyReflections();
  return normalizeDailyReflections(rows);
}

export async function saveDailyReflection(dateStr, content) {
  if (!localDateFromStr(dateStr)) {
    throw new Error('회고 날짜가 올바르지 않습니다.');
  }
  if (dateStr > localDateStr(appTodayDate())) {
    throw new Error('미래 날짜에는 회고를 저장할 수 없습니다.');
  }

  const reflection = typeof content === 'string' ? content : String(content || '');
  if (Array.from(reflection).length > DAILY_REFLECTION_MAX_LENGTH) {
    throw new Error('회고는 1000자 이내로 작성해 주세요.');
  }

  if (reflection.trim()) {
    const savedReflection = await upsertDailyReflection(dateStr, reflection);
    return savedReflection?.content || reflection;
  }

  await deleteDailyReflection(dateStr);
  return null;
}
