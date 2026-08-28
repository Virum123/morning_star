import { useState, useEffect, useMemo, useRef } from 'react';
import { Flame, CheckCircle2, Circle, ChevronLeft, ChevronRight, PenLine, Send, Plus, GripVertical, Trash2, X, Star } from 'lucide-react';
import {
  createSchedule,
  deleteSchedule,
  getFrequentSchedules,
  saveFrequentSchedules,
  saveScheduleCompletionDays,
  updateSchedule,
} from '../services/scheduleService';
import { trackEvent } from '../utils/analytics';
import { t } from '../utils/i18n';
import { localDateStr, appTodayDate } from '../utils/date';
import {
  getByDateFiles,
  getFilesForDate,
  getMigratedUnfinishedTaskKeys,
  makeMigratedUnfinishedTaskKey,
  parseChecklist,
  selectLatestPlanFiles,
} from '../utils/plannerData';
import './Planner.css';

/* ─── Donut Chart (SVG, no library) ─── */
function DonutChart({ percent, size = 100, strokeWidth = 10, label }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  return (
    <div className="donut-wrapper" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="donut-svg">
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--divider)" strokeWidth={strokeWidth}/>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="url(#donutGrad)"
          strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          transform={`rotate(-90 ${size/2} ${size/2})`} className="donut-progress"/>
        <defs>
          <linearGradient id="donutGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--accent-color)" stopOpacity="0.9"/>
            <stop offset="100%" stopColor="var(--card-stripe)"/>
          </linearGradient>
        </defs>
      </svg>
      <div className="donut-center-label">
        <span className="donut-pct">
          {percent}<span className="donut-symbol">%</span>
        </span>
        <span className="donut-sub">{label ? label.doneText : "done"}</span>
      </div>
    </div>
  );
}

function calculateStreakFromFireDays(fireDays = {}) {
  const markedDays = Object.keys(fireDays)
    .filter((dateKey) => fireDays[dateKey])
    .sort();

  if (markedDays.length === 0) return 0;

  let streakCount = 1;
  for (let index = markedDays.length - 1; index > 0; index -= 1) {
    const currentDate = new Date(markedDays[index]);
    const previousDate = new Date(markedDays[index - 1]);
    const diff = Math.round((currentDate - previousDate) / 86400000);
    if (diff !== 1) break;
    streakCount += 1;
  }
  return streakCount;
}

function calculateStreakStatsFromFireDays(fireDays = {}) {
  const markedDays = Object.keys(fireDays)
    .filter((dateKey) => fireDays[dateKey])
    .sort();

  if (markedDays.length === 0) {
    return { longestDays: 0, longestWeeks: 0, longestWeekDays: 0, totalMarkedDays: 0 };
  }

  let runLength = 1;
  let longestDays = 1;

  for (let index = 1; index < markedDays.length; index += 1) {
    const currentDate = new Date(`${markedDays[index]}T00:00:00`);
    const previousDate = new Date(`${markedDays[index - 1]}T00:00:00`);
    const diff = Math.round((currentDate - previousDate) / 86400000);

    runLength = diff === 1 ? runLength + 1 : 1;
    longestDays = Math.max(longestDays, runLength);
  }

  return {
    longestDays,
    longestWeeks: Math.floor(longestDays / 7),
    longestWeekDays: longestDays % 7,
    totalMarkedDays: markedDays.length,
  };
}

export default function DailyPlanner({
  lang = 'ko',
  loading,
  filesData,
  setFilesData,
  streak,
  setStreak,
  fireDays,
  setFireDays,
  loadContent,
  targetDateStr,
  freqTrigger = 0,
}) {
  const [fireBtnClicked, setFireBtnClicked] = useState(false);
  const [showStreakModal, setShowStreakModal] = useState(false);

  const todayDate = appTodayDate();
  const todayStr = localDateStr(todayDate);
  const tomorrowDate = new Date(todayDate);
  tomorrowDate.setDate(todayDate.getDate() + 1);
  const tomorrowStr = localDateStr(tomorrowDate);
  const dateContext = useMemo(() => ({ todayStr, tomorrowStr }), [todayStr, tomorrowStr]);
  const byDateFiles = useMemo(() => getByDateFiles(filesData), [filesData]);
  const migratedUnfinishedKeys = useMemo(() => getMigratedUnfinishedTaskKeys(filesData), [filesData]);

  const [selectedDateStr, setSelectedDateStr] = useState(todayStr);
  const isPastSelectedDate = selectedDateStr < todayStr;
  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => {
    if (targetDateStr) {
      setSelectedDateStr(targetDateStr);
      const targetDate = new Date(targetDateStr);
      const targetMonday = new Date(targetDate);
      targetMonday.setDate(targetDate.getDate() - ((targetDate.getDay() + 6) % 7));
      const currentDate = new Date(`${todayStr}T00:00:00`);
      const currentMonday = new Date(currentDate);
      currentMonday.setDate(currentDate.getDate() - ((currentDate.getDay() + 6) % 7));
      const weeksDiff = Math.round((targetMonday - currentMonday) / (1000 * 60 * 60 * 24));
      setWeekOffset(weeksDiff);
    }
  }, [targetDateStr, todayStr]);

  // Quick Add state
  const [quickTaskText, setQuickTaskText] = useState('');
  const [isSubmittingQuickTask, setIsSubmittingQuickTask] = useState(false);

  // Inline edit state
  const [editingItem, setEditingItem] = useState(null);

  // Drag and drop state
  const [dragItem, setDragItem] = useState(null);
  const [dragOverItem, setDragOverItem] = useState(null);

  // Drag tracking refs
  const droppedOnValidTarget = useRef(false);
  const dragCancelled = useRef(false);
  const taskListRef = useRef(null);

  // Stable random values for "어제 못한 일 없음" message — only re-rolls on remount
  const randomEmojiIdx = useRef(Math.floor(Math.random() * 10));
  const randomMsgIdx = useRef(Math.floor(Math.random() * 10));

  // Frequent tasks modal state
  const [showFreqModal, setShowFreqModal] = useState(false);
  const [frequentTasks, setFrequentTasks] = useState([]);
  const [selectedFreqIds, setSelectedFreqIds] = useState(new Set());
  const [newFreqTaskText, setNewFreqTaskText] = useState('');
  const handledFreqTriggerRef = useRef(freqTrigger);

  const { activeTarget, activeFiles, canEdit } = useMemo(() => {
    const activeFilesForDate = getFilesForDate(selectedDateStr, filesData, dateContext, { latestToday: true });
    if (selectedDateStr === todayStr) return { activeTarget: 'today', activeFiles: activeFilesForDate, canEdit: true };
    if (selectedDateStr === tomorrowStr) return { activeTarget: 'tomorrow', activeFiles: activeFilesForDate, canEdit: true };
    return {
      activeTarget: 'byDate',
      activeFiles: activeFilesForDate,
      canEdit: false,
    };
  }, [dateContext, filesData, selectedDateStr, todayStr, tomorrowStr]);

  // Escape key detection during drag
  useEffect(() => {
    if (!dragItem) return;
    const handleEsc = (e) => {
      if (e.key === 'Escape') dragCancelled.current = true;
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [dragItem]);

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

  // Document-level dragover: detect outside drop zone — direct DOM manipulation (no re-render)
  useEffect(() => {
    const taskListElement = taskListRef.current;

    if (!dragItem || dragItem.type !== 'active' || !canEdit) {
      taskListElement?.classList.remove('drag-delete-zone');
      return;
    }
    const handleDocDragOver = (e) => {
      const el = taskListRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const outside = e.clientX < rect.left || e.clientX > rect.right ||
                      e.clientY < rect.top  || e.clientY > rect.bottom;
      el.classList.toggle('drag-delete-zone', outside);
    };
    document.addEventListener('dragover', handleDocDragOver);
    return () => {
      document.removeEventListener('dragover', handleDocDragOver);
      taskListElement?.classList.remove('drag-delete-zone');
    };
  }, [dragItem, canEdit]);

  const stats = useMemo(() => {
    let totalChecked = 0, totalItems = 0;
    const enriched = activeFiles.map(f => {
      const { items, checked, total } = parseChecklist(f.content);
      totalChecked += checked;
      totalItems += total;
      return { ...f, items, checked, total };
    });
    const pct = totalItems > 0 ? Math.round((totalChecked / totalItems) * 100) : 0;
    return { enriched, totalChecked, totalItems, pct };
  }, [activeFiles]);

  const todayStats = useMemo(() => {
    let totalChecked = 0, totalItems = 0;
    const files = selectLatestPlanFiles(filesData.today || []);
    files.forEach(f => {
      const { checked, total } = parseChecklist(f.content);
      totalChecked += checked;
      totalItems += total;
    });
    const pct = totalItems > 0 ? Math.round((totalChecked / totalItems) * 100) : 0;
    return { totalChecked, totalItems, pct };
  }, [filesData.today]);

  const streakStats = useMemo(() => calculateStreakStatsFromFireDays(fireDays), [fireDays]);

  const markFire = (eventName) => {
    const updated  = { ...fireDays, [todayStr]: true };
    setFireDays(updated);
    saveScheduleCompletionDays(updated);
    setStreak(calculateStreakFromFireDays(updated));
    trackEvent(eventName);
  };

  const alreadyFired = fireDays[todayStr];

  // --- Task Interaction ---
  const toggleLineByIndex = async (fileIndex, lineIndex, currentChecked) => {
    if (!canEdit) return;
    const file = activeFiles[fileIndex];
    if (!file) return;

    const contentLines = file.content.split('\n');
    let targetLine = contentLines[lineIndex];

    if (!currentChecked) {
      targetLine = targetLine.replace(/^(\s*)-\s*\[\s\]/, '$1- [x]');
    } else {
      targetLine = targetLine.replace(/^(\s*)-\s*\[[xX]\]/, '$1- [ ]');
    }

    contentLines[lineIndex] = targetLine;
    const newContent = contentLines.join('\n');

    const updatedFiles = [...activeFiles];
    updatedFiles[fileIndex] = { ...file, content: newContent };
    setFilesData(prev => ({ ...prev, [activeTarget]: updatedFiles }));

    const res = await updateSchedule({ filepath: file.path, content: newContent });
    if (!res || !res.success) {
      console.error('Failed to persist checkbox state.');
      loadContent();
    } else {
      trackEvent('task_check_planner', { filename: file.filename, checked: !currentChecked });
    }
  };

  const handleQuickAddSubmit = async (e) => {
    e.preventDefault();
    if (!quickTaskText.trim() || !canEdit || isSubmittingQuickTask) return;
    setIsSubmittingQuickTask(true);

    try {
      const taskLine = `- [ ] ${quickTaskText.trim()}\n`;
      if (activeFiles.length > 0) {
        const targetFile = activeFiles[0];
        const newContent = (targetFile.content || '').trim() + '\n' + taskLine;
        await updateSchedule({ filepath: targetFile.path, content: newContent });
      } else {
        const filename = 'Daily_Tasks.md';
        const filesDataArr = [{ name: filename, content: taskLine, normalize_tasks: false }];
        await createSchedule({ target: activeTarget, files: filesDataArr });
      }

      setQuickTaskText('');
      await loadContent();
      trackEvent('task_quick_add', { target: activeTarget });
    } catch (err) {
      console.error("Failed to quick add task", err);
    } finally {
      setIsSubmittingQuickTask(false);
    }
  };

  const saveInlineEdit = async (fileIndex, lineIndex, newText) => {
    if (!canEdit) return;
    const file = activeFiles[fileIndex];
    if (!file) return;

    const contentLines = file.content.split('\n');
    let targetLine = contentLines[lineIndex];
    targetLine = targetLine.replace(/^(\s*-\s*\[(?: |x|X)\]\s*).*$/, `$1${newText}`);
    contentLines[lineIndex] = targetLine;
    const newContent = contentLines.join('\n');

    const updatedFiles = [...activeFiles];
    updatedFiles[fileIndex] = { ...file, content: newContent };
    setFilesData(prev => ({ ...prev, [activeTarget]: updatedFiles }));

    const res = await updateSchedule({ filepath: file.path, content: newContent });
    if (!res || !res.success) {
      console.error('Failed to persist inline edit.');
      loadContent();
    } else {
      trackEvent('task_inline_edit');
    }
    setEditingItem(null);
  };

  // --- Drag and Drop ---
  const handleDragStart = (e, fileIndex, lineIndex, text) => {
    if (!canEdit) return;
    droppedOnValidTarget.current = false;
    dragCancelled.current = false;
    setDragItem({ type: 'active', fileIndex, lineIndex, text });
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => {
      e.currentTarget.classList.add('dragging');
    }, 0);
  };

  const handleUnfinishedDragStart = (e, task) => {
    droppedOnValidTarget.current = false;
    dragCancelled.current = false;
    setDragItem({ type: 'unfinished', task });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.text);
    setTimeout(() => {
      e.currentTarget.classList.add('dragging');
    }, 0);
  };

  const handleDragOver = (e, fileIndex, lineIndex) => {
    if (!canEdit || !dragItem) return;
    if (dragItem.type === 'unfinished') {
      if (selectedDateStr === todayStr) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }
      return;
    }
    if (dragItem.type !== 'active') return;
    if (dragItem.fileIndex !== fileIndex) return;
    e.preventDefault();
    setDragOverItem({ fileIndex, lineIndex });
  };

  const handleDragEnd = async (e) => {
    e.currentTarget.classList.remove('dragging');
    taskListRef.current?.classList.remove('drag-delete-zone', 'unfinished-drop-target');
    const item = dragItem;
    setDragItem(null);
    setDragOverItem(null);

    if (!item || !canEdit) {
      droppedOnValidTarget.current = false;
      dragCancelled.current = false;
      return;
    }

    // 태스크 리스트 위에 드롭되지 않았고 Escape도 아닌 경우 → 휴지통으로
    if (item.type === 'active' && !droppedOnValidTarget.current && !dragCancelled.current) {
      await handleDeleteTask(item.fileIndex, item.lineIndex);
    }

    droppedOnValidTarget.current = false;
    dragCancelled.current = false;
  };

  const handleTaskListDragOver = (e) => {
    if (!canEdit || !dragItem) return;
    if (dragItem.type === 'unfinished') {
      if (selectedDateStr !== todayStr) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      return;
    }
    if (dragItem.type === 'active') {
      e.preventDefault();
    }
  };

  const handleDropOnTaskList = async (e) => {
    if (!canEdit || !dragItem) return;
    e.preventDefault();
    droppedOnValidTarget.current = true;

    const item = dragItem;
    setDragItem(null);
    setDragOverItem(null);

    if (item.type === 'unfinished' && selectedDateStr === todayStr) {
      await handleMigrateTask(item.task);
    }
  };

  const handleDropOnTask = async (e, targetFileIndex, targetLineIndex) => {
    e.preventDefault();
    e.stopPropagation();
    droppedOnValidTarget.current = true;

    if (!canEdit || !dragItem) return;

    if (dragItem.type === 'unfinished') {
      if (selectedDateStr === todayStr) {
        const task = dragItem.task;
        setDragItem(null);
        setDragOverItem(null);
        await handleMigrateTask(task);
      }
      return;
    }

    if (dragItem.type !== 'active' || dragItem.fileIndex !== targetFileIndex) return;
    if (dragItem.lineIndex === targetLineIndex) return;

    const file = activeFiles[targetFileIndex];
    if (!file) return;

    const contentLines = file.content.split('\n');
    const draggedLine = contentLines[dragItem.lineIndex];
    contentLines.splice(dragItem.lineIndex, 1);
    const insertIndex = targetLineIndex > dragItem.lineIndex ? targetLineIndex : targetLineIndex;
    contentLines.splice(insertIndex, 0, draggedLine);

    const newContent = contentLines.join('\n');
    const updatedFiles = [...activeFiles];
    updatedFiles[targetFileIndex] = { ...file, content: newContent };
    setFilesData(prev => ({ ...prev, [activeTarget]: updatedFiles }));

    await updateSchedule({ filepath: file.path, content: newContent });
  };

  const handleDeleteTask = async (fileIndex, lineIndex) => {
    if (!canEdit) return;

    const file = activeFiles[fileIndex];
    if (!file) return;

    const contentLines = file.content.split('\n');
    const removedLine = contentLines[lineIndex];
    contentLines.splice(lineIndex, 1);

    const newContent = contentLines.join('\n');
    const updatedFiles = [...activeFiles];
    updatedFiles[fileIndex] = { ...file, content: newContent };
    setFilesData(prev => ({ ...prev, [activeTarget]: updatedFiles }));

    const scheduleId = file.scheduleRows?.[lineIndex]?.id;
    if (scheduleId) {
      try {
        await deleteSchedule({ id: scheduleId });
        await loadContent();
      } catch (err) {
        console.error("Failed to add to trash", err);
        await loadContent();
      }
      return;
    }

    await updateSchedule({ filepath: file.path, content: newContent });
    await handleTrashTask(removedLine, file.filename);
  };

  const handleTrashTask = async (taskText, filename) => {
    try {
      await deleteSchedule({ taskText, filename });
    } catch (err) {
      console.error("Failed to add to trash", err);
    }
  };

  // --- Unfinished Tasks ---
  const unfinishedTasks = useMemo(() => {
    const yd = new Date(`${todayStr}T00:00:00`);
    yd.setDate(yd.getDate() - 1);
    const yesterdayStr = localDateStr(yd);
    const files = byDateFiles[yesterdayStr] || [];
    const tasks = [];
    files.forEach(file => {
      const { items } = parseChecklist(file.content);
      items.forEach((item) => {
        const migratedKey = makeMigratedUnfinishedTaskKey({
          date: yesterdayStr,
          filePath: file.path,
          lineIndex: item.lineIndex,
          text: item.text,
        });
        if (!item.checked && !migratedUnfinishedKeys.has(migratedKey)) {
          tasks.push({ date: yesterdayStr, text: item.text, filePath: file.path, filename: file.filename, fileContent: file.content, lineIndex: item.lineIndex });
        }
      });
    });
    return tasks;
  }, [byDateFiles, migratedUnfinishedKeys, todayStr]);

  const handleMigrateTask = async (task) => {
    try {
      const result = await updateSchedule({
        sourcePath: task.filePath,
        sourceDate: task.date,
        lineIndex: task.lineIndex,
        taskText: task.text,
      });

      if (result?.files) {
        setFilesData(result.files);
      } else {
        await loadContent();
      }
      trackEvent('task_migrate');
    } catch (err) {
      console.error("Failed to migrate task", err);
      await loadContent();
    }
  };

  const toggleFreqTask = (idx) => {
    setSelectedFreqIds(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
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
    trackEvent('freq_tasks_deleted_bulk', { count: selectedFreqIds.size });
  };

  const closeFreqModal = () => {
    setShowFreqModal(false);
    setSelectedFreqIds(new Set());
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
    if (selected.length === 0) return;
    try {
      await createSchedule({ frequentTasks: selected, targetDate: selectedDateStr });
      await loadContent();
      closeFreqModal();
      trackEvent('freq_tasks_added_daily');
    } catch (err) {
      console.error("Failed to add frequent tasks", err);
    }
  };

  const renderTaskFiles = () => (
    <div className="task-files-container">
      {stats.enriched.map((file, fileIndex) => {
        const lines = file.content.split('\n');
        return (
          <div key={file.path} className="planner-file-group">
            <ul className="planner-tasks">
              {lines.map((line, lineIndex) => {
                const uncheckedMatch = line.match(/^(\s*)-\s*\[\s\]\s*(.*)/);
                const checkedMatch = line.match(/^(\s*)-\s*\[[xX]\]\s*(.*)/);

                let isChecked = false;
                let text = '';
                let isTask = false;

                if (uncheckedMatch) { isTask = true; text = uncheckedMatch[2]; }
                else if (checkedMatch) { isTask = true; text = checkedMatch[2]; isChecked = true; }

                if (!isTask) return null;

                const isEditingThis = editingItem?.fileIndex === fileIndex && editingItem?.lineIndex === lineIndex;
                const isActiveDrag = dragItem?.type === 'active';
                const isDragOverTop = isActiveDrag && dragOverItem?.fileIndex === fileIndex && dragOverItem?.lineIndex === lineIndex && (dragItem.lineIndex > lineIndex);
                const isDragOverBottom = isActiveDrag && dragOverItem?.fileIndex === fileIndex && dragOverItem?.lineIndex === lineIndex && (dragItem.lineIndex < lineIndex);

                return (
                  <li
                    key={lineIndex}
                    className={`planner-task-item ${isChecked ? 'checked' : ''} ${isDragOverTop ? 'drag-over-top' : ''} ${isDragOverBottom ? 'drag-over-bottom' : ''}`}
                    draggable={canEdit && !isEditingThis}
                    onDragStart={(e) => handleDragStart(e, fileIndex, lineIndex, text)}
                    onDragOver={(e) => handleDragOver(e, fileIndex, lineIndex)}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => handleDropOnTask(e, fileIndex, lineIndex)}
                  >
                    {canEdit && (
                      <div className="drag-handle" title="Drag to reorder">
                        <GripVertical size={16} />
                      </div>
                    )}

                    <button
                      className="task-check-btn"
                      onClick={() => toggleLineByIndex(fileIndex, lineIndex, isChecked)}
                      disabled={!canEdit}
                    >
                      {isChecked ? <CheckCircle2 size={18} className="done" /> : <Circle size={18} />}
                    </button>

                    {isEditingThis ? (
                      <input
                        type="text"
                        className="task-inline-input"
                        autoFocus
                        defaultValue={text}
                        onBlur={(e) => saveInlineEdit(fileIndex, lineIndex, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            saveInlineEdit(fileIndex, lineIndex, e.target.value);
                          } else if (e.key === 'Escape') {
                            setEditingItem(null);
                          }
                        }}
                      />
                    ) : (
                      <span
                        className="task-text"
                        onDoubleClick={() => { if (canEdit) setEditingItem({ fileIndex, lineIndex, text }); }}
                      >
                        {text}
                      </span>
                    )}

                    {canEdit && !isEditingThis && (
                      <>
                        <button className="task-edit-trigger" onClick={() => setEditingItem({ fileIndex, lineIndex, text })}>
                          <PenLine size={14} />
                        </button>
                        <button className="task-delete-btn" onClick={() => handleDeleteTask(fileIndex, lineIndex)} title="Delete task">
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );

  const renderPastTaskRows = (items, type) => (
    <ul className="planner-tasks past-task-list">
      {items.map((item) => (
        <li key={item.key} className={`planner-task-item past-task-item ${type === 'completed' ? 'checked' : 'past-unfinished'}`}>
          <span className="past-task-icon">
            {type === 'completed' ? <CheckCircle2 size={18} className="done" /> : <Circle size={18} />}
          </span>
          <span className="task-text">{item.text}</span>
        </li>
      ))}
    </ul>
  );

  const renderPastTaskSections = () => {
    const unfinished = [];
    const completed = [];

    stats.enriched.forEach((file) => {
      file.items.forEach((item, itemIndex) => {
        const task = {
          ...item,
          key: `${file.path}-${item.lineIndex}-${itemIndex}`,
        };
        if (item.checked) completed.push(task);
        else unfinished.push(task);
      });
    });

    if (unfinished.length === 0) return renderTaskFiles();

    return (
      <div className="past-task-sections">
        <section className="past-task-section past-task-section-unfinished">
          <div className="past-task-section-header">
            <h3>{t(lang, 'pastUnfinishedSection')}</h3>
            <span>{unfinished.length}</span>
          </div>
          {renderPastTaskRows(unfinished, 'unfinished')}
        </section>

        {completed.length > 0 && (
          <section className="past-task-section">
            <div className="past-task-section-header">
              <h3>{t(lang, 'pastCompletedSection')}</h3>
              <span>{completed.length}</span>
            </div>
            {renderPastTaskRows(completed, 'completed')}
          </section>
        )}
      </div>
    );
  };

  // --- Calendar Rendering ---
  const renderWeeklyCalendar = () => {
    const monday = new Date(todayDate);
    monday.setDate(todayDate.getDate() - ((todayDate.getDay() + 6) % 7) + weekOffset);

    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = localDateStr(d);

      let topLabel = '';
      if (dateStr === todayStr) topLabel = t(lang, 'todayLabel');
      else if (dateStr === tomorrowStr) topLabel = t(lang, 'tomorrowLabel');
      else {
        const yesterdayDate = new Date(todayDate);
        yesterdayDate.setDate(todayDate.getDate() - 1);
        if (dateStr === localDateStr(yesterdayDate)) topLabel = t(lang, 'yesterdayLabel');
      }

      return { dateObj: d, dateStr, dayName: t(lang, 'shortDays')[i], dayNum: d.getDate(), topLabel };
    });

    return (
      <div className="planner-calendar-wrapper glass-card" style={{ display: 'flex', alignItems: 'center', padding: '0 4px' }}>
        <button className="icon-btn" onClick={() => setWeekOffset(w => w - 7)}><ChevronLeft size={16} /></button>
        <div className="planner-calendar" style={{ flex: 1, border: 'none', background: 'transparent', padding: '5px 4px', boxShadow: 'none' }}>
          {weekDays.map(({ dateStr, dayName, dayNum, topLabel }) => {
            const isSelected = selectedDateStr === dateStr;
            const isTodayStr = dateStr === todayStr;
            const isTomorrowStr = dateStr === tomorrowStr;
            const hasData = byDateFiles[dateStr] || dateStr === todayStr || dateStr === tomorrowStr;
            const isFire = fireDays[dateStr];

            return (
              <div
                key={dateStr}
                className={`planner-cal-day ${isSelected ? 'selected' : ''} ${isTodayStr ? 'today' : ''} ${!hasData && !isTomorrowStr ? 'disabled' : ''}`}
                onClick={() => { if (hasData || isTomorrowStr) setSelectedDateStr(dateStr); }}
              >
                <span className="cal-day-name">{topLabel ? <strong style={{color: 'var(--accent-color)'}}>{topLabel}</strong> : dayName}</span>
                <div className="cal-day-num-wrapper">
                  {isFire ? <Flame size={14} color="#ff6a00" fill="#ff6a00" strokeWidth={1.5} /> : <span className="cal-day-num">{dayNum}</span>}
                </div>
                {isTodayStr && <div className="cal-indicator" />}
              </div>
            );
          })}
        </div>
        <button className="icon-btn" onClick={() => setWeekOffset(w => w + 7)}><ChevronRight size={16} /></button>
      </div>
    );
  };

  return (
    <div className="planner-container fade-in">
      {renderWeeklyCalendar()}

      <div className="planner-layout">
        <div className="planner-main">
          <div className="planner-header">
            <h2>{selectedDateStr === todayStr ? t(lang, 'todaysPlan') : selectedDateStr === tomorrowStr ? t(lang, 'tomorrowsPlan') : `${t(lang, 'planFor')}${selectedDateStr}`}</h2>
            {!canEdit && <span className="badge-readonly">{t(lang, isPastSelectedDate ? 'readOnlyPast' : 'readOnlyPlanned')}</span>}
          </div>

          <div
            ref={taskListRef}
            className={`planner-task-list glass-card ${dragItem?.type === 'unfinished' && selectedDateStr === todayStr ? 'unfinished-drop-target' : ''}`}
            onDragOver={handleTaskListDragOver}
            onDrop={handleDropOnTaskList}
          >
            {loading ? (
              <div className="skeleton-loader" style={{ padding: '20px' }}>{t(lang, 'loadingTasks')}</div>
            ) : stats.enriched.length === 0 ? (
              <div className="empty-state">
                <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>✨</div>
                <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t(lang, 'emptyTasks')}</p>
                {canEdit && <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t(lang, 'useQuickAdd')}</p>}
              </div>
            ) : isPastSelectedDate ? (
              renderPastTaskSections()
            ) : (
              renderTaskFiles()
            )}
          </div>

          {canEdit && (
            <form className="quick-add-bar glass-card" onSubmit={handleQuickAddSubmit}>
              <Plus size={16} className="quick-add-icon" />
              <input
                type="text"
                placeholder={t(lang, 'quickAddPlaceholder')}
                value={quickTaskText}
                onChange={(e) => setQuickTaskText(e.target.value)}
                disabled={isSubmittingQuickTask}
              />
              <button type="submit" disabled={!quickTaskText.trim() || isSubmittingQuickTask} className="quick-add-btn">
                <Send size={14} />
              </button>
            </form>
          )}
        </div>

        {/* Sidebar */}
        <div className="planner-sidebar">
          <div className="glass-card widget-card">
            <h3 className="widget-title">{t(lang, 'todaysProgress')}</h3>
            <div className="widget-donut-center">
              <DonutChart percent={todayStats.pct} size={92} strokeWidth={9} label={{ doneText: t(lang, 'done') }} />
            </div>
            <div className="widget-stats-row">
              <div className="w-stat">
                <span>{todayStats.totalChecked}</span>
                <label>{t(lang, 'completed')}</label>
              </div>
              <div className="w-stat">
                <span>{todayStats.totalItems - todayStats.totalChecked}</span>
                <label>{t(lang, 'remaining')}</label>
              </div>
            </div>

            {todayStats.totalItems === 0 && (
              <button
                className={`ds-fire-btn no-tasks-btn ${alreadyFired ? 'fired' : ''}`}
                onClick={() => { if (!alreadyFired) markFire('no_task_fire'); }}
                style={{ width: '100%', marginTop: '10px' }}
              >
                {alreadyFired
                  ? <><CheckCircle2 size={18} className="fire-icon-done"/> {t(lang, 'markDone')}</>
                  : <><Flame size={18} className="fire-icon"/> {t(lang, 'markNoTasks')}</>
                }
              </button>
            )}

            {todayStats.totalItems > 0 && todayStats.totalChecked >= todayStats.totalItems && (
              <button
                className={`ds-fire-btn ${alreadyFired ? 'fired' : ''}`}
                onClick={() => {
                  if (alreadyFired) return;
                  setFireBtnClicked(true);
                  setTimeout(() => setFireBtnClicked(false), 2000);
                  markFire('fire_complete');
                }}
                style={{ width: '100%', marginTop: '10px' }}
              >
                {alreadyFired
                  ? <><CheckCircle2 size={18} className="fire-icon-done"/> {t(lang, 'markDone')}</>
                  : fireBtnClicked
                    ? <><Flame size={18} className="fire-icon animate-pulse"/>...</>
                    : <><Flame size={18} className="fire-icon"/> {t(lang, 'markComplete')}</>
                }
              </button>
            )}
          </div>

          <button
            type="button"
            className="glass-card widget-card streak-widget streak-widget-button"
            onClick={() => setShowStreakModal(true)}
          >
            <div className="streak-header">
              <Flame size={20} className="streak-icon" />
              <div>
                <h3 style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-primary)' }}>{streak} {t(lang, 'dayStreak')}</h3>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)' }}>{t(lang, 'keepItUp')}</span>
              </div>
            </div>
          </button>

          <div className="planner-side-widgets">
            <div className="widget glass-card fade-in unfinished-widget">
              {unfinishedTasks.length > 0 ? (
                <>
                  <h3>{t(lang, 'unfinishedTasksTitle')}</h3>
                  <ul className="unfinished-tasks-widget planner-tasks" style={{ marginTop: '8px' }}>
                    {unfinishedTasks.map((task, i) => (
                      <li
                        key={i}
                        className="planner-task-item unfinished-task-row"
                        draggable
                        onDragStart={(e) => handleUnfinishedDragStart(e, task)}
                        onDragEnd={handleDragEnd}
                        title={t(lang, 'migrateTask')}
                      >
                        <div className="drag-handle"><GripVertical size={16} /></div>
                        <span className="task-text unfinished-task-text">{task.text}</span>
                        <button className="icon-btn unfinished-migrate-btn" onClick={() => handleMigrateTask(task)} title={t(lang, 'migrateTask')}>
                          <Plus size={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="unfinished-empty-praise">
                  <div className="unfinished-empty-emoji">
                    {['🎉', '🔥', '✨', '🚀', '🌟', '💪', '🏆', '💯', '🎈', '👍'][randomEmojiIdx.current]}
                  </div>
                  <div className="unfinished-empty-copy">
                    {[
                      "어제 모든 계획을 완료했어요!",
                      "어제는 정말 알찬 하루였네요!",
                      "할 일을 완벽히 비우셨군요!",
                      "밀린 일 없는 깔끔한 오늘입니다!",
                      "완벽한 하루를 보낸 스스로를 칭찬해주세요!",
                      "목표를 모두 이룬 멋진 하루였어요!",
                      "어제의 당신이 자랑스럽습니다!",
                      "오늘도 어제처럼 멋지게 해내보아요!",
                      "훌륭합니다! 모든 일정을 마쳤어요.",
                      "어제 못한 일이 하나도 없네요! 대단해요!"
                    ][randomMsgIdx.current]}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Frequent Tasks Modal */}
      {showStreakModal && (
        <div className="freq-modal-overlay" onClick={() => setShowStreakModal(false)}>
          <div className="streak-modal" onClick={e => e.stopPropagation()}>
            <div className="streak-modal-header">
              <div className="streak-modal-title">
                <Flame size={17} className="streak-icon" />
                <h3>{t(lang, 'streakStatsTitle')}</h3>
              </div>
              <button className="icon-btn" onClick={() => setShowStreakModal(false)}><X size={18} /></button>
            </div>

            <div className="streak-stat-grid">
              <div className="streak-stat-card">
                <span className="streak-stat-label">{t(lang, 'currentStreak')}</span>
                <strong>{streak}</strong>
                <small>{t(lang, 'daysUnit')}</small>
              </div>
              <div className="streak-stat-card highlight">
                <span className="streak-stat-label">{t(lang, 'bestStreakDays')}</span>
                <strong>{streakStats.longestDays}</strong>
                <small>{t(lang, 'daysUnit')}</small>
              </div>
              <div className="streak-stat-card wide">
                <span className="streak-stat-label">{t(lang, 'bestStreakWeeks')}</span>
                <strong>{streakStats.longestWeeks}{t(lang, 'weeksUnit')} {streakStats.longestWeekDays}{t(lang, 'daysUnit')}</strong>
                <small>{t(lang, 'totalMarkedDays')}: {streakStats.totalMarkedDays}{t(lang, 'daysUnit')}</small>
              </div>
            </div>
          </div>
        </div>
      )}

      {showFreqModal && (
        <div className="freq-modal-overlay" onClick={closeFreqModal}>
          <div className="freq-modal" onClick={e => e.stopPropagation()}>
            <div className="freq-modal-header">
              <h3><Star size={16} style={{ marginRight: 6 }} />{t(lang, 'frequentTasks')}</h3>
              <button className="icon-btn" onClick={closeFreqModal}><X size={20} /></button>
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

            <div className="freq-modal-footer">
              <button className="freq-cancel-btn" onClick={closeFreqModal}>
                {t(lang, 'freqCancel')}
              </button>
              <button
                className="freq-apply-btn"
                onClick={handleApplyFreqTasks}
                disabled={selectedFreqIds.size === 0}
              >
                {t(lang, 'freqAdd')} {selectedFreqIds.size > 0 ? `(${selectedFreqIds.size})` : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
