import { api } from '../utils/api';
import {
  makeMigratedUnfinishedTaskKey,
  normalizeTaskIdentityText,
  getAppDateContext,
} from '../utils/plannerData';
import {
  bucketForDate,
  dateStrToStartAt,
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
let scheduleOperationQueue = Promise.resolve();
let scheduleCacheNeedsRefresh = false;

function queueScheduleOperation(operation) {
  const result = scheduleOperationQueue.then(operation);
  scheduleOperationQueue = result.catch(() => {
    scheduleCacheNeedsRefresh = true;
  });
  return result;
}

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

function rememberMigratedUnfinishedTask({
  sourcePath,
  sourceDate,
  lineIndex,
  taskText,
  resolution = 'today',
  targetDate = '',
}) {
  const nextTask = {
    source_path: sourcePath,
    source_date: sourceDate,
    line_index: lineIndex,
    task_text: taskText,
    resolution,
    target_date: targetDate,
  };
  const nextKey = makeMigratedUnfinishedTaskKey(nextTask);
  if (!nextKey) return getMigratedUnfinishedTasks();

  const currentTasks = getMigratedUnfinishedTasks();
  const nextTasks = [
    ...currentTasks.filter((task) => makeMigratedUnfinishedTaskKey(task) !== nextKey),
    nextTask,
  ];
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

function isCompletedScheduleRow(row = {}) {
  return ['completed', 'done', 'checked'].includes(String(row.status || '').toLowerCase());
}

function assertActiveSourceTask({ sourcePath, sourceDate, lineIndex, taskText }) {
  const sourceFile = scheduleFileCache.get(sourcePath);
  const sourceRow = sourceFile?.dateStr === sourceDate
    ? sourceFile.rows?.[lineIndex]
    : null;
  const sourceMatches = sourceRow
    && normalizeTaskIdentityText(sourceRow.title) === normalizeTaskIdentityText(taskText)
    && !isCompletedScheduleRow(sourceRow);

  if (!sourceMatches) {
    throw new Error('이 일정은 다른 곳에서 변경되었습니다. 새로고침 후 다시 확인해 주세요.');
  }

  return sourceRow;
}

async function loadSchedulesFromSupabase() {
  const rows = await getSupabaseSchedules();
  const filesData = mapRowsToPlannerFiles(rows);
  filesData.migratedUnfinishedTasks = getMigratedUnfinishedTasks();
  cacheFilesData(filesData);
  scheduleCacheNeedsRefresh = false;
  return filesData;
}

function applyConfirmedScheduleChanges({ rows = [], deletedIds = [] } = {}) {
  const rowsById = new Map([...scheduleFileCache.values()]
    .flatMap((fileInfo) => fileInfo.rows)
    .map((row) => [row.id, row]));
  deletedIds.forEach((id) => rowsById.delete(id));
  rows.forEach((row) => {
    if (row.deleted_at) rowsById.delete(row.id);
    else rowsById.set(row.id, row);
  });
  const files = mapRowsToPlannerFiles([...rowsById.values()]);
  files.migratedUnfinishedTasks = getMigratedUnfinishedTasks();
  cacheFilesData(files);
  return files;
}

async function finishScheduleMutation(result, changes) {
  const confirmedFiles = applyConfirmedScheduleChanges(changes);
  try {
    return { ...result, files: await loadSchedulesFromSupabase() };
  } catch (error) {
    // The write was acknowledged by the DB. A failed refresh must not turn it
    // into a failed save or invite the user to insert the same task again.
    console.error('Schedule saved, but refreshing schedules failed.', error);
    scheduleCacheNeedsRefresh = true;
    return { ...result, files: confirmedFiles };
  }
}

async function throwScheduleMutationError(error, changes) {
  const confirmedFiles = applyConfirmedScheduleChanges(changes);
  try {
    error.files = await loadSchedulesFromSupabase();
  } catch {
    error.files = confirmedFiles;
  }
  throw error;
}

export async function getSchedules() {
  return queueScheduleOperation(loadSchedulesFromSupabase);
}

async function ensureFileInfo(filepath) {
  if (scheduleCacheNeedsRefresh) await loadSchedulesFromSupabase();
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
  if (scheduleCacheNeedsRefresh) await loadSchedulesFromSupabase();
  let rows = getCachedRowsForDate(dateStr);
  if (!rows) {
    await loadSchedulesFromSupabase();
    rows = getCachedRowsForDate(dateStr);
  }
  const dayStart = new Date(dateStrToStartAt(dateStr)).getTime();
  return (rows || []).reduce((nextIndex, row) => {
    const orderIndex = Math.floor((new Date(row.start_at).getTime() - dayStart) / 60000);
    return Number.isFinite(orderIndex) ? Math.max(nextIndex, orderIndex + 1) : nextIndex;
  }, 0);
}

function scheduleTimePatch(row, startAt) {
  const patch = { start_at: startAt };
  if (row.end_at) {
    const duration = new Date(row.end_at).getTime() - new Date(row.start_at).getTime();
    if (Number.isFinite(duration)) {
      patch.end_at = new Date(new Date(startAt).getTime() + duration).toISOString();
    }
  }
  return patch;
}

async function reorderSchedules(filepath, scheduleIds) {
  await loadSchedulesFromSupabase();
  const fileInfo = await ensureFileInfo(filepath);
  const rows = fileInfo?.rows || [];
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  if (
    !fileInfo?.dateStr
    || scheduleIds.length !== rows.length
    || new Set(scheduleIds).size !== rows.length
    || scheduleIds.some((id) => !rowsById.has(id))
  ) {
    throw new Error('일정 목록이 변경되었습니다. 새로고침 후 다시 순서를 변경해 주세요.');
  }

  const updatedRows = [];
  try {
    for (let index = 0; index < scheduleIds.length; index += 1) {
      const id = scheduleIds[index];
      const startAt = dateStrToStartAt(fileInfo.dateStr, index);
      if (new Date(rowsById.get(id).start_at).getTime() !== new Date(startAt).getTime()) {
        updatedRows.push(await updateSupabaseSchedule(id, scheduleTimePatch(rowsById.get(id), startAt)));
      }
    }
  } catch (error) {
    return throwScheduleMutationError(error, { rows: updatedRows });
  }

  return finishScheduleMutation({ success: true }, { rows: updatedRows });
}

async function moveScheduleToDate(id, targetDate) {
  await loadSchedulesFromSupabase();
  const sourceRow = [...scheduleFileCache.values()]
    .flatMap((fileInfo) => fileInfo.rows)
    .find((row) => row.id === id);
  if (!sourceRow) {
    throw new Error('이 일정은 다른 곳에서 변경되었습니다. 새로고침 후 다시 확인해 주세요.');
  }

  const startAt = dateStrToStartAt(targetDate, await getNextOrderIndex(targetDate));
  const patch = { ...scheduleTimePatch(sourceRow, startAt), bucket: bucketForDate(targetDate) };
  const row = await updateSupabaseSchedule(id, patch);
  return finishScheduleMutation({ success: true, row }, { rows: [row] });
}

async function createTasksForDate(tasks, dateStr, startOrderIndex) {
  if (!dateStr) {
    throw new Error('일정을 추가할 날짜가 필요합니다.');
  }

  const baseOrderIndex = typeof startOrderIndex === 'number'
    ? startOrderIndex
    : await getNextOrderIndex(dateStr);
  const createdRows = [];

  try {
    for (let index = 0; index < tasks.length; index += 1) {
      const payload = mapPlannerTaskToScheduleInsert(tasks[index], {
        dateStr,
        orderIndex: baseOrderIndex + index,
        bucket: bucketForDate(dateStr),
      });
      createdRows.push(await createSupabaseSchedule(payload));
    }
  } catch (error) {
    return throwScheduleMutationError(error, { rows: createdRows });
  }

  applyConfirmedScheduleChanges({ rows: createdRows });
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

  return finishScheduleMutation({
    success: true,
    content,
    rows: updatedRows,
  }, { rows: updatedRows, deletedIds: existingRows.slice(nextTasks.length).map((row) => row.id) });
}

async function migrateUnfinishedTask({ sourcePath, sourceDate, lineIndex, taskText, targetDate }) {
  if (!sourcePath || !sourceDate || typeof lineIndex !== 'number' || !taskText) {
    throw new Error('이전할 일정 정보가 부족합니다.');
  }

  await loadSchedulesFromSupabase();
  assertActiveSourceTask({ sourcePath, sourceDate, lineIndex, taskText });
  const todayStr = getAppDateContext().todayStr;
  const resolvedTargetDate = targetDate || todayStr;
  if (resolvedTargetDate < todayStr) {
    throw new Error('지난 날짜로는 일정을 다시 정할 수 없습니다.');
  }

  const targetRows = getCachedRowsForDate(resolvedTargetDate) || [];
  const normalizedTaskText = normalizeTaskIdentityText(taskText);
  const alreadyExists = targetRows.some((row) => (
    !isCompletedScheduleRow(row)
    && normalizeTaskIdentityText(row.title) === normalizedTaskText
  ));

  if (!alreadyExists) {
    await createTasksForDate([{ title: taskText, checked: false }], resolvedTargetDate);
  }

  rememberMigratedUnfinishedTask({
    sourcePath,
    sourceDate,
    lineIndex,
    taskText,
    resolution: resolvedTargetDate === todayStr ? 'today' : 'scheduled',
    targetDate: resolvedTargetDate,
  });

  return finishScheduleMutation({
    success: true,
    copied_task: taskText,
    already_exists: alreadyExists,
    target_date: resolvedTargetDate,
  });
}

async function releaseUnfinishedTask({ sourcePath, sourceDate, lineIndex, taskText }) {
  if (!sourcePath || !sourceDate || typeof lineIndex !== 'number' || !taskText) {
    throw new Error('정리할 일정 정보가 부족합니다.');
  }

  await loadSchedulesFromSupabase();
  assertActiveSourceTask({ sourcePath, sourceDate, lineIndex, taskText });

  rememberMigratedUnfinishedTask({
    sourcePath,
    sourceDate,
    lineIndex,
    taskText,
    resolution: 'released',
  });

  return finishScheduleMutation({
    success: true,
    released_task: taskText,
  });
}

async function createScheduleRequest(schedule = {}) {
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

      return finishScheduleMutation({
        success: true,
        rows: createdRows,
      }, { rows: createdRows });
    }

    if (typeof taskLine === 'string' && targetDate) {
      const row = await createTasksForDate([taskLineToPlannerTask(taskLine)], targetDate);
      return finishScheduleMutation({
        success: true,
        rows: row,
      }, { rows: row });
    }

    if (Array.isArray(frequentTasks) && targetDate) {
      const tasks = frequentTasks
        .map((title) => ({ title, checked: false }))
        .filter((task) => task.title?.trim());
      const rows = await createTasksForDate(tasks, targetDate);
      return finishScheduleMutation({
        success: true,
        rows,
      }, { rows });
    }

    if (schedule.title || schedule.text || schedule.taskText) {
      const dateStr = resolveTargetDate(schedule);
      const rows = await createTasksForDate([{
        title: schedule.title || schedule.text || schedule.taskText,
        checked: schedule.status === 'completed',
        ...schedule,
      }], dateStr);
      return finishScheduleMutation({
        success: true,
        rows,
      }, { rows });
    }

    throw new Error('Unsupported schedule create request.');
  } catch (error) {
    console.error('Failed to create schedule.', error);
    throw error;
  }
}

async function updateScheduleRequest(schedule = {}, patch = {}) {
  if (typeof schedule === 'string') {
    try {
      const row = await updateSupabaseSchedule(schedule, patch);
      return finishScheduleMutation({
        success: true,
        row,
      }, { rows: [row] });
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
    targetDate,
    resolution,
  } = schedule;

  try {
    const filePath = filepath || path;
    if (filePath && Array.isArray(schedule.scheduleIds)) {
      return await reorderSchedules(filePath, schedule.scheduleIds);
    }

    if (schedule.id && targetDate) {
      return await moveScheduleToDate(schedule.id, targetDate);
    }

    if (filePath && typeof content === 'string') {
      return await persistPlannerFileContent(filePath, content, { normalizeTasks });
    }

    if (sourcePath && sourceDate && typeof lineIndex === 'number' && taskText) {
      if (resolution === 'released') {
        return await releaseUnfinishedTask({ sourcePath, sourceDate, lineIndex, taskText });
      }
      return await migrateUnfinishedTask({ sourcePath, sourceDate, lineIndex, taskText, targetDate });
    }

    throw new Error('Unsupported schedule update request.');
  } catch (error) {
    console.error('Failed to update schedule.', error);
    throw error;
  }
}

async function deleteScheduleRequest(schedule = {}) {
  try {
    const id = typeof schedule === 'string'
      ? schedule
      : schedule.id || schedule.scheduleId;

    if (id) {
      const row = await deleteSupabaseSchedule(id);
      return finishScheduleMutation({
        success: true,
        row,
      }, { deletedIds: [id] });
    }

    const taskText = schedule.taskText || schedule.title || schedule.text;
    if (taskText) {
      await loadSchedulesFromSupabase();
      const row = findCachedRowByTaskText(taskText);
      if (!row?.id) {
        return { success: true };
      }

      await deleteSupabaseSchedule(row.id);
      return finishScheduleMutation({
        success: true,
      }, { deletedIds: [row.id] });
    }

    throw new Error('Unsupported schedule delete request.');
  } catch (error) {
    console.error('Failed to delete schedule.', error);
    throw error;
  }
}

export function createSchedule(schedule = {}) {
  return queueScheduleOperation(() => createScheduleRequest(schedule));
}

export function updateSchedule(schedule = {}, patch = {}) {
  return queueScheduleOperation(() => updateScheduleRequest(schedule, patch));
}

export function deleteSchedule(schedule = {}) {
  return queueScheduleOperation(() => deleteScheduleRequest(schedule));
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
