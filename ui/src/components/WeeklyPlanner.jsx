import { useEffect, useRef, useState } from 'react';
import { GripVertical, Star, Plus, X, Trash2, ChevronLeft, ChevronRight, CalendarDays, CheckCircle2, Circle } from 'lucide-react';
import { localDateStr, appTodayDate, startOfLocalWeek } from '../utils/date';
import {
  createSchedule,
  getFrequentSchedules,
  recordScheduleActivity,
  saveFrequentSchedules,
  updateSchedule,
} from '../services/scheduleService';
import { localeForLanguage, t } from '../utils/i18n';
import { getFilesForDate as getPlannerFilesForDate, parseChecklist } from '../utils/plannerData';
import { dateStrToStartAt, mapRowsToPlannerFiles } from '../utils/scheduleMapper';
import './Planner.css';

export default function WeeklyPlanner({
  filesData,
  setFilesData,
  loading,
  lang = 'ko',
  loadContent,
  silentRefresh,
  freqTrigger = 0,
  onJumpToDaily,
  weekOffset = 0,
  setWeekOffset,
}) {
  const [dragItem, setDragItem] = useState(null);
  const [dragOverDay, setDragOverDay] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const savingRef = useRef(false);

  // Frequent tasks modal state
  const [showFreqModal, setShowFreqModal] = useState(false);
  const [frequentTasks, setFrequentTasks] = useState([]);
  const [selectedFreqIds, setSelectedFreqIds] = useState(new Set());
  const [selectedDays, setSelectedDays] = useState(new Set());
  const [newFreqTaskText, setNewFreqTaskText] = useState('');
  const handledFreqTriggerRef = useRef(freqTrigger);
  const freqCloseRef = useRef(null);

  useEffect(() => {
    if (!showFreqModal) return undefined;
    const previousFocus = document.activeElement;
    freqCloseRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowFreqModal(false);
        setSelectedFreqIds(new Set());
        setSelectedDays(new Set());
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus?.();
    };
  }, [showFreqModal]);

  const todayDate = appTodayDate();
  const todayStr = localDateStr(todayDate);
  const tomorrowDate = new Date(todayDate);
  tomorrowDate.setDate(todayDate.getDate() + 1);
  const tomorrowStr = localDateStr(tomorrowDate);
  const dateContext = { todayStr, tomorrowStr };

  const monday = startOfLocalWeek(todayDate);
  monday.setDate(monday.getDate() + weekOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const locale = localeForLanguage(lang);
  const rangeFormatter = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' });
  const monthFormatter = new Intl.DateTimeFormat(locale, { month: 'short' });
  const weekRangeLabel = `${rangeFormatter.format(monday)} — ${rangeFormatter.format(sunday)}`;

  const getFilesForDate = (dateStr) => {
    return getPlannerFilesForDate(dateStr, filesData, dateContext);
  };

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = localDateStr(d);
    const files = getFilesForDate(dateStr);

    const tasksByFile = files.map((file, fileIndex) => {
      const { items } = parseChecklist(file.content);
      return { file, fileIndex, items };
    });
    const taskCount = tasksByFile.reduce((total, group) => total + group.items.length, 0);
    const completedCount = tasksByFile.reduce(
      (total, group) => total + group.items.filter((item) => item.checked).length,
      0,
    );

    let topLabel = '';
    if (dateStr === todayStr) topLabel = t(lang, 'todayLabel');
    else if (dateStr === tomorrowStr) topLabel = t(lang, 'tomorrowLabel');
    else {
      const yd = new Date(todayDate);
      yd.setDate(todayDate.getDate() - 1);
      if (dateStr === localDateStr(yd)) topLabel = t(lang, 'yesterdayLabel');
    }

    return {
      dateObj: d,
      dateStr,
      dayName: t(lang, 'shortDays')[i],
      dayNum: d.getDate(),
      monthLabel: monthFormatter.format(d),
      isToday: dateStr === todayStr,
      isPast: dateStr < todayStr,
      tasksByFile,
      taskCount,
      completedCount,
      topLabel,
    };
  });

  const patchVisibleTask = (id, patch) => {
    setFilesData((current) => {
      const files = [
        ...(current.today || []),
        ...(current.tomorrow || []),
        ...Object.values(current.byDate || current.yesterday || {}).flat(),
      ];
      const rows = files.flatMap((file) => file.scheduleRows || [])
        .map((row) => row.id === id ? { ...row, ...patch } : row);
      const { today, tomorrow, byDate, yesterday } = mapRowsToPlannerFiles(rows, dateContext);
      return { ...current, today, tomorrow, byDate, yesterday };
    });
  };

  const saveTaskChange = async (id, optimisticPatch, persist) => {
    if (!id || savingRef.current) return false;
    savingRef.current = true;
    setIsSaving(true);
    setSaveError('');
    const previousFiles = filesData;
    patchVisibleTask(id, optimisticPatch);
    try {
      const result = await persist();
      if (result.files) setFilesData(result.files);
      return true;
    } catch (error) {
      console.error('Failed to save schedule item.', error);
      setFilesData(error.files || previousFiles);
      setSaveError(t(lang, 'taskSaveError'));
      // Recover server state if the write succeeded but the follow-up read failed.
      try {
        await silentRefresh?.();
      } catch (refreshError) {
        console.error('Failed to refresh schedules.', refreshError);
      }
      return false;
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const handleToggleTask = (row, checked) => {
    const status = checked ? 'active' : 'completed';
    return saveTaskChange(row.id, { status }, () => updateSchedule(row.id, { status }));
  };

  const handleMoveTask = async (item, targetDateStr) => {
    if (!item?.id || !targetDateStr || targetDateStr < todayStr || item.dateStr === targetDateStr) return;
    const targetCount = getFilesForDate(targetDateStr)
      .reduce((count, file) => count + (file.scheduleRows?.length || 0), 0);
    const saved = await saveTaskChange(
      item.id,
      { start_at: dateStrToStartAt(targetDateStr, targetCount) },
      () => updateSchedule({ id: item.id, targetDate: targetDateStr }),
    );
    if (saved) {
      try {
        await recordScheduleActivity(
          'task_moved',
          `${item.dateStr} → ${targetDateStr} · ${t(lang, 'taskMovedActivity')}`,
          { source_date: item.dateStr, target_date: targetDateStr, task_text: item.text },
        );
      } catch (error) {
        console.error('Failed to record schedule move.', error);
      }
    }
  };

  // Only the handle starts a drag, so clicking task controls or selecting text is safe.
  const handleDragStart = (e, item) => {
    if (!item.id || item.dateStr < todayStr || savingRef.current) {
      e.preventDefault();
      return;
    }
    setDragItem(item);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.text);
    const taskElement = e.currentTarget.closest('.weekly-task-item');
    if (taskElement) e.dataTransfer.setDragImage(taskElement, 12, 12);
  };

  const handleDragEnd = () => {
    setDragItem(null);
    setDragOverDay(null);
  };

  const handleDragOverDay = (e, dateStr) => {
    if (!dragItem || savingRef.current || dateStr < todayStr || dragItem.dateStr === dateStr) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDay(dateStr);
  };

  const handleDropOnDay = (e, targetDateStr) => {
    e.preventDefault();
    handleDragEnd();
    return handleMoveTask(dragItem, targetDateStr);
  };

  const toggleFreqTask = (idx) => {
    setSelectedFreqIds(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const toggleDay = (dateStr) => {
    setSelectedDays(prev => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr); else next.add(dateStr);
      return next;
    });
  };

  const futureDays = weekDays.filter(d => !d.isPast);

  useEffect(() => {
    if (freqTrigger <= handledFreqTriggerRef.current) return undefined;

    const requestedTrigger = freqTrigger;
    let isMounted = true;

    const loadFrequentTasks = async () => {
      try {
        const tasks = await getFrequentSchedules();
        if (!isMounted) return;
        setFrequentTasks(tasks || []);
        setSelectedFreqIds(new Set());
        setSelectedDays(new Set());
        setNewFreqTaskText('');
        handledFreqTriggerRef.current = requestedTrigger;
        setShowFreqModal(true);
      } catch (err) {
        console.error("Failed to load frequent tasks", err);
      }
    };

    loadFrequentTasks();
    return () => {
      isMounted = false;
    };
  }, [freqTrigger]);

  const toggleAllDays = () => {
    if (selectedDays.size === futureDays.length) {
      setSelectedDays(new Set());
    } else {
      setSelectedDays(new Set(futureDays.map(d => d.dateStr)));
    }
  };

  const handleAddNewFreqTask = async () => {
    if (!newFreqTaskText.trim()) return;
    const updated = [...frequentTasks, newFreqTaskText.trim()];
    await saveFrequentSchedules(updated);
    setFrequentTasks(updated);
    setNewFreqTaskText('');
  };

  const handleRemoveFreqTask = async (idx) => {
    const updated = frequentTasks.filter((_, i) => i !== idx);
    await saveFrequentSchedules(updated);
    setFrequentTasks(updated);
    setSelectedFreqIds(prev => {
      const next = new Set(prev);
      next.delete(idx);
      return new Set([...next].map(id => (id > idx ? id - 1 : id)));
    });
  };

  const toggleAllFreqTasks = () => {
    setSelectedFreqIds(prev => (
      prev.size === frequentTasks.length
        ? new Set()
        : new Set(frequentTasks.map((_, idx) => idx))
    ));
  };

  const handleDeleteSelectedFreqTasks = async () => {
    if (selectedFreqIds.size === 0) return;
    const updated = frequentTasks.filter((_, i) => !selectedFreqIds.has(i));
    await saveFrequentSchedules(updated);
    setFrequentTasks(updated);
    setSelectedFreqIds(new Set());
  };

  const closeFreqModal = () => {
    setShowFreqModal(false);
    setSelectedFreqIds(new Set());
    setSelectedDays(new Set());
  };

  const hasSelectedAllFreqTasks = frequentTasks.length > 0 && selectedFreqIds.size === frequentTasks.length;

  const renderFreqBulkToolbar = () => (
    frequentTasks.length > 0 && (
      <div className="freq-bulk-toolbar">
        <button type="button" className="freq-toolbar-btn" onClick={toggleAllFreqTasks}>
          {hasSelectedAllFreqTasks ? t(lang, 'freqClearSelection') : t(lang, 'freqSelectAllTasks')}
        </button>
        <button
          type="button"
          className="freq-toolbar-btn danger"
          onClick={handleDeleteSelectedFreqTasks}
          disabled={selectedFreqIds.size === 0}
        >
          <Trash2 size={13} />
          {t(lang, 'freqDeleteSelected')}
          {selectedFreqIds.size > 0 ? ` (${selectedFreqIds.size})` : ''}
        </button>
      </div>
    )
  );

  const handleApplyFreqTasks = async () => {
    const selected = frequentTasks.filter((_, i) => selectedFreqIds.has(i));
    if (selected.length === 0 || selectedDays.size === 0 || savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    setSaveError('');
    try {
      for (const dateStr of selectedDays) {
        await createSchedule({ frequentTasks: selected, targetDate: dateStr });
      }
      await loadContent();
      closeFreqModal();
    } catch (err) {
      console.error("Failed to add frequent tasks", err);
      setSaveError(t(lang, 'taskSaveError'));
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  if (loading) {
    return <div className="skeleton-loader" style={{ padding: '20px' }}>{t(lang, 'loadingTasks')}</div>;
  }

  return (
    <div className="weekly-planner-wrapper">
      <div className="weekly-planner-topbar">
        <div className="weekly-heading-group">
          <span className="weekly-kicker">{t(lang, 'weeklyOverview')}</span>
          <h2>{weekRangeLabel}</h2>
          <p>{t(lang, 'weeklyOverviewDesc')}</p>
        </div>
        <div className="weekly-navigation" aria-label={t(lang, 'weekly')}>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setWeekOffset((currentOffset) => currentOffset - 7)}
            aria-label={t(lang, 'previousWeek')}
            title={t(lang, 'previousWeek')}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            type="button"
            className={`current-week-btn ${weekOffset === 0 ? 'active' : ''}`}
            onClick={() => setWeekOffset(0)}
          >
            <CalendarDays size={14} />
            {t(lang, 'currentWeek')}
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setWeekOffset((currentOffset) => currentOffset + 7)}
            aria-label={t(lang, 'nextWeek')}
            title={t(lang, 'nextWeek')}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>

      <div className={`weekly-save-status ${saveError ? 'error' : ''}`} role="status" aria-live="polite">
        {isSaving ? t(lang, 'taskSaving') : saveError}
      </div>
      <div className="weekly-planner-container">
        {weekDays.map(day => (
          <div
            key={day.dateStr}
            className={`weekly-day-col glass-card ${day.isToday ? 'today-col' : ''} ${day.isPast ? 'past-col' : ''} ${dragOverDay === day.dateStr ? 'drag-over-day' : ''}`}
            onDragOver={(e) => handleDragOverDay(e, day.dateStr)}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setDragOverDay(null);
            }}
            onDrop={(e) => handleDropOnDay(e, day.dateStr)}
          >
            <button
              type="button"
              className="weekly-day-header"
              onClick={() => onJumpToDaily?.(day.dateStr)}
              aria-label={`${day.dateStr} · ${t(lang, 'viewDaySchedule')}`}
              aria-current={day.isToday ? 'date' : undefined}
            >
              <span className="weekly-day-title-row">
                <span className="w-day-name">{day.dayName}</span>
                <span className="w-day-context">{day.topLabel || day.monthLabel}</span>
              </span>
              <span className="weekly-day-date-row">
                <span className="w-day-num">{day.dayNum}</span>
                <span className="weekly-day-count">
                  {day.completedCount}/{day.taskCount} {t(lang, 'completedCountUnit')}
                </span>
              </span>
              <span className="weekly-progress-track" aria-hidden="true">
                <span
                  className="weekly-progress-value"
                  style={{ width: `${day.taskCount > 0 ? Math.round((day.completedCount / day.taskCount) * 100) : 0}%` }}
                />
              </span>
            </button>
            <div className="weekly-task-list">
              {day.tasksByFile.every(tf => tf.items.length === 0) ? (
                <div className="w-empty">{t(lang, 'noTasksForDay')}</div>
              ) : (
                day.tasksByFile.map(({ file, fileIndex, items }) =>
                  items.map((task, idx) => {
                    const row = file.scheduleRows?.[idx];
                    const item = { id: row?.id, dateStr: day.dateStr, text: task.text };
                    const disabled = day.isPast || isSaving || !row?.id;
                    return (
                    <div
                      key={row?.id || `${fileIndex}-${idx}`}
                      className={`weekly-task-item ${task.checked ? 'checked' : ''} ${dragItem?.id === row?.id && dragItem ? 'dragging' : ''}`}
                    >
                      {!day.isPast && (
                        <span
                          className={`weekly-drag-handle ${disabled ? 'disabled' : ''}`}
                          draggable={!disabled}
                          onDragStart={(e) => handleDragStart(e, item)}
                          onDragEnd={handleDragEnd}
                          title={t(lang, 'dragTask')}
                          aria-hidden="true"
                        >
                          <GripVertical size={13} className="weekly-grip" />
                        </span>
                      )}
                      <button
                        type="button"
                        className="weekly-task-check"
                        role="checkbox"
                        aria-checked={task.checked}
                        aria-label={`${t(lang, task.checked ? 'markTaskIncomplete' : 'markTaskComplete')}: ${task.text}`}
                        disabled={disabled}
                        onClick={() => handleToggleTask(row, task.checked)}
                      >
                        {task.checked ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                      </button>
                      <span className="task-text">{task.text}</span>
                      {!day.isPast && (
                        <label className={`weekly-move-task ${disabled ? 'disabled' : ''}`} title={t(lang, 'rescheduleTask')}>
                          <CalendarDays size={14} aria-hidden="true" />
                          <input
                            type="date"
                            value={day.dateStr}
                            min={todayStr}
                            aria-label={`${t(lang, 'rescheduleTask')}: ${task.text}`}
                            disabled={disabled}
                            onChange={(e) => handleMoveTask(item, e.target.value)}
                          />
                        </label>
                      )}
                    </div>
                    );
                  })
                )
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Frequent Tasks Modal */}
      {showFreqModal && (
        <div className="freq-modal-overlay" onClick={closeFreqModal}>
          <div className="freq-modal freq-modal-weekly" role="dialog" aria-modal="true" aria-labelledby="weekly-freq-modal-title" onClick={e => e.stopPropagation()}>
            <div className="freq-modal-header">
              <h3 id="weekly-freq-modal-title"><Star size={16} style={{ marginRight: 6 }} />{t(lang, 'frequentTasks')}</h3>
              <button ref={freqCloseRef} type="button" className="icon-btn" onClick={closeFreqModal} aria-label={t(lang, 'closeDialog')}><X size={20} /></button>
            </div>

            {renderFreqBulkToolbar()}

            <div className="freq-task-list">
              {frequentTasks.length === 0 ? (
                <div className="freq-empty">{t(lang, 'freqTasksEmpty')}</div>
              ) : (
                frequentTasks.map((task, i) => (
                  <div
                    key={i}
                    className={`freq-task-item ${selectedFreqIds.has(i) ? 'selected' : ''}`}
                    onClick={() => toggleFreqTask(i)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFreqIds.has(i)}
                      onChange={() => toggleFreqTask(i)}
                      onClick={e => e.stopPropagation()}
                    />
                    <span className="freq-task-label">{task}</span>
                    <button
                      className="freq-remove-btn"
                      onClick={e => { e.stopPropagation(); handleRemoveFreqTask(i); }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="freq-add-new">
              <input
                type="text"
                placeholder={t(lang, 'freqTasksNewPlaceholder')}
                value={newFreqTaskText}
                onChange={e => setNewFreqTaskText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddNewFreqTask(); } }}
              />
              <button className="freq-add-new-btn" onClick={handleAddNewFreqTask} disabled={!newFreqTaskText.trim()}>
                <Plus size={16} />
              </button>
            </div>

            {/* Day selector */}
            <div className="freq-day-selector">
              <p className="freq-day-label">{t(lang, 'freqDaySelectPrompt')}</p>
              <div className="freq-day-buttons">
                {weekDays.map(day => (
                  <button
                    key={day.dateStr}
                    className={`freq-day-btn ${selectedDays.has(day.dateStr) ? 'selected' : ''} ${day.isPast ? 'disabled' : ''}`}
                    onClick={() => { if (!day.isPast) toggleDay(day.dateStr); }}
                    disabled={day.isPast}
                    title={day.isPast ? t(lang, 'pastDateTitle') : day.dateStr}
                  >
                    {day.dayName}
                    {day.isToday && <span className="freq-day-dot" />}
                  </button>
                ))}
                <button
                  className={`freq-day-btn freq-select-all-btn ${selectedDays.size === futureDays.length && futureDays.length > 0 ? 'selected' : ''}`}
                  onClick={toggleAllDays}
                >
                  {t(lang, 'freqSelectAll')}
                </button>
              </div>
            </div>

            <div className="freq-modal-footer">
              <button className="freq-cancel-btn" onClick={closeFreqModal}>
                {t(lang, 'freqCancel')}
              </button>
              <button
                className="freq-apply-btn"
                onClick={handleApplyFreqTasks}
                disabled={isSaving || selectedFreqIds.size === 0 || selectedDays.size === 0}
              >
                {t(lang, isSaving ? 'taskSaving' : 'freqAddToWeek')}
                {selectedFreqIds.size > 0 && selectedDays.size > 0 ? ` (${selectedFreqIds.size} × ${selectedDays.size})` : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
