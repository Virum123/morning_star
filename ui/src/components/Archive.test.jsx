// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Archive from './Archive';
import { getDailyReflections, saveDailyReflection } from '../services/dailyReflectionService';
import { getScheduleActivityLog, getSchedules } from '../services/scheduleService';
import { getAppDateContext } from '../utils/plannerData';

vi.mock('../services/dailyReflectionService', () => ({
  DAILY_REFLECTION_MAX_LENGTH: 1000,
  getDailyReflections: vi.fn(),
  saveDailyReflection: vi.fn(),
}));

vi.mock('../services/scheduleService', () => ({
  getSchedules: vi.fn(async () => ({ byDate: {}, yesterday: {} })),
  getScheduleActivityLog: vi.fn(async () => []),
}));

const { todayStr } = getAppDateContext();
let container;
let root;

const inputValue = async (element, value) => {
  await act(async () => {
    const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

const click = async (element) => act(async () => element.click());
const submit = async () => act(async () => {
  container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
});
const renderArchive = async () => act(async () => root.render(<Archive lang="en" />));

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  Element.prototype.scrollIntoView = vi.fn();
  getDailyReflections.mockResolvedValue({});
  getSchedules.mockResolvedValue({ byDate: {}, yesterday: {} });
  getScheduleActivityLog.mockResolvedValue([]);
  saveDailyReflection.mockImplementation(async (_date, content) => content);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('daily reflection editor and history', () => {
  it.each([
    ['schedule', getSchedules],
    ['activity log', getScheduleActivityLog],
  ])('shows reflections independently when the %s request fails and retries the history', async (_label, request) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    request.mockRejectedValueOnce(new Error('History unavailable'));
    getDailyReflections.mockResolvedValue({ [todayStr]: 'Reflection still available' });
    await renderArchive();

    expect(container.querySelector('.daily-reflection-content').textContent).toBe('Reflection still available');
    expect(container.querySelector('.archive-load-error').textContent).toContain('could not be loaded');
    await click(container.querySelector('.archive-load-error button'));
    expect(container.querySelector('.archive-load-error')).toBeNull();
    expect(container.querySelector('.daily-reflection-content').textContent).toBe('Reflection still available');
  });

  it('clears the editor after saving and shows the saved reflection without any schedule files', async () => {
    await renderArchive();
    await inputValue(container.querySelector('textarea'), 'A small step forward.');
    await submit();

    expect(saveDailyReflection).toHaveBeenCalledWith(todayStr, 'A small step forward.', { createOnly: true });
    expect(container.querySelector('textarea').value).toBe('');
    expect(container.querySelector('.daily-reflection-content').textContent).toBe('A small step forward.');
    expect(container.querySelector('[type="submit"]').disabled).toBe(true);
    await submit();
    expect(saveDailyReflection).toHaveBeenCalledTimes(1);
  });

  it('opens saved text only for explicit editing and clears it again after saving changes', async () => {
    getDailyReflections.mockResolvedValue({ [todayStr]: 'Original reflection' });
    await renderArchive();

    expect(container.querySelector('textarea').value).toBe('');
    expect(container.querySelector('textarea').readOnly).toBe(true);
    await click(container.querySelector('.daily-reflection-entry button'));
    expect(container.querySelector('textarea').value).toBe('Original reflection');
    expect(container.querySelector('textarea').readOnly).toBe(false);
    await inputValue(container.querySelector('textarea'), 'Updated reflection');
    await submit();

    expect(saveDailyReflection).toHaveBeenCalledWith(todayStr, 'Updated reflection', { createOnly: false });
    expect(container.querySelectorAll('.daily-reflection-entry')).toHaveLength(1);
    expect(container.querySelector('.daily-reflection-content').textContent).toBe('Updated reflection');
    expect(container.querySelector('textarea').value).toBe('');
  });

  it('preserves the draft after a failed save and lets the user retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    saveDailyReflection.mockRejectedValueOnce(new Error('Offline'));
    await renderArchive();
    await inputValue(container.querySelector('textarea'), 'Keep this draft');
    await submit();

    expect(container.querySelector('textarea').value).toBe('Keep this draft');
    expect(container.querySelector('[role="status"]').textContent).toContain('Could not save');
    expect(container.querySelectorAll('.daily-reflection-entry')).toHaveLength(0);
    expect(container.querySelector('[type="submit"]').disabled).toBe(false);
    await submit();
    expect(container.querySelector('.daily-reflection-content').textContent).toBe('Keep this draft');
  });

  it('keeps separate drafts when changing dates and filters the saved history by date', async () => {
    getDailyReflections.mockResolvedValue({ '2020-01-01': 'First day', '2020-01-02': 'Second day' });
    await renderArchive();
    await inputValue(container.querySelector('textarea'), 'Today draft');
    await inputValue(container.querySelector('form input[type="date"]'), '2020-01-03');
    expect(container.querySelector('textarea').value).toBe('');
    await inputValue(container.querySelector('textarea'), 'Another day draft');
    await inputValue(container.querySelector('form input[type="date"]'), todayStr);
    expect(container.querySelector('textarea').value).toBe('Today draft');

    await inputValue(container.querySelector('.daily-reflection-history input'), '2020-01-02');
    expect(container.querySelectorAll('.daily-reflection-entry')).toHaveLength(1);
    expect(container.querySelector('.daily-reflection-content').textContent).toBe('Second day');
    await click(container.querySelector('.daily-reflection-history-filter button'));
    expect(container.querySelectorAll('.daily-reflection-entry')).toHaveLength(2);
  });

  it('locks the draft and date during a save and ignores duplicate submissions', async () => {
    let finishSave;
    saveDailyReflection.mockImplementationOnce(() => new Promise((resolve) => { finishSave = resolve; }));
    await renderArchive();
    await inputValue(container.querySelector('textarea'), 'Only save once');
    await submit();
    await submit();

    expect(saveDailyReflection).toHaveBeenCalledTimes(1);
    expect(container.querySelector('textarea').disabled).toBe(true);
    expect(container.querySelector('form input[type="date"]').disabled).toBe(true);
    await act(async () => finishSave('Only save once'));
    expect(container.querySelector('textarea').value).toBe('');
  });

  it('keeps the draft and loads the existing record when another session saves the same date', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    saveDailyReflection.mockRejectedValueOnce({ code: '23505' });
    await renderArchive();
    getDailyReflections.mockResolvedValue({ [todayStr]: 'Saved in another tab' });
    await inputValue(container.querySelector('textarea'), 'My unsaved draft');
    await submit();

    expect(container.querySelector('textarea').value).toBe('My unsaved draft');
    expect(container.querySelector('textarea').readOnly).toBe(true);
    expect(container.querySelector('.daily-reflection-content').textContent).toBe('Saved in another tab');
    expect(container.querySelector('[role="status"]').textContent).toContain('already exists');
    await submit();
    expect(saveDailyReflection).toHaveBeenCalledTimes(1);
  });
});
