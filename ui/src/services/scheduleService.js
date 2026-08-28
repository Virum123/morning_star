import { api } from '../utils/api';
import {
  makeMigratedUnfinishedTaskKey,
  normalizeTaskIdentityText,
  getAppDateContext,
} from '../utils/plannerData';
import {
  bucketForDate,
  getDateFromPlannerFilePath,
  mapPlannerTaskToScheduleInsert,
  mapPlannerTaskToSchedulePatch,
  mapRowsToPlannerFiles,
  parsePlannerFileTasks,
  resolveTargetDate,
  taskLineToPlannerTask,
} from '../utils/scheduleMapper';
import {
  createSchedule as createSupabaseSchedule,
  deleteSchedule as deleteSupabaseSchedule,
  getSchedules as getSupabaseSchedules,
  updateSchedule as updateSupabaseSchedule,
} from '../repositories/supabaseScheduleRepository';

const FIRE_DAYS_STORAGE_KEY = 'ms_fire_days';
const MIGRATED_UNFINISHED_STORAGE_KEY = 'ms_migrated_unfinished_tasks';

let scheduleFileCache = new Map();

function readJsonStorage(key, fallbackValue) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallbackValue;
  } catch {
    return fallbackValue;
  }
}

function writeJsonStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getMigratedUnfinishedTasks() {
  const tasks = readJsonStorage(MIGRATED_UNFINISHED_STORAGE_KEY, []);
  return Array.isArray(tasks) ? tasks : [];
}

function saveMigratedUnfinishedTasks(tasks) {
  writeJsonStorage(MIGRATED_UNFINISHED_STORAGE_KEY, Array.isArray(tasks) ? tasks : []);
}

function rememberMigratedUnfinishedTask({ sourcePath, sourceDate, lineIndex, taskText }) {
  const nextTask = {
    source_path: sourcePath,
    source_date: sourceDate,
    line_index: lineIndex,
    task_text: taskText,
  };
  const nextKey = makeMigratedUnfinishedTaskKey(nextTask);
  if (!nextKey) return getMigratedUnfinishedTasks();

  const currentTasks = getMigratedUnfinishedTasks();
  const existingKeys = new Set(currentTasks.map(makeMigratedUnfinishedTaskKey).filter(Boolean));
  if (existingKeys.has(nextKey)) return currentTasks;

  const nextTasks = [...currentTasks, nextTask];
  saveMigratedUnfinishedTasks(nextTasks);
  return nextTasks;
}

function cacheFilesData(filesData = {}) {
  const nextCache = new Map();

  const cacheFile = (file) => {
    if (!file?.path) return;
    const dateStr = file.date || getDateFromPlannerFilePath(file.path);
    nextCache.set(file.path, {
      dateStr,
      rows: Array.isArray(file.scheduleRows) ? file.scheduleRows : [],
      file,
    });
  };

  (filesData.today || []).forEach(cacheFile);
  (filesData.tomorrow || []).forEach(cacheFile);
  Object.values(filesData.byDate || {}).forEach((files) => {
    (files || []).forEach(cacheFile);
  });

  scheduleFileCache = nextCache;
}

function getCachedRowsForDate(dateStr) {
  for (const fileInfo of scheduleFileCache.values()) {
    if (fileInfo.dateStr === dateStr) {
      return fileInfo.rows || [];
    }
  }
  return null;
}

async function loadSchedulesFromSupabase() {
  const rows = await getSupabaseSchedules();
  const filesData = mapRowsToPlannerFiles(rows);
  filesData.migratedUnfinishedTasks = getMigratedUnfinishedTasks();
  cacheFilesData(filesData);
  return filesData;
}

export async function getSchedules() {
  try {
    return await loadSchedulesFromSupabase();
  } catch (error) {
    console.error('Failed to load schedules.', error);
    throw error;
  }
}

async function ensureFileInfo(filepath) {
  let fileInfo = scheduleFileCache.get(filepath);
  if (fileInfo) return fileInfo;

  await loadSchedulesFromSupabase();
  fileInfo = scheduleFileCache.get(filepath);
  if (fileInfo) return fileInfo;

  const dateStr = getDateFromPlannerFilePath(filepath);
  if (dateStr) {
    return { dateStr, rows: [] };
  }

  return null;
}

async function getNextOrderIndex(dateStr) {
  let rows = getCachedRowsForDate(dateStr);
  if (rows) return rows.length;

  await loadSchedulesFromSupabase();
  rows = getCachedRowsForDate(dateStr);
  return rows ? rows.length : 0;
}

async function createTasksForDate(tasks, dateStr, startOrderIndex) {
  if (!dateStr) {
    throw new Error('일정을 추가할 날짜가 필요합니다.');
  }

  const baseOrderIndex = typeof startOrderIndex === 'number'
    ? startOrderIndex
    : await getNextOrderIndex(dateStr);
  const createdRows = [];

  for (let index = 0; index < tasks.length; index += 1) {
    const payload = mapPlannerTaskToScheduleInsert(tasks[index], {
      dateStr,
      orderIndex: baseOrderIndex + index,
      bucket: bucketForDate(dateStr),
    });
    createdRows.push(await createSupabaseSchedule(payload));
  }

  return createdRows;
}

function normalizeTaskTextForLookup(taskText = '') {
  try {
    return normalizeTaskIdentityText(taskLineToPlannerTask(taskText).title);
  } catch {
    return normalizeTaskIdentityText(taskText);
  }
}

function findCachedRowByTaskText(taskText = '') {
  const targetText = normalizeTaskTextForLookup(taskText);
  if (!targetText) return null;

  for (const fileInfo of scheduleFileCache.values()) {
    const match = (fileInfo.rows || []).find((row) => (
      normalizeTaskIdentityText(row.title) === targetText
    ));
    if (match) return match;
  }

  return null;
}

async function persistPlannerFileContent(filepath, content) {
  const fileInfo = await ensureFileInfo(filepath);
  const dateStr = fileInfo?.dateStr || getDateFromPlannerFilePath(filepath);
  if (!dateStr) {
    throw new Error(`일정 파일 날짜를 확인할 수 없습니다: ${filepath}`);
  }

  const existingRows = fileInfo?.rows || [];
  const nextTasks = parsePlannerFileTasks(content);
  const updatedRows = [];

  for (let index = 0; index < nextTasks.length; index += 1) {
    const task = nextTasks[index];
    const existingRow = existingRows[index];
    const payload = mapPlannerTaskToSchedulePatch(task, {
      dateStr,
      orderIndex: index,
      bucket: bucketForDate(dateStr),
    });

    if (existingRow?.id) {
      updatedRows.push(await updateSupabaseSchedule(existingRow.id, payload));
    } else {
      updatedRows.push(await createSupabaseSchedule(payload));
    }
  }

  for (let index = nextTasks.length; index < existingRows.length; index += 1) {
    if (existingRows[index]?.id) {
      await deleteSupabaseSchedule(existingRows[index].id, { showInTrash: false });
    }
  }

  return {
    success: true,
    content,
    rows: updatedRows,
    files: await loadSchedulesFromSupabase(),
  };
}

async function migrateUnfinishedTask({ sourcePath, sourceDate, lineIndex, taskText }) {
  if (!sourcePath || !sourceDate || typeof lineIndex !== 'number' || !taskText) {
    throw new Error('이전할 일정 정보가 부족합니다.');
  }

  await loadSchedulesFromSupabase();
  const todayStr = getAppDateContext().todayStr;
  const todayRows = getCachedRowsForDate(todayStr) || [];
  const normalizedTaskText = normalizeTaskIdentityText(taskText);
  const alreadyExists = todayRows.some((row) => (
    normalizeTaskIdentityText(row.title) === normalizedTaskText
  ));

  if (!alreadyExists) {
    await createTasksForDate([{ title: taskText, checked: false }], todayStr);
  }

  rememberMigratedUnfinishedTask({ sourcePath, sourceDate, lineIndex, taskText });

  return {
    success: true,
    files: await loadSchedulesFromSupabase(),
    copied_task: taskText,
    already_exists: alreadyExists,
  };
}

export async function createSchedule(schedule = {}) {
  const { target, files, taskLine, targetDate, frequentTasks } = schedule;

  try {
    if (target && Array.isArray(files)) {
      const dateStr = resolveTargetDate(schedule);
      const startOrderIndex = await getNextOrderIndex(dateStr);
      let orderOffset = 0;
      const createdRows = [];

      for (const file of files) {
        let tasks = parsePlannerFileTasks(file.content);
        if (tasks.length === 0 && file.content?.trim()) {
          tasks = [{ title: file.content.trim(), checked: false }];
        }
        createdRows.push(...await createTasksForDate(tasks, dateStr, startOrderIndex + orderOffset));
        orderOffset += tasks.length;
      }

      return {
        success: true,
        rows: createdRows,
        files: await loadSchedulesFromSupabase(),
      };
    }

    if (typeof taskLine === 'string' && targetDate) {
      const row = await createTasksForDate([taskLineToPlannerTask(taskLine)], targetDate);
      return {
        success: true,
        rows: row,
        files: await loadSchedulesFromSupabase(),
      };
    }

    if (Array.isArray(frequentTasks) && targetDate) {
      const tasks = frequentTasks
        .map((title) => ({ title, checked: false }))
        .filter((task) => task.title?.trim());
      const rows = await createTasksForDate(tasks, targetDate);
      return {
        success: true,
        rows,
        files: await loadSchedulesFromSupabase(),
      };
    }

    if (schedule.title || schedule.text || schedule.taskText) {
      const dateStr = resolveTargetDate(schedule);
      const rows = await createTasksForDate([{
        title: schedule.title || schedule.text || schedule.taskText,
        checked: schedule.status === 'completed',
        ...schedule,
      }], dateStr);
      return {
        success: true,
        rows,
        files: await loadSchedulesFromSupabase(),
      };
    }

    throw new Error('Unsupported schedule create request.');
  } catch (error) {
    console.error('Failed to create schedule.', error);
    throw error;
  }
}

export async function updateSchedule(schedule = {}, patch = {}) {
  if (typeof schedule === 'string') {
    try {
      const row = await updateSupabaseSchedule(schedule, patch);
      return {
        success: true,
        row,
        files: await loadSchedulesFromSupabase(),
      };
    } catch (error) {
      console.error('Failed to update schedule.', error);
      throw error;
    }
  }

  const {
    filepath,
    path,
    content,
    normalizeTasks = false,
    sourcePath,
    sourceDate,
    lineIndex,
    taskText,
  } = schedule;

  try {
    const filePath = filepath || path;
    if (filePath && typeof content === 'string') {
      return await persistPlannerFileContent(filePath, content, { normalizeTasks });
    }

    if (sourcePath && sourceDate && typeof lineIndex === 'number' && taskText) {
      return await migrateUnfinishedTask({ sourcePath, sourceDate, lineIndex, taskText });
    }

    throw new Error('Unsupported schedule update request.');
  } catch (error) {
    console.error('Failed to update schedule.', error);
    throw error;
  }
}

export async function deleteSchedule(schedule = {}) {
  try {
    const id = typeof schedule === 'string'
      ? schedule
      : schedule.id || schedule.scheduleId;

    if (id) {
      const row = await deleteSupabaseSchedule(id);
      return {
        success: true,
        row,
        files: await loadSchedulesFromSupabase(),
      };
    }

    const taskText = schedule.taskText || schedule.title || schedule.text;
    if (taskText) {
      await loadSchedulesFromSupabase();
      const row = findCachedRowByTaskText(taskText);
      if (!row?.id) {
        return { success: true };
      }

      await deleteSupabaseSchedule(row.id);
      return {
        success: true,
        files: await loadSchedulesFromSupabase(),
      };
    }

    throw new Error('Unsupported schedule delete request.');
  } catch (error) {
    console.error('Failed to delete schedule.', error);
    throw error;
  }
}

export async function getScheduleActivityLog() {
  return api.readActivityLog();
}

export async function recordScheduleActivity(action, message, details = {}) {
  return api.recordActivity?.(action, message, details);
}

export async function getFrequentSchedules() {
  return api.getFrequentTasks();
}

export async function saveFrequentSchedules(tasks) {
  return api.saveFrequentTasks(tasks);
}

export function getScheduleCompletionDays() {
  try {
    const rawFireDays = localStorage.getItem(FIRE_DAYS_STORAGE_KEY);
    return rawFireDays ? JSON.parse(rawFireDays) : {};
  } catch {
    return {};
  }
}

export function saveScheduleCompletionDays(fireDays) {
  localStorage.setItem(FIRE_DAYS_STORAGE_KEY, JSON.stringify(fireDays || {}));
  return fireDays || {};
}
