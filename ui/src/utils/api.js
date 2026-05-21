const isDev = () => !window.pywebview;

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

const mockActivityLog = [
  {
    timestamp: '2026-02-17 08:30:00',
    action: 'unfinished_task_copied',
    message: "'회고 작성' 일정을 오늘로 옮겼습니다.",
    details: { source_date: '2026-02-16' },
  },
  {
    timestamp: '2026-02-17 06:02:00',
    action: 'date_promotion',
    message: '날짜별 예정 일정을 오늘/내일 화면으로 옮겼습니다.',
    details: { tomorrow: 1 },
  },
];

export const api = {
  getConfig: async () => {
    if (isDev()) {
      return {
        target_times: ["06:00", "07:30"],
        theme: "light",
        nickname: "Alex",
        files: {
          tomorrow: [],
          today: [],
          byDate: mockByDate,
          yesterday: mockByDate,
          trash: [],
        },
        activity_log: mockActivityLog,
        migrated_unfinished_tasks: [],
        last_display_date: "2026-02-17",
        triggered_times_today: []
      };
    }
    return window.pywebview.api.get_config();
  },
  
  saveConfig: async (config) => {
    if (isDev()) {
      return { success: true };
    }
    return window.pywebview.api.save_config(config);
  },

  readAllFiles: async () => {
    if (isDev()) {
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
    if (isDev()) {
      return mockActivityLog;
    }
    return window.pywebview.api.read_activity_log();
  },

  recordActivity: async (action, message, details = {}) => {
    if (isDev()) {
      mockActivityLog.unshift({
        timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
        action,
        message,
        details,
      });
      return { success: true, activity_log: mockActivityLog };
    }
    return window.pywebview.api.record_activity(action, message, details);
  },

  addFileDialog: async (target) => {
    if (isDev()) {
      return { tomorrow: [], today: [], byDate: mockByDate, yesterday: mockByDate };
    }
    return window.pywebview.api.add_file_dialog(target);
  },
  
  processDroppedContent: async (target, filesData) => {
    if (isDev()) {
      return await api.getConfig();
    }
    return window.pywebview.api.process_dropped_content(target, filesData);
  },

  updateFileContent: async (filepath, content, options = {}) => {
    if (isDev()) {
      return {
        success: true,
        content: options.normalizeTasks ? content : content,
      };
    }
    return window.pywebview.api.update_file_content(filepath, content, Boolean(options.normalizeTasks));
  },

  removeFile: async (target, pathToRemove, dateKey = null) => {
    if (isDev()) {
      return await api.getConfig();
    }
    return window.pywebview.api.remove_file(target, pathToRemove, dateKey);
  },

  emptyTrash: async () => {
    if (isDev()) {
      return { success: true };
    }
    return window.pywebview.api.empty_trash();
  },

  restoreTrash: async (pathToRestore) => {
    if (isDev()) {
      return { success: true };
    }
    return window.pywebview.api.restore_trash(pathToRestore);
  },

  readTrashFiles: async () => {
    if (isDev()) {
      return [
        {
          filename: 'trash_20260217120000_old_task.md',
          path: '/mock/trash_20260217120000_old_task.md',
          added_date: '2026-02-17 12:00:00',
          content: '- [ ] 더 이상 필요 없는 일정',
        },
      ];
    }
    return window.pywebview.api.read_trash_files();
  },

  trashTask: async (taskText, originalFilename) => {
    if (isDev()) {
      return { success: true };
    }
    return window.pywebview.api.trash_task(taskText, originalFilename || 'deleted_task');
  },

  getFrequentTasks: async () => {
    if (isDev()) {
      return ['아침 루틴 체크', '이메일 확인', '운동'];
    }
    return window.pywebview.api.get_frequent_tasks();
  },

  saveFrequentTasks: async (tasks) => {
    if (isDev()) {
      return { success: true };
    }
    return window.pywebview.api.save_frequent_tasks(tasks);
  },

  addTaskToDate: async (taskLine, targetDate) => {
    if (isDev()) {
      return { success: true };
    }
    return window.pywebview.api.add_task_to_date(taskLine, targetDate);
  },

  migrateUnfinishedTask: async ({ sourcePath, sourceDate, lineIndex, taskText }) => {
    if (isDev()) {
      return { success: true };
    }
    return window.pywebview.api.migrate_unfinished_task(sourcePath, sourceDate, lineIndex, taskText);
  },

  addFrequentTasksToDay: async (tasks, targetDate) => {
    if (isDev()) {
      return { success: true };
    }
    return window.pywebview.api.add_frequent_tasks_to_day(tasks, targetDate);
  },

  closeWindow: () => {
    if (isDev()) {
      return;
    } else {
      window.pywebview.api.close();
    }
  }
};
