import { getCurrentUser } from '../services/authService';
import {
  emptyDeletedSchedules,
  getDeletedSchedules,
  restoreSchedule,
} from '../repositories/supabaseScheduleRepository';

const usesWebFallback = () => !window.pywebview?.api;
const WEB_STORAGE_NAMESPACE = 'morning-star.web';

const getDefaultWebConfig = () => ({
  target_times: ['06:00'],
  themeMode: 'light',
  colorTheme: 'default',
  language: 'ko',
  nickname: 'Alex',
  files: {
    tomorrow: [],
    today: [],
    byDate: {},
    yesterday: {},
    trash: [],
  },
  activity_log: [],
  migrated_unfinished_tasks: [],
  triggered_times_today: [],
});

async function getWebStorageKey(name) {
  const user = await getCurrentUser();
  return `${WEB_STORAGE_NAMESPACE}.${user?.id || 'anonymous'}.${name}`;
}

async function readWebStorage(name, fallbackValue) {
  try {
    const storageKey = await getWebStorageKey(name);
    const rawValue = localStorage.getItem(storageKey);
    return rawValue ? JSON.parse(rawValue) : fallbackValue;
  } catch {
    return fallbackValue;
  }
}

async function writeWebStorage(name, value) {
  const storageKey = await getWebStorageKey(name);
  localStorage.setItem(storageKey, JSON.stringify(value));
  return value;
}

const mockByDate = {
  '2026-02-16': [
    {
      filename: 'past_tasks_2026-02-16.md',
      path: '/mock/past_tasks_2026-02-16.md',
      added_date: '2026-02-16 21:10:00',
      content: '# 지난 일정\n\n- [x] 운동 30분\n- [ ] 회고 작성\n- [ ] 데이터 정리',
    },
  ],
  '2026-02-19': [
    {
      filename: 'scheduled_2026-02-19.md',
      path: '/mock/scheduled_2026-02-19.md',
      added_date: '2026-02-17 08:20:00',
      content: '# 예정 일정\n\n- [ ] 고객 미팅 준비\n- [ ] 월간 리포트 초안',
    },
  ],
};

export const api = {
  getConfig: async () => {
    if (usesWebFallback()) {
      const defaultConfig = getDefaultWebConfig();
      const storedConfig = await readWebStorage('config', {});
      return { ...defaultConfig, ...storedConfig };
    }
    return window.pywebview.api.get_config();
  },
  
  saveConfig: async (config) => {
    if (usesWebFallback()) {
      const currentConfig = await readWebStorage('config', {});
      const nextConfig = { ...currentConfig, ...config };
      await writeWebStorage('config', nextConfig);
      return { success: true, config: nextConfig };
    }
    return window.pywebview.api.save_config(config);
  },

  readAllFiles: async () => {
    if (usesWebFallback()) {
      return {
        tomorrow: [],
        today: [
          {
            filename: '1순위.md',
            path: '/mock/1순위.md',
            content: '# 오늘의 최우선 태스크\n\n- [x] 아침 루틴 체크\n- [x] 이메일 확인\n- [ ] 디자인 리뷰 미팅 준비\n- [ ] 코드 리뷰 3건\n- [ ] PR 머지',
          },
          {
            filename: '업무.md',
            path: '/mock/업무.md',
            content: '# 업무 목록\n\n- [x] 슬랙 메시지 답장\n- [ ] 주간 보고서 작성\n- [ ] 팀장 면담',
          },
        ],
        byDate: mockByDate,
        yesterday: mockByDate,
        migratedUnfinishedTasks: [],
        trash: [
          {
            filename: 'trash_20260217120000_old_task.md',
            path: '/mock/trash_20260217120000_old_task.md',
            added_date: '2026-02-17 12:00:00',
            content: '- [ ] 더 이상 필요 없는 일정',
          },
        ],
      };
    }
    return window.pywebview.api.read_all_files();
  },

  readActivityLog: async () => {
    if (usesWebFallback()) {
      return readWebStorage('activity-log', []);
    }
    return window.pywebview.api.read_activity_log();
  },

  recordActivity: async (action, message, details = {}) => {
    if (usesWebFallback()) {
      const activityLog = await readWebStorage('activity-log', []);
      const nextActivityLog = [{
        timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
        action,
        message,
        details,
      }, ...activityLog].slice(0, 120);
      await writeWebStorage('activity-log', nextActivityLog);
      return { success: true, activity_log: nextActivityLog };
    }
    return window.pywebview.api.record_activity(action, message, details);
  },

  addFileDialog: async (target) => {
    if (usesWebFallback()) {
      return { tomorrow: [], today: [], byDate: mockByDate, yesterday: mockByDate };
    }
    return window.pywebview.api.add_file_dialog(target);
  },
  
  processDroppedContent: async (target, filesData) => {
    if (usesWebFallback()) {
      return await api.getConfig();
    }
    return window.pywebview.api.process_dropped_content(target, filesData);
  },

  updateFileContent: async (filepath, content, options = {}) => {
    if (usesWebFallback()) {
      return {
        success: true,
        content: options.normalizeTasks ? content : content,
      };
    }
    return window.pywebview.api.update_file_content(filepath, content, Boolean(options.normalizeTasks));
  },

  removeFile: async (target, pathToRemove, dateKey = null) => {
    if (usesWebFallback()) {
      return await api.getConfig();
    }
    return window.pywebview.api.remove_file(target, pathToRemove, dateKey);
  },

  emptyTrash: async () => {
    if (usesWebFallback()) {
      return emptyDeletedSchedules();
    }
    return window.pywebview.api.empty_trash();
  },

  restoreTrash: async (pathToRestore) => {
    if (usesWebFallback()) {
      return restoreSchedule(pathToRestore);
    }
    return window.pywebview.api.restore_trash(pathToRestore);
  },

  readTrashFiles: async () => {
    if (usesWebFallback()) {
      const deletedSchedules = await getDeletedSchedules();
      return deletedSchedules.map((schedule) => ({
        filename: schedule.title,
        path: schedule.id,
        added_date: schedule.deleted_at,
        content: schedule.title,
        original_text: schedule.title,
      }));
    }
    return window.pywebview.api.read_trash_files();
  },

  trashTask: async (taskText, originalFilename) => {
    if (usesWebFallback()) {
      return { success: true };
    }
    return window.pywebview.api.trash_task(taskText, originalFilename || 'deleted_task');
  },

  getFrequentTasks: async () => {
    if (usesWebFallback()) {
      return readWebStorage('frequent-tasks', []);
    }
    return window.pywebview.api.get_frequent_tasks();
  },

  saveFrequentTasks: async (tasks) => {
    if (usesWebFallback()) {
      const nextTasks = Array.isArray(tasks) ? tasks : [];
      await writeWebStorage('frequent-tasks', nextTasks);
      return { success: true, frequent_tasks: nextTasks };
    }
    return window.pywebview.api.save_frequent_tasks(tasks);
  },

  addTaskToDate: async (taskLine, targetDate) => {
    if (usesWebFallback()) {
      return { success: true };
    }
    return window.pywebview.api.add_task_to_date(taskLine, targetDate);
  },

  migrateUnfinishedTask: async ({ sourcePath, sourceDate, lineIndex, taskText }) => {
    if (usesWebFallback()) {
      return { success: true };
    }
    return window.pywebview.api.migrate_unfinished_task(sourcePath, sourceDate, lineIndex, taskText);
  },

  addFrequentTasksToDay: async (tasks, targetDate) => {
    if (usesWebFallback()) {
      return { success: true };
    }
    return window.pywebview.api.add_frequent_tasks_to_day(tasks, targetDate);
  },

  closeWindow: () => {
    if (usesWebFallback()) {
      return;
    } else {
      window.pywebview.api.close();
    }
  }
};
