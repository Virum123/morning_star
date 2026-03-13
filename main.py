import os
import sys
import json
import datetime
import winreg
import shutil
import ctypes
import subprocess

global_mutex = None

def acquire_single_instance():
    global global_mutex
    kernel32 = ctypes.windll.kernel32
    global_mutex = kernel32.CreateMutexW(None, False, "MorningStarBackgroundMutex")
    if kernel32.GetLastError() == 183: # ERROR_ALREADY_EXISTS
        return False
    return True

def get_app_dir():
    app_data = os.getenv('LOCALAPPDATA')
    if not app_data:
        app_data = os.path.expanduser('~')
    app_dir = os.path.join(app_data, 'MorningStar')
    os.makedirs(app_dir, exist_ok=True)
    return app_dir

CONFIG_FILE = os.path.join(get_app_dir(), "config.json")

def load_config():
    if not os.path.exists(CONFIG_FILE):
        return {
            "target_times": ["06:00"],
            "theme": "light",
            "files": {
                "tomorrow": [],
                "today": [],
                "yesterday": {} # { "YYYY-MM-DD": [ {...} ] }
            },
            "last_display_date": "",
            "triggered_times_today": []
        }
    with open(CONFIG_FILE, "r", encoding="utf-8") as f:
        conf = json.load(f)
        
        # Migrate old configs if necessary
        if "target_time" in conf and "target_times" not in conf:
            conf["target_times"] = [conf["target_time"]]
        
        # If files is a flat list from previous version, convert to new structure
        if "files" not in conf or isinstance(conf["files"], list):
            conf["files"] = {
                "tomorrow": [],
                "today": conf.get("files", []),
                "yesterday": {}
            }
            
        if "theme" not in conf:
            conf["theme"] = "light"
            
        if "triggered_times_today" not in conf:
            conf["triggered_times_today"] = []
            
        return conf

def save_config(config):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=4, ensure_ascii=False)

def perform_daily_migration(config, today_str):
    """
    하루가 지났을 때 파일들을 마이그레이션합니다.
    Tomorrow -> Today
    Today -> Yesterday (어제 날짜 Key로 저장)
    """
    last_date = config.get("last_display_date", "")
    
    if last_date and last_date != today_str:
        files = config.get("files", {})
        
        today_files = files.get("today", [])
        tomorrow_files = files.get("tomorrow", [])
        yesterday_dict = files.get("yesterday", {})
        
        # 1. Move Today -> Yesterday (using last_date as the key)
        if today_files:
            if last_date not in yesterday_dict:
                yesterday_dict[last_date] = []
            yesterday_dict[last_date].extend(today_files)
            
        # 2. Move Tomorrow -> Today
        files["today"] = tomorrow_files
        files["tomorrow"] = []
        files["yesterday"] = yesterday_dict
        
        config["files"] = files

    config["last_display_date"] = today_str
    config["triggered_times_today"] = []
    
    return config

def check_should_run(config):
    now = datetime.datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    
    if config.get("last_display_date") != today_str:
        config = perform_daily_migration(config, today_str)
        save_config(config)
        
    triggered_today = config.get("triggered_times_today", [])
    target_times = config.get("target_times", [])
    
    for time_str in target_times:
        if time_str in triggered_today:
            continue
            
        try:
            target_hour, target_minute = map(int, time_str.split(":"))
            target_time = now.replace(hour=target_hour, minute=target_minute, second=0, microsecond=0)
            
            if now >= target_time:
                return time_str
        except ValueError:
            print(f"Invalid target_time format: {time_str}")
            
    return None

def show_notification(title, message):
    """Show a native Windows tray notification using plyer (if installed)."""
    try:
        from plyer import notification
        notification.notify(
            title=title,
            message=message,
            app_name='Morning Star',
            timeout=5
        )
    except Exception as e:
        print(f"Notification failed (install plyer with: pip install plyer): {e}")


def setup_startup():
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_SET_VALUE)
        script_path = os.path.abspath(__file__)
        if hasattr(sys, 'frozen'):
            script_path = sys.executable
        winreg.SetValueEx(key, "MorningStar", 0, winreg.REG_SZ, f'"{script_path}" --startup')
        winreg.CloseKey(key)
        print("Successfully registered to run on Windows startup.")
    except Exception as e:
        print(f"Failed to register startup: {e}")

class Api:
    def __init__(self, config):
        self.config = config

    def get_config(self):
        return self.config

    def save_config(self, new_config):
        self.config.update(new_config)
        save_config(self.config)
        return {"success": True}

    def get_file_content(self, filepath):
        if not filepath:
            return None
        # Use absolute path if it's already one, else assume it's relative to app_data/tasks (though config stores absolute now for simplicity)
        if os.path.exists(filepath):
            with open(filepath, "r", encoding="utf-8") as f:
                return f.read()
        return None
        
    def read_all_files(self):
        """React에서 호출 시 전체 구조화된 파일 내용과 메타데이터를 반환합니다."""
        files = self.config.get("files", {
            "tomorrow": [],
            "today": [],
            "yesterday": {}
        })
        
        result = {
            "tomorrow": [],
            "today": [],
            "yesterday": {}
        }
        
        # Populate Tomorrow
        for f in files.get("tomorrow", []):
            f_copy = dict(f)
            f_copy["content"] = self.get_file_content(f["path"])
            result["tomorrow"].append(f_copy)
            
        # Populate Today
        for f in files.get("today", []):
            f_copy = dict(f)
            f_copy["content"] = self.get_file_content(f["path"])
            result["today"].append(f_copy)
            
        # Populate Yesterday history
        yesterday_dict = files.get("yesterday", {})
        for date_key, date_files in yesterday_dict.items():
            result["yesterday"][date_key] = []
            for f in date_files:
                f_copy = dict(f)
                f_copy["content"] = self.get_file_content(f["path"])
                result["yesterday"][date_key].append(f_copy)
                
        return result

    def _copy_to_internal_storage(self, source_path):
        """Copies an external file into the app's internal storage and returns the new path."""
        try:
            app_data_dir = os.path.join(get_app_dir(), "app_data", "tasks")
            os.makedirs(app_data_dir, exist_ok=True)
            
            filename = os.path.basename(source_path)
            # Add timestamp to ensure uniqueness
            timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
            unique_filename = f"{timestamp}_{filename}"
            
            dest_path = os.path.join(app_data_dir, unique_filename)
            shutil.copy2(source_path, dest_path)
            return dest_path
        except Exception as e:
            print(f"Failed to copy file {source_path}: {e}")
            return source_path # Fallback to original if copy fails

    def _save_content_to_internal_storage(self, filename, content):
        """Saves string content to internal storage returning the new path."""
        import base64
        try:
            app_data_dir = os.path.join(get_app_dir(), "app_data", "tasks")
            os.makedirs(app_data_dir, exist_ok=True)
            
            timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
            unique_filename = f"{timestamp}_{filename}"
            dest_path = os.path.join(app_data_dir, unique_filename)
            
            if content.startswith('data:'):
                try:
                    # e.g. "data:text/markdown;base64,..."
                    header, b64 = content.split(',', 1)
                    raw_content = base64.b64decode(b64).decode('utf-8')
                except Exception:
                    raw_content = content # Fallback to plain string
            else:
                raw_content = content

            with open(dest_path, "w", encoding="utf-8") as f:
                f.write(raw_content)
                
            return dest_path
        except Exception as e:
            print(f"Failed to save content {filename}: {e}")
            return None

    def update_file_content(self, filepath, content):
        """React에서 체크박스를 클릭했을 때 기존 파일의 내용을 덮어씁니다."""
        try:
            if os.path.exists(filepath):
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(content)
                return {"success": True}
            return {"success": False, "error": "File not found"}
        except Exception as e:
            print(f"Failed to update file {filepath}: {e}")
            return {"success": False, "error": str(e)}

    def add_file_dialog(self, target):
        import webview
        # Only allow markdown files as requested
        file_types = ('Markdown Files (*.md)', 'All files (*.*)')
        result = window.create_file_dialog(webview.OPEN_DIALOG, allow_multiple=True, file_types=file_types)
        
        if result:
            files_struct = self.config.get("files", {
                "tomorrow": [], "today": [], "yesterday": {}
            })
            
            target_list = files_struct.get(target, [])
            existing_paths = [f["path"] for f in target_list]
            added_any = False
            
            for path in result:
                if path.lower().endswith('.md'):
                    internal_path = self._copy_to_internal_storage(path)
                    # Don't add if the internal path somehow duplicates an existing one
                    if internal_path not in existing_paths:
                        target_list.append({
                            "path": internal_path,
                            "filename": os.path.basename(path), # Keep original filename for display
                            "added_date": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        })
                        added_any = True
            
            if added_any:
                files_struct[target] = target_list
                self.config["files"] = files_struct
                save_config(self.config)
            
            return self.config["files"]
        return None

    def process_dropped_content(self, target, files_data_list):
        files_struct = self.config.get("files", {
            "tomorrow": [], "today": [], "yesterday": {}
        })
        target_list = files_struct.get(target, [])
        added_any = False
        
        for file_obj in files_data_list:
            fname = file_obj.get("name", "")
            content = file_obj.get("content", "")
            if fname.lower().endswith('.md'):
                internal_path = self._save_content_to_internal_storage(fname, content)
                if internal_path:
                    target_list.append({
                        "path": internal_path,
                        "filename": fname,
                        "added_date": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    })
                    added_any = True
                
        if added_any:
            files_struct[target] = target_list
            self.config["files"] = files_struct
            save_config(self.config)
            
        return self.config["files"]
        
    def remove_file(self, target, pathToRemove, dateKey=None):
        """API method to manually remove a file from a specific category."""
        files_struct = self.config.get("files", {
            "tomorrow": [], "today": [], "yesterday": {}
        })
        
        if target == "tomorrow":
            files_struct["tomorrow"] = [f for f in files_struct.get("tomorrow", []) if f["path"] != pathToRemove]
        elif target == "today":
            files_struct["today"] = [f for f in files_struct.get("today", []) if f["path"] != pathToRemove]
        elif target == "yesterday" and dateKey:
            if dateKey in files_struct.get("yesterday", {}):
                files_struct["yesterday"][dateKey] = [f for f in files_struct["yesterday"][dateKey] if f["path"] != pathToRemove]
                # Clean up empty dates
                if not files_struct["yesterday"][dateKey]:
                    del files_struct["yesterday"][dateKey]
                    
        self.config["files"] = files_struct
        save_config(self.config)
        return self.config["files"]

    def close(self):
        window.destroy()

def get_html_path():
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, 'ui', 'dist', 'index.html')
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ui', 'dist', 'index.html')

def display_ui(config):
    import webview
    
    html_file = get_html_path()
    if not os.path.exists(html_file):
        print(f"Error: UI build not found at {html_file}. Run 'npm run build' inside the ui folder.")
        if not hasattr(sys, '_MEIPASS'):
            html_file = "http://localhost:5173"
        else:
            return
            
    api = Api(config)
    global window
    # Added drag_drop=True if it exists? pywebview handles file drops if we don't prevent them?
    window = webview.create_window('Morning Star', url=html_file, width=1100, height=750, js_api=api)
    webview.start()

def main():
    import time
    
    config = load_config()
    now = datetime.datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    
    if len(sys.argv) > 1:
        if sys.argv[1] == "--setup":
            setup_startup()
            return
        elif sys.argv[1] == "--test":
            print("Running UI test bypass...")
            if config.get("last_display_date") != today_str:
                config = perform_daily_migration(config, today_str)
                save_config(config)
            display_ui(config)
            return
        elif sys.argv[1] == "--startup":
            # Running from Windows Startup: stay silent in background and poll time
            if not acquire_single_instance():
                print("Background process already running. Exiting.")
                return
                
            while True:
                config = load_config()
                triggered_time = check_should_run(config)
                if triggered_time:
                    print(f"Triggered Morning Star at {triggered_time}")
                    if "triggered_times_today" not in config:
                        config["triggered_times_today"] = []
                    config["triggered_times_today"].append(triggered_time)
                    save_config(config)
                    show_notification("Morning Star", f"It's {triggered_time}, time for your morning routine!")
                    display_ui(config)
                time.sleep(60)
            return

    # If run manually by double-clicking the Exe (no args):
    # Enforce background process to start
    if hasattr(sys, 'frozen'):
        cmd = [sys.executable, "--startup"]
    else:
        cmd = [sys.executable, os.path.abspath(__file__), "--startup"]
    
    subprocess.Popen(cmd, creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, 'CREATE_NO_WINDOW') else 0)

    # Setup startup string to ensure --startup flag is present if configured in the past
    setup_startup()
    
    if config.get("last_display_date") != today_str:
        config = perform_daily_migration(config, today_str)
        save_config(config)
    
    print("Manually launched by user. Displaying Morning Star...")
    display_ui(config)

if __name__ == "__main__":
    main()
