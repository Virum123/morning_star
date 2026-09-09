// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Archive from './Archive';
import { getDailyReflections, saveDailyReflection } from '../services/dailyReflectionService';
import { getSchedules } from '../services/scheduleService';
import { getAppDateContext } from '../utils/plannerData';

vi.mock('../services/dailyReflectionService', () => ({
  DAILY_REFLECTION_MAX_LENGTH: 1000,
  getDailyReflections: vi.fn(),
  saveDailyReflection: vi.fn(),
}));

vi.mock('../services/scheduleService', () => ({
  getSchedules: vi.fn(async () => ({ byDate: {}, yesterday: {} })),
}));

const { todayStr, tomorrowStr } = getAppDateContext();
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
const dateEntry = (date) => container.querySelector(`.accordion-item[data-date="${date}"]`);
const openDate = async (date) => {
  const header = dateEntry(date).querySelector('.accordion-header');
  if (header.getAttribute('aria-expanded') !== 'true') await click(header);
  return dateEntry(date);
};
const schedule = (date, content) => ({
  filename: `${date} plan`,
  path: `${date}-plan`,
  added_date: `${date} 09:00:00`,
  content,
});

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  Element.prototype.scrollIntoView = vi.fn();
  getDailyReflections.mockResolvedValue({});
  getSchedules.mockResolvedValue({ byDate: {}, yesterday: {} });
  saveDailyReflection.mockImplementation(async (_date, content) => content);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('daily reflection editor and history', () => {
  it('places the editor before one collapsed list of schedule and reflection dates, newest first', async () => {
    getSchedules.mockResolvedValue({
      today: [schedule(todayStr, '- [ ] Today task')],
      tomorrow: [schedule(tomorrowStr, '- [ ] Tomorrow task')],
      byDate: {
        '2020-01-01': [schedule('2020-01-01', '- [x] Past task')],
        '2020-01-03': [],
      },
    });
    getDailyReflections.mockResolvedValue({ '2020-01-02': 'A day with only a reflection' });
    await renderArchive();

    expect(container.querySelectorAll('.accordion-list')).toHaveLength(1);
    expect(Array.from(container.querySelectorAll('.accordion-item'), (entry) => entry.dataset.date))
      .toEqual([tomorrowStr, todayStr, '2020-01-02', '2020-01-01']);
    const editor = container.querySelector('form');
    const list = container.querySelector('.accordion-list');
    expect(editor.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const header of container.querySelectorAll('.accordion-header')) {
      expect(header.getAttribute('aria-expanded')).toBe('false');
      expect(header.getAttribute('aria-controls')).toBeTruthy();
    }
    expect(container.querySelector('.accordion-body')).toBeNull();
    expect(container.querySelector('.review-overview, .archive-tabs-nav, .daily-reflection-history-filter')).toBeNull();

    const reflectionOnlyDay = await openDate('2020-01-02');
    expect(reflectionOnlyDay.querySelector('.daily-reflection-content').textContent)
      .toBe('A day with only a reflection');
    expect(reflectionOnlyDay.querySelector('.archive-task-row')).toBeNull();
    const today = await openDate(todayStr);
    expect(today.querySelector('.archive-task-list').textContent).toContain('Today task');
    const tomorrow = await openDate(tomorrowStr);
    expect(tomorrow.querySelector('.archive-task-list').textContent).toContain('Tomorrow task');
    expect(tomorrow.querySelector('.daily-reflection-entry button')).toBeNull();
  });

  it('opens each date with its reflection above completed and unfinished schedule records', async () => {
    getSchedules.mockResolvedValue({
      byDate: {
        '2020-01-01': [schedule('2020-01-01', '- [ ] First day task')],
        '2020-01-02': [schedule('2020-01-02', '- [x] Finished task\n- [ ] Unfinished task')],
      },
    });
    getDailyReflections.mockResolvedValue({ '2020-01-01': 'First day reflection', '2020-01-02': 'Second day reflection' });
    await renderArchive();

    const secondDay = await openDate('2020-01-02');
    const reflection = secondDay.querySelector('.daily-reflection-entry');
    const scheduleSummary = secondDay.querySelector('.archive-date-summary');
    const header = secondDay.querySelector('.accordion-header');
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(header.getAttribute('aria-controls'))).toBe(secondDay.querySelector('.accordion-body'));
    expect(reflection.querySelector('.daily-reflection-content').textContent).toBe('Second day reflection');
    expect(reflection.compareDocumentPosition(scheduleSummary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const taskRows = Array.from(scheduleSummary.querySelectorAll('.archive-task-row'));
    expect(taskRows).toHaveLength(2);
    expect(taskRows.find((row) => row.textContent === 'Finished task').querySelector('.archive-task-icon.done')).not.toBeNull();
    expect(taskRows.find((row) => row.textContent === 'Unfinished task').querySelector('.archive-task-icon.done')).toBeNull();
    expect(secondDay.textContent).not.toContain('First day');
    expect(dateEntry('2020-01-01').querySelector('.accordion-body')).toBeNull();

    await click(header);
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(secondDay.querySelector('.accordion-body')).toBeNull();
  });

  it('starts a missing reflection from a schedule date and opens that date after saving', async () => {
    getSchedules.mockResolvedValue({ byDate: { '2020-01-01': [schedule('2020-01-01', '- [x] Past task')] } });
    await renderArchive();
    await inputValue(container.querySelector('textarea'), 'Today draft');
    const pastDay = await openDate('2020-01-01');
    expect(pastDay.querySelector('.daily-reflection-content')).toBeNull();
    await click(pastDay.querySelector('.daily-reflection-entry button'));
    expect(container.querySelector('form input[type="date"]').value).toBe('2020-01-01');
    expect(container.querySelector('textarea').value).toBe('');
    await inputValue(container.querySelector('textarea'), 'Past day reflection');
    await click(pastDay.querySelector('.accordion-header'));
    await submit();

    expect(saveDailyReflection).toHaveBeenCalledWith('2020-01-01', 'Past day reflection', { createOnly: true });
    expect(dateEntry('2020-01-01').querySelector('.accordion-header').getAttribute('aria-expanded')).toBe('true');
    expect(dateEntry('2020-01-01').querySelector('.daily-reflection-content').textContent).toBe('Past day reflection');
    expect(container.querySelector('textarea').value).toBe('');
    await inputValue(container.querySelector('form input[type="date"]'), todayStr);
    expect(container.querySelector('textarea').value).toBe('Today draft');
  });

  it('shows reflections independently when the schedule request fails and retries the history', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getSchedules.mockRejectedValueOnce(new Error('History unavailable'));
    getDailyReflections.mockResolvedValue({ [todayStr]: 'Reflection still available' });
    await renderArchive();
    await openDate(todayStr);

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
    await openDate(todayStr);
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

  it('keeps separate drafts when changing dates and editing a reflection from its date', async () => {
    getDailyReflections.mockResolvedValue({ '2020-01-01': 'First day', '2020-01-02': 'Second day' });
    await renderArchive();
    await inputValue(container.querySelector('textarea'), 'Today draft');
    await inputValue(container.querySelector('form input[type="date"]'), '2020-01-03');
    expect(container.querySelector('textarea').value).toBe('');
    await inputValue(container.querySelector('textarea'), 'Another day draft');
    await inputValue(container.querySelector('form input[type="date"]'), todayStr);
    expect(container.querySelector('textarea').value).toBe('Today draft');

    const secondDay = await openDate('2020-01-02');
    expect(secondDay.querySelector('.daily-reflection-content').textContent).toBe('Second day');
    await click(secondDay.querySelector('.daily-reflection-entry button'));
    expect(container.querySelector('form input[type="date"]').value).toBe('2020-01-02');
    expect(container.querySelector('textarea').value).toBe('Second day');
    await inputValue(container.querySelector('textarea'), 'Second day edit');
    await inputValue(container.querySelector('form input[type="date"]'), '2020-01-03');
    expect(container.querySelector('textarea').value).toBe('Another day draft');
    await inputValue(container.querySelector('form input[type="date"]'), todayStr);
    expect(container.querySelector('textarea').value).toBe('Today draft');
    await click(secondDay.querySelector('.daily-reflection-entry button'));
    expect(container.querySelector('textarea').value).toBe('Second day edit');
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
    await openDate(todayStr);
    expect(container.querySelector('.daily-reflection-content').textContent).toBe('Saved in another tab');
    expect(container.querySelector('[role="status"]').textContent).toContain('already exists');
    await submit();
    expect(saveDailyReflection).toHaveBeenCalledTimes(1);
  });
});
