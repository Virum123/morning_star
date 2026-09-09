// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WeeklyPlanner from './WeeklyPlanner';
import { createSchedule, recordScheduleActivity, updateSchedule } from '../services/scheduleService';
import { mapRowsToPlannerFiles } from '../utils/scheduleMapper';

vi.mock('../services/scheduleService', () => ({
  createSchedule: vi.fn(),
  getFrequentSchedules: vi.fn(),
  recordScheduleActivity: vi.fn(),
  saveFrequentSchedules: vi.fn(),
  updateSchedule: vi.fn(),
}));

vi.mock('../utils/date', async (importOriginal) => ({
  ...await importOriginal(),
  appTodayDate: () => new Date('2026-09-09T12:00:00'),
}));

const context = { todayStr: '2026-09-09', tomorrowStr: '2026-09-10' };
const rows = [
  { id: 'first-task', title: '같은 이름의 일정', status: 'active', start_at: '2026-09-09T00:00:00', memo: '보존할 메모' },
  { id: 'second-task', title: '같은 이름의 일정', status: 'active', start_at: '2026-09-09T00:01:00' },
];

describe('WeeklyPlanner interactions', () => {
  let container;
  let root;
  let silentRefresh;

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    silentRefresh = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    recordScheduleActivity.mockResolvedValue({ success: true });
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
      return <WeeklyPlanner filesData={filesData} setFilesData={setFilesData} silentRefresh={silentRefresh} lang="ko" />;
    }
    act(() => root.render(<Planner />));
  };

  const getDay = (date) => container.querySelector(`.weekly-day-header[aria-label^="${date}"]`).parentElement;

  const dispatchDrag = (element, type, dataTransfer) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
    act(() => element.dispatchEvent(event));
    return event;
  };

  it('updates completion immediately and saves only the selected task ID', async () => {
    let finishSave;
    updateSchedule.mockReturnValue(new Promise((resolve) => { finishSave = resolve; }));
    renderPlanner();
    const checkboxes = container.querySelectorAll('[role="checkbox"]');

    act(() => checkboxes[0].click());

    expect(checkboxes[0].getAttribute('aria-checked')).toBe('true');
    expect(checkboxes[1].getAttribute('aria-checked')).toBe('false');
    expect(updateSchedule).toHaveBeenCalledExactlyOnceWith('first-task', { status: 'completed' });
    act(() => checkboxes[0].click());
    expect(updateSchedule).toHaveBeenCalledTimes(1);

    await act(async () => finishSave({
      files: mapRowsToPlannerFiles([{ ...rows[0], status: 'completed' }, rows[1]], context),
    }));
    expect(checkboxes[0].disabled).toBe(false);
    expect(checkboxes[0].getAttribute('aria-checked')).toBe('true');
  });

  it('restores the checkbox and reports a failed save', async () => {
    updateSchedule.mockRejectedValue(new Error('Offline'));
    renderPlanner();

    await act(async () => container.querySelector('[role="checkbox"]').click());

    expect(container.querySelector('[role="checkbox"]').getAttribute('aria-checked')).toBe('false');
    expect(container.querySelector('[role="status"]').textContent).toMatch(/저장/);
    expect(silentRefresh).toHaveBeenCalledTimes(1);
  });

  it('moves the dragged task by ID without creating a duplicate or replacing other tasks', async () => {
    let finishSave;
    updateSchedule.mockReturnValue(new Promise((resolve) => { finishSave = resolve; }));
    renderPlanner();
    const firstTask = getDay(context.todayStr).querySelector('.weekly-task-item');
    expect(firstTask.draggable).toBe(false);
    const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn() };
    dispatchDrag(firstTask.querySelector('.weekly-drag-handle'), 'dragstart', dataTransfer);
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', rows[0].title);
    const targetDay = getDay(context.tomorrowStr);
    dispatchDrag(targetDay, 'dragover', dataTransfer);
    expect(targetDay.classList.contains('drag-over-day')).toBe(true);
    act(() => targetDay.dispatchEvent(new MouseEvent('dragleave', {
      bubbles: true,
      relatedTarget: targetDay.querySelector('button'),
    })));
    expect(targetDay.classList.contains('drag-over-day')).toBe(true);

    dispatchDrag(targetDay, 'drop', dataTransfer);

    expect(updateSchedule).toHaveBeenCalledExactlyOnceWith({ id: 'first-task', targetDate: context.tomorrowStr });
    expect(createSchedule).not.toHaveBeenCalled();
    expect(getDay(context.todayStr).querySelectorAll('.weekly-task-item')).toHaveLength(1);
    expect(getDay(context.tomorrowStr).querySelectorAll('.weekly-task-item')).toHaveLength(1);
    await act(async () => finishSave({
      files: mapRowsToPlannerFiles([{ ...rows[0], start_at: '2026-09-10T00:00:00' }, rows[1]], context),
    }));
    expect(recordScheduleActivity).toHaveBeenCalledTimes(1);
  });

  it('leaves tasks untouched when a drag is cancelled or dropped on a past date', () => {
    renderPlanner();
    const handle = getDay(context.todayStr).querySelector('.weekly-drag-handle');
    const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn() };
    dispatchDrag(handle, 'dragstart', dataTransfer);
    dispatchDrag(getDay('2026-09-08'), 'drop', dataTransfer);
    dispatchDrag(handle, 'dragstart', dataTransfer);
    dispatchDrag(handle, 'dragend', dataTransfer);
    dispatchDrag(getDay(context.tomorrowStr), 'drop', dataTransfer);

    expect(updateSchedule).not.toHaveBeenCalled();
    expect(createSchedule).not.toHaveBeenCalled();
    expect(getDay(context.todayStr).querySelectorAll('.weekly-task-item')).toHaveLength(2);
  });

  it('offers date changes without dragging for keyboard and touch users', async () => {
    updateSchedule.mockResolvedValue({
      files: mapRowsToPlannerFiles([{ ...rows[0], start_at: '2026-09-10T00:00:00' }, rows[1]], context),
    });
    renderPlanner();
    const input = getDay(context.todayStr).querySelector('input[type="date"]');
    expect(input.getAttribute('aria-label')).toContain(rows[0].title);
    expect(input.min).toBe(context.todayStr);

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, context.tomorrowStr);
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(updateSchedule).toHaveBeenCalledExactlyOnceWith({ id: 'first-task', targetDate: context.tomorrowStr });
  });
});
