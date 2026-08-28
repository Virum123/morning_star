import { supabase } from '../lib/supabaseClient';
import { getCurrentUser } from '../services/authService';

const TABLE_NAME = 'schedule_items';

async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user?.id) {
    throw new Error('일정 저장을 사용하려면 로그인이 필요합니다.');
  }
  return user;
}

function compactSchedulePayload(input = {}) {
  const payload = {
    title: input.title,
    memo: input.memo,
    start_at: input.start_at || input.startAt,
    bucket: input.bucket,
    item_type: input.item_type || input.itemType,
    status: input.status,
    deleted_at: input.deleted_at,
  };

  if ('end_at' in input || 'endAt' in input) {
    payload.end_at = input.end_at ?? input.endAt ?? null;
  }

  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) {
      delete payload[key];
    }
  });

  return payload;
}

export async function getSchedules() {
  const user = await requireCurrentUser();

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('start_at', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to load schedules from Supabase:', error);
    throw error;
  }

  return data || [];
}

export async function getDeletedSchedules() {
  const user = await requireCurrentUser();

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('user_id', user.id)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });

  if (error) {
    console.error('Failed to load deleted schedules from Supabase:', error);
    throw error;
  }

  return data || [];
}

export async function createSchedule(input = {}) {
  const user = await requireCurrentUser();
  const payload = compactSchedulePayload(input);

  if (!payload.title) {
    throw new Error('일정 제목이 필요합니다.');
  }

  if (!payload.start_at) {
    throw new Error('일정 시작 시간이 필요합니다.');
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert({
      ...payload,
      user_id: user.id,
      item_type: payload.item_type || 'task',
      status: payload.status || 'active',
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create schedule in Supabase:', error);
    throw error;
  }

  return data;
}

export async function updateSchedule(id, patch = {}) {
  const user = await requireCurrentUser();
  if (!id) {
    throw new Error('수정할 일정 id가 필요합니다.');
  }

  const payload = compactSchedulePayload(patch);
  delete payload.deleted_at;

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update(payload)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    console.error('Failed to update schedule in Supabase:', error);
    throw error;
  }

  return data;
}

export async function deleteSchedule(id, { showInTrash = true } = {}) {
  const user = await requireCurrentUser();
  if (!id) {
    throw new Error('삭제할 일정 id가 필요합니다.');
  }

  if (!showInTrash) {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Failed to permanently delete schedule from Supabase:', error);
      throw error;
    }

    return data;
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    console.error('Failed to soft delete schedule in Supabase:', error);
    throw error;
  }

  return data;
}

export async function restoreSchedule(id) {
  const user = await requireCurrentUser();
  if (!id) {
    throw new Error('복원할 일정 id가 필요합니다.');
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update({ deleted_at: null })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    console.error('Failed to restore schedule in Supabase:', error);
    throw error;
  }

  return data;
}

export async function emptyDeletedSchedules() {
  const user = await requireCurrentUser();

  const { error } = await supabase
    .from(TABLE_NAME)
    .delete()
    .eq('user_id', user.id)
    .not('deleted_at', 'is', null);

  if (error) {
    console.error('Failed to permanently delete schedules from Supabase:', error);
    throw error;
  }

  return { success: true };
}
