import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../lib/supabaseClient';
import { upsertDailyReflection } from './supabaseDailyReflectionRepository';

vi.mock('../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }));
vi.mock('../services/authService', () => ({
  getCurrentUser: vi.fn(async () => ({ id: 'reflection-user' })),
}));

let table;
let single;

beforeEach(() => {
  single = vi.fn(async () => ({ data: { reflection_date: '2020-01-01', content: 'Reflection' }, error: null }));
  const request = { select: vi.fn(() => ({ single })) };
  table = { insert: vi.fn(() => request), upsert: vi.fn(() => request) };
  supabase.from.mockReturnValue(table);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('reflection persistence', () => {
  it('inserts a new reflection so an existing date cannot be overwritten', async () => {
    await upsertDailyReflection('2020-01-01', 'Reflection', { createOnly: true });
    expect(table.insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'reflection-user', reflection_date: '2020-01-01', content: 'Reflection',
    }));
    expect(table.upsert).not.toHaveBeenCalled();
  });

  it('updates the single record for the user and date when editing', async () => {
    await upsertDailyReflection('2020-01-01', 'Reflection', { createOnly: false });
    expect(table.upsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'reflection-user', reflection_date: '2020-01-01', content: 'Reflection',
    }), { onConflict: 'user_id,reflection_date' });
    expect(table.insert).not.toHaveBeenCalled();
  });

  it('surfaces a duplicate date conflict without falling back to an overwrite', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const conflict = { code: '23505' };
    single.mockResolvedValueOnce({ data: null, error: conflict });
    await expect(upsertDailyReflection('2020-01-01', 'Reflection', { createOnly: true })).rejects.toEqual(conflict);
    expect(table.upsert).not.toHaveBeenCalled();
  });
});
