import { localDateStr } from './date';
import { getAppDateContext, getDateBucket } from './plannerData';

const PLANNER_FILE_PATH_PREFIX = 'supabase://schedule_items/';
const DEFAULT_ITEM_TYPE = 'task';
const DEFAULT_STATUS = 'active';

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatLocalDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function normalizeTitle(title = '') {
  return String(title || '').replace(/\s+/g, ' ').trim();
}

function isCompletedStatus(status = '') {
  return ['completed', 'done', 'checked'].includes(String(status).toLowerCase());
}

export function buildPlannerFilePath(dateStr) {
  return `${PLANNER_FILE_PATH_PREFIX}${dateStr}`;
}

export function getDateFromPlannerFilePath(filepath = '') {
  if (typeof filepath !== 'string') return '';
  if (filepath.startsWith(PLANNER_FILE_PATH_PREFIX)) {
    return filepath.slice(PLANNER_FILE_PATH_PREFIX.length);
  }

  const match = filepath.match(/(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

export function getScheduleDateStr(row = {}) {
  const date = new Date(row.start_at || row.startAt);
  if (Number.isNaN(date.getTime())) return '';
  return localDateStr(date);
}

export function dateStrToStartAt(dateStr, orderIndex = 0) {
  if (!dateStr) {
    throw new Error('일정 날짜가 필요합니다.');
  }

  // 기존 앱은 날짜 단위 markdown 파일만 갖고 있으므로, 날짜만 있는 일정은
  // 로컬 00:00부터 행 순서대로 1분씩 더해 같은 날짜 안의 정렬 순서를 보존한다.
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`유효하지 않은 일정 날짜입니다: ${dateStr}`);
  }

  date.setMinutes(date.getMinutes() + Number(orderIndex || 0));
  return date.toISOString();
}

export function bucketForDate(dateStr, context = getAppDateContext()) {
  const bucket = getDateBucket(dateStr, context);
  return bucket === 'byDate' ? 'date' : bucket;
}

export function resolveTargetDate(input = {}, context = getAppDateContext()) {
  const explicitDate = input.targetDate || input.date || input.dateStr;
  if (explicitDate) return explicitDate;

  const explicitStartAt = input.start_at || input.startAt;
  if (explicitStartAt) {
    const startDate = new Date(explicitStartAt);
    if (!Number.isNaN(startDate.getTime())) {
      return localDateStr(startDate);
    }
  }

  if (input.target === 'today' || input.bucket === 'today') {
    return context.todayStr;
  }

  if (input.target === 'tomorrow' || input.bucket === 'tomorrow') {
    return context.tomorrowStr;
  }

  if (typeof input.target === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.target)) {
    return input.target;
  }

  return '';
}

export function parsePlannerFileTasks(content = '') {
  return String(content || '')
    .split('\n')
    .map((line, lineIndex) => {
      const doneMatch = line.match(/^\s*[-*+]\s+\[x\]\s*(.*)/i);
      const todoMatch = line.match(/^\s*[-*+]\s+\[ *\]\s*(.*)/);
      const match = doneMatch || todoMatch;
      if (!match) return null;

      const title = normalizeTitle(match[1]);
      if (!title) return null;

      return {
        title,
        checked: Boolean(doneMatch),
        status: doneMatch ? 'completed' : DEFAULT_STATUS,
        lineIndex,
      };
    })
    .filter(Boolean);
}

export function taskLineToPlannerTask(taskLine = '') {
  const tasks = parsePlannerFileTasks(taskLine);
  if (tasks.length > 0) return tasks[0];

  const title = normalizeTitle(String(taskLine || '').replace(/^[-*+]\s*/, ''));
  if (!title) {
    throw new Error('일정 제목이 필요합니다.');
  }

  return {
    title,
    checked: false,
    status: DEFAULT_STATUS,
    lineIndex: 0,
  };
}

export function mapPlannerTaskToScheduleInsert(task = {}, { dateStr, orderIndex = 0, bucket } = {}) {
  const title = normalizeTitle(task.title || task.text || task.taskText);
  if (!title) {
    throw new Error('일정 제목이 필요합니다.');
  }

  return {
    title,
    memo: task.memo ?? null,
    start_at: task.start_at || task.startAt || dateStrToStartAt(dateStr, orderIndex),
    end_at: task.end_at ?? task.endAt ?? null,
    bucket: bucket || bucketForDate(dateStr),
    item_type: task.item_type || task.itemType || DEFAULT_ITEM_TYPE,
    status: task.status || (task.checked ? 'completed' : DEFAULT_STATUS),
  };
}

export function mapPlannerTaskToSchedulePatch(task = {}, { dateStr, orderIndex = 0, bucket } = {}) {
  return {
    title: normalizeTitle(task.title || task.text || task.taskText),
    memo: task.memo,
    start_at: task.start_at || task.startAt || dateStrToStartAt(dateStr, orderIndex),
    end_at: task.end_at ?? task.endAt,
    bucket: bucket || bucketForDate(dateStr),
    item_type: task.item_type || task.itemType || DEFAULT_ITEM_TYPE,
    status: task.status || (task.checked ? 'completed' : DEFAULT_STATUS),
  };
}

function rowToChecklistLine(row = {}) {
  const marker = isCompletedStatus(row.status) ? 'x' : ' ';
  return `- [${marker}] ${row.title || ''}`;
}

function compareRows(left, right) {
  const leftStart = new Date(left.start_at || 0).getTime();
  const rightStart = new Date(right.start_at || 0).getTime();
  if (leftStart !== rightStart) return leftStart - rightStart;

  const leftCreated = new Date(left.created_at || 0).getTime();
  const rightCreated = new Date(right.created_at || 0).getTime();
  return leftCreated - rightCreated;
}

export function mapRowsToPlannerFiles(rows = [], context = getAppDateContext()) {
  const filesData = {
    tomorrow: [],
    today: [],
    byDate: {},
    yesterday: {},
    trash: [],
    migratedUnfinishedTasks: [],
  };

  const rowsByDate = new Map();
  rows.forEach((row) => {
    const dateStr = getScheduleDateStr(row);
    if (!dateStr) return;
    if (!rowsByDate.has(dateStr)) {
      rowsByDate.set(dateStr, []);
    }
    rowsByDate.get(dateStr).push(row);
  });

  [...rowsByDate.entries()]
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .forEach(([dateStr, dateRows]) => {
      const sortedRows = [...dateRows].sort(compareRows);
      const content = sortedRows.map(rowToChecklistLine).join('\n');
      const file = {
        filename: `schedule_${dateStr}.md`,
        path: buildPlannerFilePath(dateStr),
        added_date: formatLocalDateTime(sortedRows[0]?.created_at || sortedRows[0]?.start_at),
        content: content ? `${content}\n` : '',
        scheduleRows: sortedRows,
        scheduleIds: sortedRows.map((row) => row.id),
        date: dateStr,
      };

      const bucket = getDateBucket(dateStr, context);
      if (bucket === 'today') {
        filesData.today.push(file);
      } else if (bucket === 'tomorrow') {
        filesData.tomorrow.push(file);
      } else {
        filesData.byDate[dateStr] = [file];
      }
    });

  filesData.yesterday = filesData.byDate;
  return filesData;
}
