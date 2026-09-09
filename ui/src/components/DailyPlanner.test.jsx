// @vitest-environment jsdom
import { act, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DailyPlanner from './DailyPlanner';
import { createSchedule, deleteSchedule, updateSchedule } from '../services/scheduleService';
import { mapRowsToPlannerFiles } from '../utils/scheduleMapper';

vi.mock('../services/scheduleService', () => ({
  createSchedule: vi.fn(), deleteSchedule: vi.fn(), updateSchedule: vi.fn(),
  getFrequentSchedules: vi.fn(), saveFrequentSchedules: vi.fn(), saveScheduleCompletionDays: vi.fn(),
}));
vi.mock('../utils/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('../utils/date', async (importOriginal) => ({
  ...await importOriginal(),
  appTodayDate: () => new Date('2026-09-09T12:00:00'),
}));

const context = { todayStr: '2026-09-09', tomorrowStr: '2026-09-10' };
const rows = [
  { id: 'first', title: 'Read', status: 'active', start_at: '2026-09-09T00:00:00', memo: 'Keep this memo' },
  { id: 'second', title: 'Walk', status: 'active', start_at: '2026-09-09T00:01:00' },
];

describe('DailyPlanner interactions', () => {
  let root;
  let container;
  let replaceFiles;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  });

  const renderPlanner = () => {
    function Planner() {
      const [filesData, setFilesData] = useState(() => mapRowsToPlannerFiles(rows, context));
      useEffect(() => { replaceFiles = setFilesData; }, []);
      return <DailyPlanner lang="en" filesData={filesData} setFilesData={setFilesData}
        fireDays={{}} streak={0} setStreak={() => {}} setFireDays={() => {}} loadContent={vi.fn()} />;
    }
    act(() => root.render(<Planner />));
  };

  const dispatchDrag = (element, type) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { setData: vi.fn(), setDragImage: vi.fn() } });
    act(() => element.dispatchEvent(event));
  };

  const setInput = (element, value) => act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });

  it('accepts quick checks on different tasks and rolls back only the failed task', async () => {
    let finishFirst;
    let failSecond;
    updateSchedule.mockImplementation((id) => id === 'first'
      ? new Promise((resolve) => { finishFirst = resolve; })
      : new Promise((_, reject) => { failSecond = reject; }));
    renderPlanner();
    const checks = container.querySelectorAll('[role="checkbox"]');
    act(() => checks[0].click());
    act(() => checks[0].click());
    act(() => checks[1].click());

    expect(updateSchedule).toHaveBeenCalledTimes(2);
    expect(updateSchedule).toHaveBeenNthCalledWith(1, 'first', { status: 'completed' });
    expect(updateSchedule).toHaveBeenNthCalledWith(2, 'second', { status: 'completed' });
    expect([...checks].map((check) => check.getAttribute('aria-checked'))).toEqual(['true', 'true']);

    await act(async () => finishFirst({ success: true }));
    await act(async () => failSecond(new Error('Offline')));

    expect([...checks].map((check) => check.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    expect(container.querySelector('[role="alert"]').textContent).toContain('Could not save');
  });

  it('reapplies the confirmed checkbox after an earlier refresh overwrites optimistic data', async () => {
    let finishSave;
    updateSchedule.mockReturnValue(new Promise((resolve) => { finishSave = resolve; }));
    renderPlanner();
    act(() => container.querySelector('[role="checkbox"]').click());
    act(() => replaceFiles(mapRowsToPlannerFiles(rows, context)));
    await act(async () => finishSave({ success: true }));
    expect(container.querySelector('[role="checkbox"]').getAttribute('aria-checked')).toBe('true');
  });

  it('keeps a cancelled or outside drop from deleting or modifying tasks', () => {
    renderPlanner();
    const item = container.querySelector('.planner-task-item');
    expect(item.draggable).toBe(false);
    const handle = item.querySelector('.drag-handle');
    dispatchDrag(handle, 'dragstart');
    dispatchDrag(document.body, 'drop');
    dispatchDrag(handle, 'dragend');
    expect(deleteSchedule).not.toHaveBeenCalled();
    expect(updateSchedule).not.toHaveBeenCalled();
    expect(container.querySelectorAll('.planner-task-item')).toHaveLength(2);
  });

  it('reorders by stable IDs and then deletes the intended reordered task', async () => {
    const reordered = [{ ...rows[1], start_at: rows[0].start_at }, { ...rows[0], start_at: rows[1].start_at }];
    updateSchedule.mockResolvedValue({ files: mapRowsToPlannerFiles(reordered, context) });
    deleteSchedule.mockResolvedValue({ files: mapRowsToPlannerFiles([rows[1]], context) });
    renderPlanner();

    await act(async () => container.querySelector('[aria-label="Read: Move down"]').click());
    expect(updateSchedule).toHaveBeenCalledExactlyOnceWith({
      filepath: 'supabase://schedule_items/2026-09-09', scheduleIds: ['second', 'first'],
    });
    expect(container.querySelector('.task-text').textContent).toBe('Walk');
    await act(async () => container.querySelectorAll('.task-delete-btn')[1].click());
    expect(deleteSchedule).toHaveBeenCalledExactlyOnceWith({ id: 'first' });
  });

  it('uses the confirmed server snapshot when only part of a reorder was saved', async () => {
    const confirmedRows = [{ ...rows[0], status: 'completed' }, rows[1]];
    updateSchedule.mockRejectedValue(Object.assign(new Error('Partial save'), {
      files: mapRowsToPlannerFiles(confirmedRows, context),
    }));
    renderPlanner();
    await act(async () => container.querySelector('[aria-label="Read: Move down"]').click());
    expect(container.querySelector('.task-text').textContent).toBe('Read');
    expect(container.querySelector('[role="checkbox"]').getAttribute('aria-checked')).toBe('true');
    expect(container.querySelector('[role="alert"]').textContent).toContain('Could not save');
  });

  it('cancels inline edits with Escape and saves literal dollar signs once with Enter', async () => {
    updateSchedule.mockResolvedValue({ files: mapRowsToPlannerFiles([{ ...rows[0], title: '$1 budget' }, rows[1]], context) });
    renderPlanner();
    act(() => container.querySelector('.task-edit-trigger').click());
    let input = container.querySelector('.task-inline-input');
    setInput(input, 'Discard this');
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(updateSchedule).not.toHaveBeenCalled();

    act(() => container.querySelector('.task-edit-trigger').click());
    input = container.querySelector('.task-inline-input');
    setInput(input, '$1 budget');
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(updateSchedule).toHaveBeenCalledExactlyOnceWith('first', { title: '$1 budget' });
    expect(container.querySelector('.task-inline-input')).toBeNull();
  });

  it('creates only a new task without rewriting the existing day', async () => {
    createSchedule.mockResolvedValue({ files: mapRowsToPlannerFiles([...rows, {
      id: 'third', title: 'Stretch', status: 'active', start_at: '2026-09-09T00:02:00',
    }], context) });
    renderPlanner();
    setInput(container.querySelector('.quick-add-bar input'), 'Stretch');
    await act(async () => container.querySelector('.quick-add-bar').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    ));
    expect(createSchedule).toHaveBeenCalledExactlyOnceWith({ taskLine: '- [ ] Stretch\n', targetDate: context.todayStr });
    expect(updateSchedule).not.toHaveBeenCalled();
    expect(container.querySelector('.quick-add-bar input').value).toBe('');
  });
});
