const isDev = () => !window.pywebview;

export const api = {
  getConfig: async () => {
    if (isDev()) {
      return {
        target_times: ["06:00", "07:30"],
        theme: "light",
        files: { tomorrow: [], today: [], yesterday: {} },
        last_display_date: "2026-02-17",
        triggered_times_today: []
      };
    }
    return window.pywebview.api.get_config();
  },
  
  saveConfig: async (config) => {
    if (isDev()) {
      console.log("Mock save config:", config);
      return { success: true };
    }
    return window.pywebview.api.save_config(config);
  },

  readAllFiles: async () => {
    if (isDev()) {
      return { tomorrow: [], today: [], yesterday: {} };
    }
    return window.pywebview.api.read_all_files();
  },

  addFileDialog: async (target) => {
    if (isDev()) {
      console.log("Mock add file dialog to target:", target);
      return { tomorrow: [], today: [], yesterday: {} };
    }
    return window.pywebview.api.add_file_dialog(target);
  },
  
  processDroppedContent: async (target, filesData) => {
    if (isDev()) {
      console.log("Mock dropped files to target:", target, filesData);
      return await api.getConfig();
    }
    return window.pywebview.api.process_dropped_content(target, filesData);
  },

  updateFileContent: async (filepath, content) => {
    if (isDev()) {
      console.log(`Mock update file content for ${filepath}`);
      return { success: true };
    }
    return window.pywebview.api.update_file_content(filepath, content);
  },
  
  removeFile: async (target, pathToRemove, dateKey = null) => {
    if (isDev()) {
        console.log(`Mock remove file path: ${pathToRemove} from ${target}`);
        return await api.getConfig();
    }
    return window.pywebview.api.remove_file(target, pathToRemove, dateKey);
  },

  closeWindow: () => {
    if (isDev()) {
      console.log("Mock close window requested.");
    } else {
      window.pywebview.api.close();
    }
  }
};
