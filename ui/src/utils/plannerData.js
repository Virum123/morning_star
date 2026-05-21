import { appTodayDate, localDateStr } from './date';

export function parseChecklist(content = '') {
  if (!content) return { items: [], checked: 0, total: 0 };
  const lines = content.split('\n');
  const items = [];
  let checked = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const matchDone = line.match(/^\s*[-*+]\s+\[x\]\s*(.*)/i);
    const matchTodo = line.match(/^\s*[-*+]\s+\[ *\]\s*(.*)/);
    if (matchDone) {
      items.push({ text: matchDone[1].trim(), checked: true, lineIndex });
      checked += 1;
    } else if (matchTodo) {
      items.push({ text: matchTodo[1].trim(), checked: false, lineIndex });
    }
  }

  return { items, checked, total: items.length };
}

export function normalizeTaskIdentityText(text = '') {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

export function makeMigratedUnfinishedTaskKey(task = {}) {
  const sourceDate = task.source_date || task.sourceDate || task.date || '';
  const sourcePath = task.source_path || task.sourcePath || task.filePath || '';
  const lineIndex = Number(task.line_index ?? task.lineIndex);
  const taskText = normalizeTaskIdentityText(task.task_text || task.taskText || task.text || '');
  if (!sourceDate || !sourcePath || Number.isNaN(lineIndex) || !taskText) return '';
  return `${sourceDate}::${sourcePath}::${lineIndex}::${taskText}`;
}

export function getMigratedUnfinishedTaskKeys(filesData = {}) {
  const migratedTasks = filesData.migratedUnfinishedTasks || filesData.migrated_unfinished_tasks || [];
  if (!Array.isArray(migratedTasks)) return new Set();
  return new Set(migratedTasks.map(makeMigratedUnfinishedTaskKey).filter(Boolean));
}

export function getAppDateContext() {
  const todayDate = appTodayDate();
  const todayStr = localDateStr(todayDate);
  const tomorrowDate = new Date(todayDate);
  tomorrowDate.setDate(todayDate.getDate() + 1);
  const tomorrowStr = localDateStr(tomorrowDate);

  return { todayDate, todayStr, tomorrowStr };
}

export function getByDateFiles(filesData = {}) {
  return filesData.byDate || filesData.yesterday || {};
}

export function getDateBucket(dateStr, { todayStr, tomorrowStr }) {
  if (dateStr === todayStr) return 'today';
  if (dateStr === tomorrowStr) return 'tomorrow';
  return 'byDate';
}

function getFilePlanDateKey(file = {}) {
  const addedDate = typeof file.added_date === 'string' ? file.added_date : '';
  const addedDateMatch = addedDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (addedDateMatch) {
    return `${addedDateMatch[1]}-${addedDateMatch[2]}-${addedDateMatch[3]}`;
  }

  const fallbackSource = `${file.filename || ''} ${file.path || ''}`;
  const compactDateMatch = fallbackSource.match(/(\d{4})(\d{2})(\d{2})/);
  if (compactDateMatch) {
    return `${compactDateMatch[1]}-${compactDateMatch[2]}-${compactDateMatch[3]}`;
  }

  return '';
}

export function selectLatestPlanFiles(files = []) {
  if (!Array.isArray(files) || files.length <= 1) return files || [];

  const planDates = files
    .map(getFilePlanDateKey)
    .filter(Boolean)
    .sort();

  const uniquePlanDates = [...new Set(planDates)];
  if (uniquePlanDates.length <= 1) return files;

  const latestPlanDate = uniquePlanDates[uniquePlanDates.length - 1];
  return files.filter((file) => getFilePlanDateKey(file) === latestPlanDate);
}

export function getFilesForDate(dateStr, filesData = {}, context, options = {}) {
  const bucket = getDateBucket(dateStr, context);

  if (bucket === 'today') {
    const todayFiles = filesData.today || [];
    return options.latestToday ? selectLatestPlanFiles(todayFiles) : todayFiles;
  }

  if (bucket === 'tomorrow') return filesData.tomorrow || [];

  return getByDateFiles(filesData)[dateStr] || [];
}

export function summarizeDateFiles(files = []) {
  const tasks = [];
  let checked = 0;
  let total = 0;

  files.forEach((file, fileIndex) => {
    const parsed = parseChecklist(file.content);
    checked += parsed.checked;
    total += parsed.total;
    parsed.items.forEach((item) => {
      tasks.push({
        ...item,
        file,
        fileIndex,
        key: `${file.path || file.filename}-${item.lineIndex}-${item.text}`,
      });
    });
  });

  const completed = tasks.filter((task) => task.checked);
  const unfinished = tasks.filter((task) => !task.checked);

  return {
    files,
    tasks,
    completed,
    unfinished,
    checked,
    total,
    remaining: total - checked,
  };
}

export function buildCompletedDateFireDays(filesData = {}, context = getAppDateContext()) {
  const completedDays = {};
  const todayStr = context?.todayStr || getAppDateContext().todayStr;

  const markIfComplete = (dateStr, files = [], options = {}) => {
    if (!dateStr || dateStr > todayStr) return;

    const sourceFiles = options.latestOnly ? selectLatestPlanFiles(files) : files;
    const summary = summarizeDateFiles(sourceFiles);
    if (summary.total > 0 && summary.checked >= summary.total) {
      completedDays[dateStr] = true;
    }
  };

  markIfComplete(todayStr, filesData.today || [], { latestOnly: true });

  Object.entries(getByDateFiles(filesData)).forEach(([dateStr, files]) => {
    markIfComplete(dateStr, files);
  });

  return completedDays;
}

export function buildDateSummaries(filesData = {}, context) {
  return Object.entries(getByDateFiles(filesData))
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateStr, files]) => ({
      dateStr,
      bucket: getDateBucket(dateStr, context),
      ...summarizeDateFiles(files),
    }));
}
