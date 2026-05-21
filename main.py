import os
import sys
import json
import datetime
import shutil
import ctypes
import subprocess
import re

try:
    import winreg
except ImportError:
    winreg = None

IS_WINDOWS = sys.platform.startswith("win")

global_mutex = None
window = None


def get_legacy_non_windows_app_dir():
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), ".morning_star_data")


def migrate_legacy_non_windows_data(app_dir):
    if IS_WINDOWS:
        return

    legacy_dir = get_legacy_non_windows_app_dir()
    legacy_config = os.path.join(legacy_dir, "config.json")
    target_config = os.path.join(app_dir, "config.json")

    if not os.path.exists(legacy_config) or os.path.exists(target_config):
        return

    try:
        shutil.copytree(legacy_dir, app_dir, dirs_exist_ok=True)
        print(f"Migrated legacy data from {legacy_dir} to {app_dir}")
    except Exception as e:
        print(f"Failed to migrate legacy data: {e}")

def acquire_single_instance():
    if not IS_WINDOWS:
        return True
    global global_mutex
    kernel32 = ctypes.windll.kernel32
    global_mutex = kernel32.CreateMutexW(None, False, "MorningStarBackgroundMutex")
    if kernel32.GetLastError() == 183: # ERROR_ALREADY_EXISTS
        return False
    return True

def get_app_dir():
    custom_dir = os.getenv("MORNING_STAR_APP_DIR")
    if custom_dir:
        os.makedirs(custom_dir, exist_ok=True)
        return custom_dir

    if IS_WINDOWS:
        app_data = os.getenv('LOCALAPPDATA')
        if not app_data:
            app_data = os.path.expanduser('~')
        app_dir = os.path.join(app_data, 'MorningStar')
    elif sys.platform == "darwin":
        app_dir = os.path.join(
            os.path.expanduser("~/Library/Application Support"),
            "MorningStar",
        )
    else:
        base_dir = os.getenv("XDG_DATA_HOME")
        if not base_dir:
            base_dir = os.path.join(os.path.expanduser("~"), ".local", "share")
        app_dir = os.path.join(base_dir, "MorningStar")

    os.makedirs(app_dir, exist_ok=True)
    migrate_legacy_non_windows_data(app_dir)
    return app_dir

CONFIG_FILE = os.path.join(get_app_dir(), "config.json")
ACTIVITY_LOG_LIMIT = 120
MIGRATED_UNFINISHED_LIMIT = 500


def normalize_task_identity_text(text):
    return re.sub(r"\s+", " ", str(text or "")).strip()


def default_migrated_unfinished_tasks(items=None):
    if not isinstance(items, list):
        return []

    normalized = []
    seen = set()
    for item in items:
        if not isinstance(item, dict):
            continue

        source_date = str(item.get("source_date") or "").strip()
        source_path = str(item.get("source_path") or "").strip()
        try:
            line_index = int(item.get("line_index"))
        except (TypeError, ValueError):
            continue

        task_text = normalize_task_identity_text(item.get("task_text"))
        if not source_date or not source_path or line_index < 0 or not task_text:
            continue

        key = (source_date, source_path, line_index, task_text)
        if key in seen:
            continue
        seen.add(key)
        normalized.append({
            "source_date": source_date,
            "source_path": source_path,
            "line_index": line_index,
            "task_text": task_text,
        })

    return normalized[:MIGRATED_UNFINISHED_LIMIT]


def remember_migrated_unfinished_task(config, source_path, source_date, line_index, task_text):
    current = default_migrated_unfinished_tasks(config.get("migrated_unfinished_tasks", []))
    normalized_task = {
        "source_date": str(source_date or "").strip(),
        "source_path": str(source_path or "").strip(),
        "line_index": int(line_index),
        "task_text": normalize_task_identity_text(task_text),
    }

    next_items = [
        item
        for item in current
        if not (
            item["source_date"] == normalized_task["source_date"]
            and item["source_path"] == normalized_task["source_path"]
            and item["line_index"] == normalized_task["line_index"]
            and item["task_text"] == normalized_task["task_text"]
        )
    ]
    config["migrated_unfinished_tasks"] = [normalized_task, *next_items][:MIGRATED_UNFINISHED_LIMIT]


def merge_date_file_maps(*date_maps):
    merged = {}

    for date_map in date_maps:
        if not isinstance(date_map, dict):
            continue

        for date_key, entries in date_map.items():
            if not isinstance(date_key, str) or not isinstance(entries, list):
                continue

            target_entries = merged.setdefault(date_key, [])
            existing_paths = {
                entry.get("path")
                for entry in target_entries
                if isinstance(entry, dict)
            }

            for entry in entries:
                if not isinstance(entry, dict):
                    continue

                entry_path = entry.get("path")
                if entry_path in existing_paths:
                    continue

                target_entries.append(entry)
                existing_paths.add(entry_path)

    return merged


def default_files_struct(files=None):
    if not isinstance(files, dict):
        files = {}

    tomorrow = files.get("tomorrow", [])
    today = files.get("today", [])
    by_date = merge_date_file_maps(files.get("yesterday", {}), files.get("byDate", {}))
    trash = files.get("trash", [])

    if not isinstance(tomorrow, list):
        tomorrow = []
    if not isinstance(today, list):
        today = []
    if not isinstance(trash, list):
        trash = []

    return {
        "tomorrow": tomorrow,
        "today": today,
        "byDate": by_date,
        "yesterday": by_date,
        "trash": trash,
    }


def files_for_storage(files=None):
    normalized = default_files_struct(files)
    return {
        "tomorrow": normalized.get("tomorrow", []),
        "today": normalized.get("today", []),
        "byDate": normalized.get("byDate", {}),
        "trash": normalized.get("trash", []),
    }


def delete_file_entries(entries=None):
    deleted_paths = []
    if not isinstance(entries, list):
        return deleted_paths

    for entry in entries:
        if not isinstance(entry, dict):
            continue
        path = entry.get("path")
        if not path:
            continue
        try:
            if os.path.exists(path):
                os.remove(path)
                deleted_paths.append(path)
        except Exception as exc:
            print(f"Failed to delete file {path}: {exc}")

    return deleted_paths


def remove_legacy_postponed_files(files=None):
    if not isinstance(files, dict):
        return []
    deleted_paths = delete_file_entries(files.get("postponed", []))
    files.pop("postponed", None)
    return deleted_paths


def default_activity_log(log=None):
    if not isinstance(log, list):
        return []
    return [entry for entry in log if isinstance(entry, dict)][:ACTIVITY_LOG_LIMIT]


def record_activity(config, action, message, details=None):
    if not isinstance(config, dict):
        return None

    entry = {
        "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "action": action,
        "message": message,
        "details": details if isinstance(details, dict) else {},
    }
    config["activity_log"] = [entry, *default_activity_log(config.get("activity_log", []))][:ACTIVITY_LOG_LIMIT]
    return entry


def load_config():
    if not os.path.exists(CONFIG_FILE):
        return {
            "target_times": ["06:00"],
            "theme": "light",
            "files": default_files_struct(),
            "activity_log": [],
            "migrated_unfinished_tasks": [],
            "last_display_date": "",
            "triggered_times_today": []
        }
    with open(CONFIG_FILE, "r", encoding="utf-8") as f:
        conf = json.load(f)
        raw_files = conf.get("files", [])
        if isinstance(raw_files, dict):
            remove_legacy_postponed_files(raw_files)
        needs_files_storage_migration = (
            not isinstance(raw_files, dict)
            or "byDate" not in raw_files
            or "yesterday" in raw_files
            or "postponed" in raw_files
        )
        needs_config_storage_migration = (
            needs_files_storage_migration
            or "migrated_unfinished_tasks" not in conf
        )
        
        # Migrate old configs if necessary
        if "target_time" in conf and "target_times" not in conf:
            conf["target_times"] = [conf["target_time"]]
        
        # If files is a flat list from previous version, convert to new structure
        if "files" not in conf or isinstance(raw_files, list):
            conf["files"] = default_files_struct({
                "today": raw_files if isinstance(raw_files, list) else [],
            })
        else:
            conf["files"] = default_files_struct(raw_files)
            
        if "theme" not in conf:
            conf["theme"] = "light"
            
        if "triggered_times_today" not in conf:
            conf["triggered_times_today"] = []
            
        if "language" not in conf:
            conf["language"] = "ko"

        conf["activity_log"] = default_activity_log(conf.get("activity_log", []))
        conf["migrated_unfinished_tasks"] = default_migrated_unfinished_tasks(conf.get("migrated_unfinished_tasks", []))

        if needs_config_storage_migration:
            save_config(conf)
            
        return conf

def save_config(config):
    config_to_save = dict(config)
    if isinstance(config_to_save.get("files"), dict):
        config_to_save["files"] = files_for_storage(config_to_save["files"])
    config_to_save["activity_log"] = default_activity_log(config_to_save.get("activity_log", []))
    config_to_save["migrated_unfinished_tasks"] = default_migrated_unfinished_tasks(
        config_to_save.get("migrated_unfinished_tasks", [])
    )

    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config_to_save, f, indent=4, ensure_ascii=False)

def normalize_task_draft_content(content):
    text = (content or "").replace("\r\n", "\n").strip()
    if not text:
        return ""

    if "```" in text:
        return text

    normalized_lines = []

    def append_line(line):
        if line == "" and (not normalized_lines or normalized_lines[-1] == ""):
            return
        normalized_lines.append(line)

    for raw_line in text.split("\n"):
        line = raw_line.strip()
        if not line:
            append_line("")
            continue

        if re.match(r"^#{1,6}\s+", line):
            append_line(line)
            continue

        if re.match(r"^>\s*", line):
            append_line(line)
            continue

        if re.match(r"^\s*-\s*\[(?:\s|x|X)\]\s+", raw_line):
            append_line(raw_line.rstrip())
            continue

        line = re.sub(r"^(?:[-*•·]\s*|\d+[.)]\s+)", "", line).strip()
        if not line:
            continue

        fragments = [line]
        if not re.search(r"https?://", line):
            split_candidates = re.split(r"\s*(?:;|\||•|·|\/)\s*", line)
            if len(split_candidates) > 1 and all(candidate.strip() for candidate in split_candidates):
                fragments = [candidate.strip() for candidate in split_candidates]
            else:
                hyphen_candidates = re.split(r"\s+-\s*(?=\S)", line)
                if len(hyphen_candidates) > 1 and all(candidate.strip() for candidate in hyphen_candidates):
                    fragments = [candidate.strip() for candidate in hyphen_candidates]
                else:
                    comma_candidates = re.split(r"\s*,\s*", line)
                    if len(comma_candidates) > 1 and all(candidate.strip() for candidate in comma_candidates):
                        fragments = [candidate.strip() for candidate in comma_candidates]

        for fragment in fragments:
            append_line(f"- [ ] {fragment}")

    return "\n".join(normalized_lines).strip() or text

DAY_START_HOUR = 2  # 오전 2시 이전은 전날로 취급

EXPLICIT_DATE_RE = re.compile(r"(20\d{2})[-.](\d{2})[-.](\d{2})")

def get_app_today_str():
    now = datetime.datetime.now()
    if now.hour < DAY_START_HOUR:
        yesterday = now - datetime.timedelta(days=1)
        return yesterday.strftime("%Y-%m-%d")
    return now.strftime("%Y-%m-%d")

def get_explicit_file_date_key(file_entry):
    if not isinstance(file_entry, dict):
        return None

    for value in (file_entry.get("filename", ""), os.path.basename(file_entry.get("path", ""))):
        match = EXPLICIT_DATE_RE.search(value or "")
        if match:
            return f"{match.group(1)}-{match.group(2)}-{match.group(3)}"

    return None

def append_unique_file_entries(target_list, entries):
    existing_paths = {
        entry.get("path")
        for entry in target_list
        if isinstance(entry, dict)
    }

    for entry in entries:
        if not isinstance(entry, dict):
            continue
        entry_path = entry.get("path")
        if entry_path in existing_paths:
            continue
        target_list.append(entry)
        existing_paths.add(entry_path)

def append_entries_to_date(date_files, date_key, entries):
    if not date_key or not entries:
        return
    target_entries = list(date_files.get(date_key, []))
    append_unique_file_entries(target_entries, entries)
    date_files[date_key] = target_entries

def ensure_config_is_current(config, persist=True):
    today_str = get_app_today_str()
    changed = False

    if config.get("last_display_date") != today_str:
        config = perform_daily_migration(config, today_str)
        changed = True

    if promote_active_date_files(config, today_str):
        changed = True

    if reclassify_visible_date_files(config, today_str):
        changed = True

    if changed and persist:
        save_config(config)

    return config

def perform_daily_migration(config, today_str):
    """
    하루가 지났을 때 파일들을 마이그레이션합니다.
    Tomorrow -> Today
    Today -> Yesterday (어제 날짜 Key로 저장)
    """
    last_date = config.get("last_display_date", "")
    
    if last_date and last_date != today_str:
        files = default_files_struct(config.get("files", {}))
        
        today_files = files.get("today", [])
        tomorrow_files = files.get("tomorrow", [])
        by_date = files.get("byDate", {})
        
        # 1. Move Today -> dated history. If a file explicitly names a date,
        # trust that over its current bucket.
        for entry in today_files:
            target_date = get_explicit_file_date_key(entry) or last_date
            append_entries_to_date(by_date, target_date, [entry])
            
        # 2. Tomorrow was planned for the day after last_date. If the app was
        # not opened for multiple days, that date may already be history.
        try:
            tomorrow_target_date = (
                datetime.datetime.strptime(last_date, "%Y-%m-%d") + datetime.timedelta(days=1)
            ).strftime("%Y-%m-%d")
        except ValueError:
            tomorrow_target_date = today_str

        for entry in tomorrow_files:
            target_date = get_explicit_file_date_key(entry) or tomorrow_target_date
            append_entries_to_date(by_date, target_date, [entry])
        files["today"] = []
        files["tomorrow"] = []
        files["byDate"] = by_date
        files["yesterday"] = by_date
        
        # 3. Clean Old Trash (7일 경과된 항목만 비우기)
        import time
        new_trash = []
        for t_file in files.get("trash", []):
            try:
                if os.path.exists(t_file["path"]):
                    mtime = os.path.getmtime(t_file["path"])
                    if time.time() - mtime > 7 * 24 * 3600:
                        os.remove(t_file["path"])
                    else:
                        new_trash.append(t_file)
            except Exception:
                pass
        files["trash"] = new_trash
        
        config["files"] = files
        moved_count = len(today_files) + len(tomorrow_files)
        if moved_count:
            record_activity(
                config,
                "auto_migration",
                f"{last_date} 기준 일정 {moved_count}개를 날짜별 기록으로 정리했습니다.",
                {
                    "from_date": last_date,
                    "to_date": today_str,
                    "today_count": len(today_files),
                    "tomorrow_count": len(tomorrow_files),
                },
            )

    config["last_display_date"] = today_str
    config["triggered_times_today"] = []
    
    return config

def promote_active_date_files(config, today_str):
    """Promote date-keyed scheduled files into today's or tomorrow's visible buckets."""
    files = default_files_struct(config.get("files", {}))
    by_date = files.get("byDate", {})
    changed = False
    promoted_counts = {}

    tomorrow_str = (
        datetime.datetime.strptime(today_str, "%Y-%m-%d") + datetime.timedelta(days=1)
    ).strftime("%Y-%m-%d")

    def promote(date_key, target_key):
        nonlocal changed
        staged_files = by_date.pop(date_key, [])
        if not staged_files:
            return

        target_files = list(files.get(target_key, []))
        existing_paths = {
            entry.get("path")
            for entry in target_files
            if isinstance(entry, dict)
        }

        for entry in staged_files:
            if not isinstance(entry, dict):
                continue
            entry_path = entry.get("path")
            if entry_path in existing_paths:
                continue
            target_files.append(entry)
            existing_paths.add(entry_path)

        files[target_key] = target_files
        promoted_counts[target_key] = promoted_counts.get(target_key, 0) + len(staged_files)
        changed = True

    promote(today_str, "today")
    promote(tomorrow_str, "tomorrow")

    if changed:
        files["byDate"] = by_date
        files["yesterday"] = by_date
        config["files"] = files
        record_activity(
            config,
            "date_promotion",
            "날짜별 예정 일정을 오늘/내일 화면으로 옮겼습니다.",
            promoted_counts,
        )

    return changed

def reclassify_visible_date_files(config, today_str):
    """Move explicitly dated files out of today/tomorrow when their date no longer matches."""
    files = default_files_struct(config.get("files", {}))
    by_date = files.get("byDate", {})
    changed = False
    reclassified = []

    tomorrow_str = (
        datetime.datetime.strptime(today_str, "%Y-%m-%d") + datetime.timedelta(days=1)
    ).strftime("%Y-%m-%d")

    def classify(entry, expected_date, target_key):
        nonlocal changed
        explicit_date = get_explicit_file_date_key(entry)
        if not explicit_date or explicit_date == expected_date:
            return target_key
        changed = True
        if explicit_date == today_str:
            reclassified.append({"from": target_key, "to": "today", "date": explicit_date})
            return "today"
        if explicit_date == tomorrow_str:
            reclassified.append({"from": target_key, "to": "tomorrow", "date": explicit_date})
            return "tomorrow"
        append_entries_to_date(by_date, explicit_date, [entry])
        reclassified.append({"from": target_key, "to": "byDate", "date": explicit_date})
        return None

    new_today = []
    new_tomorrow = []

    for entry in files.get("today", []):
        target = classify(entry, today_str, "today")
        if target == "today":
            append_unique_file_entries(new_today, [entry])
        elif target == "tomorrow":
            append_unique_file_entries(new_tomorrow, [entry])

    for entry in files.get("tomorrow", []):
        target = classify(entry, tomorrow_str, "tomorrow")
        if target == "today":
            append_unique_file_entries(new_today, [entry])
        elif target == "tomorrow":
            append_unique_file_entries(new_tomorrow, [entry])

    if changed:
        files["today"] = new_today
        files["tomorrow"] = new_tomorrow
        files["byDate"] = by_date
        files["yesterday"] = by_date
        config["files"] = files
        record_activity(
            config,
            "date_reclassified",
            f"날짜가 맞지 않는 일정 {len(reclassified)}개를 올바른 날짜로 정리했습니다.",
            {"items": reclassified},
        )

    return changed

def check_should_run(config):
    now = datetime.datetime.now()
    today_str = get_app_today_str()
    config = ensure_config_is_current(config)
        
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
    if not IS_WINDOWS or winreg is None:
        print("Startup registration is only supported on Windows. Skipping.")
        return
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

    def _refresh_config(self, persist=True):
        self.config = ensure_config_is_current(self.config, persist=persist)
        return self.config

    def get_config(self):
        self._refresh_config()
        return self.config

    def read_activity_log(self):
        self._refresh_config()
        return default_activity_log(self.config.get("activity_log", []))

    def record_activity(self, action, message, details=None):
        self._refresh_config(persist=False)
        entry = record_activity(self.config, action, message, details)
        save_config(self.config)
        return {"success": True, "entry": entry, "activity_log": self.read_activity_log()}

    def save_config(self, new_config):
        self._refresh_config(persist=False)
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

    def _get_files_struct(self):
        files = default_files_struct(self.config.get("files", {}))
        self.config["files"] = files
        return files

    def _get_tasks_dir(self):
        app_data_dir = os.path.join(get_app_dir(), "app_data", "tasks")
        os.makedirs(app_data_dir, exist_ok=True)
        return app_data_dir

    def _write_markdown_file(self, filepath, content):
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)

    def _normalize_spacing_after_task_removal(self, content_lines):
        collapsed = []
        previous_blank = False

        for raw_line in content_lines:
            line = raw_line.rstrip()
            is_blank = line == ""
            if is_blank and previous_blank:
                continue
            collapsed.append(line)
            previous_blank = is_blank

        while collapsed and collapsed[-1] == "":
            collapsed.pop()

        return "\n".join(collapsed)

    def _file_plan_sort_key(self, file_entry):
        if not isinstance(file_entry, dict):
            return ""

        added_date = file_entry.get("added_date", "")
        if isinstance(added_date, str) and added_date:
            return added_date

        fallback_source = f"{file_entry.get('filename', '')} {file_entry.get('path', '')}"
        compact_date = re.search(r"(\d{8})(\d{6})?", fallback_source)
        if compact_date:
            date_part = compact_date.group(1)
            time_part = compact_date.group(2) or "000000"
            return (
                f"{date_part[0:4]}-{date_part[4:6]}-{date_part[6:8]} "
                f"{time_part[0:2]}:{time_part[2:4]}:{time_part[4:6]}"
            )

        return str(file_entry.get("path", ""))

    def _get_latest_file_entry(self, file_entries):
        valid_entries = [
            entry for entry in file_entries
            if isinstance(entry, dict) and entry.get("path") and os.path.exists(entry["path"])
        ]
        if not valid_entries:
            return None
        return max(valid_entries, key=self._file_plan_sort_key)

    def _append_task_line_to_file(self, file_entry, task_line):
        existing = self.get_file_content(file_entry["path"]) or ""
        next_content = (existing.rstrip() + "\n" + task_line).strip() + "\n"
        self._write_markdown_file(file_entry["path"], next_content)

    def _ensure_named_internal_file(self, files_struct, target, filename):
        target_list = list(files_struct.get(target, []))
        normalized_entries = []

        for entry in target_list:
            if not isinstance(entry, dict):
                continue
            if entry.get("filename") == filename and entry.get("path") and os.path.exists(entry["path"]):
                files_struct[target] = target_list
                return entry["path"], entry
            normalized_entries.append(entry)

        target_list = normalized_entries
        timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
        dest_path = os.path.join(self._get_tasks_dir(), f"{timestamp}_{filename}")
        self._write_markdown_file(dest_path, "")

        file_entry = {
            "path": dest_path,
            "filename": filename,
            "added_date": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        target_list.append(file_entry)
        files_struct[target] = target_list
        return dest_path, file_entry

    def _append_postponed_task(self, filepath, target_date, task_text):
        existing = (self.get_file_content(filepath) or "").strip()
        lines = []

        if not existing:
            lines.extend([
                f"# Tomorrow ({target_date})",
                "",
                "<!-- postponed tasks -->",
                "",
            ])
        else:
            lines.append(existing)
            if not existing.endswith("\n"):
                lines.append("")

        lines.append(f"- [ ] {task_text}")
        content = "\n".join(lines).strip()
        self._write_markdown_file(filepath, f"{content}\n")

    def read_all_files(self):
        """React에서 호출 시 전체 구조화된 파일 내용과 메타데이터를 반환합니다."""
        self._refresh_config()
        files = self._get_files_struct()
        
        result = {
            "tomorrow": [],
            "today": [],
            "byDate": {},
            "trash": [],
            "migratedUnfinishedTasks": default_migrated_unfinished_tasks(
                self.config.get("migrated_unfinished_tasks", [])
            ),
        }
        result["yesterday"] = result["byDate"]
        
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
            
        # Populate date-keyed history and scheduled files.
        by_date = files.get("byDate", {})
        for date_key, date_files in by_date.items():
            result["byDate"][date_key] = []
            for f in date_files:
                f_copy = dict(f)
                f_copy["content"] = self.get_file_content(f["path"])
                result["byDate"][date_key].append(f_copy)

        # Populate Trash files
        for f in files.get("trash", []):
            f_copy = dict(f)
            f_copy["content"] = self.get_file_content(f["path"])
            result["trash"].append(f_copy)
                
        return result

    def read_trash_files(self):
        """휴지통 화면에 필요한 파일 내용만 반환합니다."""
        self._refresh_config()
        files = self._get_files_struct()
        result = []

        for f in files.get("trash", []):
            f_copy = dict(f)
            f_copy["content"] = self.get_file_content(f["path"])
            result.append(f_copy)

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

    def update_file_content(self, filepath, content, normalize_tasks=False):
        """React에서 체크박스를 클릭했을 때 기존 파일의 내용을 덮어씁니다."""
        try:
            if os.path.exists(filepath):
                final_content = normalize_task_draft_content(content) if normalize_tasks else content
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(final_content)
                return {"success": True, "content": final_content}
            return {"success": False, "error": "File not found"}
        except Exception as e:
            print(f"Failed to update file {filepath}: {e}")
            return {"success": False, "error": str(e)}

    def add_file_dialog(self, target):
        import webview
        self._refresh_config()
        # Only allow markdown files as requested
        file_types = ('Markdown Files (*.md)', 'All files (*.*)')
        result = window.create_file_dialog(webview.OPEN_DIALOG, allow_multiple=True, file_types=file_types)
        
        if result:
            files_struct = self._get_files_struct()
            
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
                record_activity(
                    self.config,
                    "file_added",
                    f"{target}에 파일을 추가했습니다.",
                    {"target": target, "count": len(result)},
                )
                save_config(self.config)
            
            return self.config["files"]
        return None

    def process_dropped_content(self, target, files_data_list):
        self._refresh_config()
        files_struct = self._get_files_struct()
        target_list = files_struct.get(target, [])
        added_any = False
        
        for file_obj in files_data_list:
            fname = file_obj.get("name", "")
            content = file_obj.get("content", "")
            if file_obj.get("normalize_tasks"):
                content = normalize_task_draft_content(content)
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
            record_activity(
                self.config,
                "content_dropped",
                f"{target}에 새 일정 파일을 추가했습니다.",
                {"target": target, "count": len(files_data_list)},
            )
            save_config(self.config)
            
        return self.config["files"]

    def postpone_task(self, source_path, line_index, task_text, reason=""):
        self._refresh_config()
        files_struct = self._get_files_struct()
        today_files = files_struct.get("today", [])
        source_file = next((f for f in today_files if f.get("path") == source_path), None)

        if not source_file:
            return {"success": False, "error": "Source file not found in today's tasks."}

        content = self.get_file_content(source_path)
        if content is None:
            return {"success": False, "error": "Source file could not be read."}

        content_lines = content.split("\n")
        if line_index < 0 or line_index >= len(content_lines):
            return {"success": False, "error": "Task line was not found."}

        target_line = content_lines[line_index]
        task_match = re.match(r"^(\s*)-\s*\[(?:\s|x|X)\]\s*(.*)", target_line)
        if not task_match:
            return {"success": False, "error": "Selected line is not a checklist task."}

        extracted_text = task_match.group(2).strip()
        if task_text and extracted_text != task_text.strip():
            return {"success": False, "error": "Task content changed before it could be postponed."}

        del content_lines[line_index]
        new_content = self._normalize_spacing_after_task_removal(content_lines)

        if new_content.strip():
            self._write_markdown_file(source_path, f"{new_content}\n")
        else:
            try:
                os.remove(source_path)
            except FileNotFoundError:
                pass
            files_struct["today"] = [f for f in today_files if f.get("path") != source_path]

        target_date = (datetime.datetime.now() + datetime.timedelta(days=1)).strftime("%Y-%m-%d")
        tomorrow_filename = f"postponed_tasks_{target_date}.md"

        tomorrow_path, _ = self._ensure_named_internal_file(files_struct, "tomorrow", tomorrow_filename)

        self._append_postponed_task(tomorrow_path, target_date, extracted_text)

        self.config["files"] = files_struct
        record_activity(
            self.config,
            "task_postponed",
            f"'{extracted_text}' 일정을 내일로 미뤘습니다.",
            {"target_date": target_date, "source_file": source_file.get("filename", "today.md"), "reason": reason},
        )
        save_config(self.config)
        return {
            "success": True,
            "files": self.read_all_files(),
            "moved_task": extracted_text,
            "tomorrow_filename": tomorrow_filename,
        }
        
    def remove_file(self, target, pathToRemove, dateKey=None):
        """API method to manually remove a file from a specific category."""
        self._refresh_config()
        files_struct = self._get_files_struct()
        
        if target == "tomorrow":
            files_struct["tomorrow"] = [f for f in files_struct.get("tomorrow", []) if f["path"] != pathToRemove]
        elif target == "today":
            files_struct["today"] = [f for f in files_struct.get("today", []) if f["path"] != pathToRemove]
        elif target == "trash":
            files_struct["trash"] = [f for f in files_struct.get("trash", []) if f["path"] != pathToRemove]
        elif target in ("byDate", "yesterday") and dateKey:
            by_date = files_struct.get("byDate", {})
            if dateKey in by_date:
                by_date[dateKey] = [f for f in by_date[dateKey] if f["path"] != pathToRemove]
                # Clean up empty dates
                if not by_date[dateKey]:
                    del by_date[dateKey]
                files_struct["byDate"] = by_date
                files_struct["yesterday"] = by_date
                    
        self.config["files"] = files_struct
        record_activity(
            self.config,
            "file_removed",
            "파일 목록에서 항목을 제거했습니다.",
            {"target": target, "date_key": dateKey, "path": pathToRemove},
        )
        save_config(self.config)
        return self.config["files"]

    def empty_trash(self):
        """API method to manually empty all trash."""
        self._refresh_config()
        files_struct = self._get_files_struct()
        trash_count = len(files_struct.get("trash", []))
        
        for t_file in files_struct.get("trash", []):
            try:
                if os.path.exists(t_file["path"]):
                    os.remove(t_file["path"])
            except Exception:
                pass
                
        files_struct["trash"] = []
        self.config["files"] = files_struct
        record_activity(
            self.config,
            "trash_emptied",
            "휴지통을 비웠습니다.",
            {"count": trash_count},
        )
        save_config(self.config)
        return {"success": True, "files": self.read_all_files()}
        
    def restore_trash(self, pathToRestore):
        """API method to restore a file from trash to today."""
        self._refresh_config()
        files_struct = self._get_files_struct()
        
        trash_list = files_struct.get("trash", [])
        file_to_restore = next((f for f in trash_list if f["path"] == pathToRestore), None)
        
        if file_to_restore:
            # Remove from trash
            files_struct["trash"] = [f for f in trash_list if f["path"] != pathToRestore]
            # Add to today
            if "today" not in files_struct:
                files_struct["today"] = []
            files_struct["today"].append(file_to_restore)
            
            self.config["files"] = files_struct
            record_activity(
                self.config,
                "trash_restored",
                "휴지통에서 오늘 일정으로 복원했습니다.",
                {"filename": file_to_restore.get("filename"), "path": pathToRestore},
            )
            save_config(self.config)
            return {"success": True, "files": self.read_all_files()}
            
        return {"success": False, "error": "File not found in trash."}

    def trash_task(self, task_text, original_filename="deleted_task"):
        """단일 태스크 텍스트를 휴지통 파일로 저장합니다."""
        self._refresh_config()
        files_struct = self._get_files_struct()
        
        try:
            trash_dir = os.path.join(get_app_dir(), "app_data", "trash")
            os.makedirs(trash_dir, exist_ok=True)
            
            timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S%f")
            safe_name = re.sub(r'[^\w\-_\. ]', '_', original_filename)
            filename = f"trash_{timestamp}_{safe_name}.md"
            dest_path = os.path.join(trash_dir, filename)
            
            with open(dest_path, "w", encoding="utf-8") as f:
                f.write(task_text if task_text else "")
            
            trash_list = files_struct.get("trash", [])
            trash_list.append({
                "path": dest_path,
                "filename": filename,
                "added_date": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "original_text": task_text,
            })
            files_struct["trash"] = trash_list
            self.config["files"] = files_struct
            record_activity(
                self.config,
                "task_trashed",
                "일정을 휴지통으로 보냈습니다.",
                {"source": original_filename, "task_text": task_text},
            )
            save_config(self.config)
            return {"success": True}
        except Exception as e:
            print(f"Failed to trash task: {e}")
            return {"success": False, "error": str(e)}

    def get_frequent_tasks(self):
        """자주 하는 일 목록을 반환합니다."""
        self._refresh_config()
        return self.config.get("frequent_tasks", [])

    def save_frequent_tasks(self, tasks):
        """자주 하는 일 목록을 저장합니다."""
        self._refresh_config()
        self.config["frequent_tasks"] = tasks if isinstance(tasks, list) else []
        save_config(self.config)
        return {"success": True}

    def add_frequent_tasks_to_day(self, tasks, target_date):
        """자주 하는 일을 특정 날짜의 파일에 추가합니다."""
        self._refresh_config()
        files_struct = self._get_files_struct()
        today_str = get_app_today_str()
        tomorrow_str = (datetime.datetime.strptime(today_str, "%Y-%m-%d") + datetime.timedelta(days=1)).strftime("%Y-%m-%d")

        if target_date < today_str:
            return {"success": False, "error": "Cannot add to past dates"}

        lines_to_add = "\n".join([f"- [ ] {task}" for task in tasks])
        app_data_dir = os.path.join(get_app_dir(), "app_data", "tasks")
        os.makedirs(app_data_dir, exist_ok=True)

        if target_date == today_str:
            target_key = "today"
            target_files = files_struct.get("today", [])
        elif target_date == tomorrow_str:
            target_key = "tomorrow"
            target_files = files_struct.get("tomorrow", [])
        else:
            by_date = files_struct.get("byDate", {})
            target_files = by_date.get(target_date, [])

            if target_files:
                target_file = target_files[0]
                existing = ""
                if os.path.exists(target_file["path"]):
                    with open(target_file["path"], "r", encoding="utf-8") as f:
                        existing = f.read()
                new_content = (existing.rstrip() + "\n" + lines_to_add).strip() + "\n"
                with open(target_file["path"], "w", encoding="utf-8") as f:
                    f.write(new_content)
            else:
                timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
                filename = f"{timestamp}_tasks_{target_date}.md"
                dest_path = os.path.join(app_data_dir, filename)
                with open(dest_path, "w", encoding="utf-8") as f:
                    f.write(lines_to_add + "\n")
                if target_date not in by_date:
                    by_date[target_date] = []
                by_date[target_date].append({
                    "path": dest_path,
                    "filename": filename,
                    "added_date": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                })
                files_struct["byDate"] = by_date
                files_struct["yesterday"] = by_date
                self.config["files"] = files_struct

            record_activity(
                self.config,
                "frequent_tasks_added",
                f"{target_date}에 자주 하는 일 {len(tasks)}개를 추가했습니다.",
                {"target_date": target_date, "count": len(tasks)},
            )
            save_config(self.config)

            return {"success": True, "files": self.read_all_files()}

        # today / tomorrow 처리
        if target_files:
            target_file = target_files[0]
            existing = ""
            if os.path.exists(target_file["path"]):
                with open(target_file["path"], "r", encoding="utf-8") as f:
                    existing = f.read()
            new_content = (existing.rstrip() + "\n" + lines_to_add).strip() + "\n"
            with open(target_file["path"], "w", encoding="utf-8") as f:
                f.write(new_content)
        else:
            timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
            filename = f"{timestamp}_frequent_tasks.md"
            dest_path = os.path.join(app_data_dir, filename)
            with open(dest_path, "w", encoding="utf-8") as f:
                f.write(lines_to_add + "\n")
            files_struct[target_key].append({
                "path": dest_path,
                "filename": filename,
                "added_date": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            })
            self.config["files"] = files_struct

        self.config["files"] = files_struct
        record_activity(
            self.config,
            "frequent_tasks_added",
            f"{target_date}에 자주 하는 일 {len(tasks)}개를 추가했습니다.",
            {"target_date": target_date, "count": len(tasks)},
        )
        save_config(self.config)

        return {"success": True, "files": self.read_all_files()}

    def add_task_to_date(self, task_line, target_date):
        """포맷된 마크다운 태스크 라인을 특정 날짜 파일에 추가합니다. (주간 플래너 드래그 이동용)"""
        self._refresh_config()
        files_struct = self._get_files_struct()
        today_str = get_app_today_str()
        tomorrow_str = (datetime.datetime.strptime(today_str, "%Y-%m-%d") + datetime.timedelta(days=1)).strftime("%Y-%m-%d")
        app_data_dir = os.path.join(get_app_dir(), "app_data", "tasks")
        os.makedirs(app_data_dir, exist_ok=True)

        def _append_or_create(target_files, target_key, date_key=None):
            if target_files:
                target_file = target_files[0]
                existing = ""
                if os.path.exists(target_file["path"]):
                    with open(target_file["path"], "r", encoding="utf-8") as f:
                        existing = f.read()
                new_content = (existing.rstrip() + "\n" + task_line).strip() + "\n"
                with open(target_file["path"], "w", encoding="utf-8") as f:
                    f.write(new_content)
            else:
                timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
                suffix = date_key if date_key else target_key
                filename = f"{timestamp}_tasks_{suffix}.md"
                dest_path = os.path.join(app_data_dir, filename)
                with open(dest_path, "w", encoding="utf-8") as f:
                    f.write(task_line + "\n")
                new_entry = {
                    "path": dest_path,
                    "filename": filename,
                    "added_date": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                }
                if date_key:
                    by_date = files_struct.get("byDate", {})
                    if date_key not in by_date:
                        by_date[date_key] = []
                    by_date[date_key].append(new_entry)
                    files_struct["byDate"] = by_date
                    files_struct["yesterday"] = by_date
                else:
                    if target_key not in files_struct:
                        files_struct[target_key] = []
                    files_struct[target_key].append(new_entry)
                self.config["files"] = files_struct
                save_config(self.config)

        if target_date == today_str:
            _append_or_create(files_struct.get("today", []), "today")
        elif target_date == tomorrow_str:
            _append_or_create(files_struct.get("tomorrow", []), "tomorrow")
        else:
            by_date = files_struct.get("byDate", {})
            _append_or_create(by_date.get(target_date, []), "byDate", target_date)

        record_activity(
            self.config,
            "task_added_to_date",
            f"{target_date}에 일정을 추가했습니다.",
            {"target_date": target_date, "task_line": task_line},
        )
        save_config(self.config)
        return {"success": True, "files": self.read_all_files()}

    def migrate_unfinished_task(self, source_path, source_date, line_index, task_text):
        """Move an unfinished task into today's latest visible plan."""
        self._refresh_config()
        files_struct = self._get_files_struct()

        if not source_path or not source_date:
            return {"success": False, "error": "Source task metadata is missing."}

        by_date = files_struct.get("byDate", {})
        source_files = by_date.get(source_date, [])
        source_file = next((f for f in source_files if f.get("path") == source_path), None)
        if not source_file:
            return {"success": False, "error": "Source file not found in date history."}

        try:
            line_index = int(line_index)
        except (TypeError, ValueError):
            return {"success": False, "error": "Invalid task line index."}

        source_content = self.get_file_content(source_path)
        if source_content is None:
            return {"success": False, "error": "Source file could not be read."}

        source_lines = source_content.split("\n")
        if line_index < 0 or line_index >= len(source_lines):
            return {"success": False, "error": "Task line was not found."}

        target_line = source_lines[line_index]
        task_match = re.match(r"^(\s*)[-*+]\s*\[([ xX])\]\s*(.*)", target_line)
        if not task_match:
            return {"success": False, "error": "Selected line is not a checklist task."}

        if task_match.group(2).lower() == "x":
            return {"success": False, "error": "Selected task is already completed."}

        extracted_text = task_match.group(3).strip()
        if task_text and extracted_text != task_text.strip():
            return {"success": False, "error": "Task content changed before migration."}

        task_line = f"- [ ] {extracted_text}"
        normalized_extracted_text = re.sub(r"\s+", " ", extracted_text).strip()

        def _target_already_has_task(file_entry):
            target_content = self.get_file_content(file_entry["path"]) or ""
            for line in target_content.split("\n"):
                target_match = re.match(r"^\s*[-*+]\s*\[(?:\s|x|X)\]\s*(.*)", line)
                if not target_match:
                    continue
                target_text = re.sub(r"\s+", " ", target_match.group(1).strip()).strip()
                if target_text == normalized_extracted_text:
                    return True
            return False

        today_files = files_struct.get("today", [])
        target_file = self._get_latest_file_entry(today_files)
        already_exists = False
        if target_file:
            already_exists = _target_already_has_task(target_file)
            if not already_exists:
                self._append_task_line_to_file(target_file, task_line)
        else:
            today_path, _ = self._ensure_named_internal_file(
                files_struct,
                "today",
                f"migrated_tasks_{get_app_today_str()}.md",
            )
            self._write_markdown_file(today_path, f"{task_line}\n")

        remember_migrated_unfinished_task(
            self.config,
            source_path,
            source_date,
            line_index,
            extracted_text,
        )

        self.config["files"] = files_struct
        record_activity(
            self.config,
            "unfinished_task_copied",
            (
                f"이미 있던 '{extracted_text}' 일정을 오늘에서 확인하고 어제 목록에서 정리했습니다."
                if already_exists
                else f"'{extracted_text}' 일정을 오늘로 옮기고 어제 목록에서 정리했습니다."
            ),
            {
                "source_date": source_date,
                "source_path": source_path,
                "line_index": line_index,
                "task_text": extracted_text,
                "already_exists": already_exists,
                "source_marked_done": False,
            },
        )
        save_config(self.config)
        return {
            "success": True,
            "files": self.read_all_files(),
            "copied_task": extracted_text,
            "already_exists": already_exists,
        }

    def close(self):
        window.destroy()

def get_html_path():
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, 'ui', 'dist', 'index.html')
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ui', 'dist', 'index.html')

def get_fallback_html_path():
    if hasattr(sys, "_MEIPASS"):
        bundled_path = os.path.join(sys._MEIPASS, "ui", "mac_fallback.html")
        if os.path.exists(bundled_path):
            return bundled_path
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "ui", "mac_fallback.html")

def display_ui(config):
    import webview
    
    html_file = get_html_path()
    if not os.path.exists(html_file):
        print(f"Error: UI build not found at {html_file}. Run 'npm run build' inside the ui folder.")
        if not hasattr(sys, '_MEIPASS') and IS_WINDOWS:
            html_file = "http://localhost:5173"
        else:
            html_file = get_fallback_html_path()
            
    api = Api(config)
    global window
    window = webview.create_window(
        'Morning Star',
        url=html_file,
        width=1080,
        height=748,
        min_size=(946, 616),
        js_api=api,
    )

    # Set window icon (title bar + taskbar)
    if hasattr(sys, '_MEIPASS'):
        icon_path = os.path.join(sys._MEIPASS, 'morning_star.ico')
    else:
        icon_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'morning_star.ico')

    webview.start(private_mode=True, icon=icon_path if os.path.exists(icon_path) else None)

def main():
    import time
    
    config = load_config()
    today_str = get_app_today_str()
    
    if len(sys.argv) > 1:
        if sys.argv[1] == "--setup":
            setup_startup()
            return
        elif sys.argv[1] == "--test":
            print("Running UI test bypass...")
            config = ensure_config_is_current(config)
            display_ui(config)
            return
        elif sys.argv[1] == "--startup":
            if not IS_WINDOWS:
                print("Background startup mode is only supported on Windows. Opening the app window instead.")
                display_ui(config)
                return

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

    if IS_WINDOWS:
        # If run manually by double-clicking the Exe (no args):
        # Enforce background process to start
        if hasattr(sys, 'frozen'):
            cmd = [sys.executable, "--startup"]
        else:
            cmd = [sys.executable, os.path.abspath(__file__), "--startup"]

        subprocess.Popen(cmd, creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, 'CREATE_NO_WINDOW') else 0)

        # Setup startup string to ensure --startup flag is present if configured in the past
        setup_startup()
    
    config = ensure_config_is_current(config)
    
    print("Manually launched by user. Displaying Morning Star...")
    display_ui(config)

if __name__ == "__main__":
    main()
