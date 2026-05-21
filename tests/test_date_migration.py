import atexit
import datetime
import importlib
import json
import os
import shutil
import sys
import tempfile
import unittest
from unittest import mock
from pathlib import Path


TEST_APP_DIR = tempfile.mkdtemp(prefix="morning_star_tests_")
os.environ["MORNING_STAR_APP_DIR"] = TEST_APP_DIR
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
main = importlib.import_module("main")


@atexit.register
def cleanup_test_app_dir():
    shutil.rmtree(TEST_APP_DIR, ignore_errors=True)


def file_entry(name, path=None):
    return {
        "path": path or f"/tmp/{name}",
        "filename": name,
        "added_date": "2026-05-09 06:00:00",
    }


class DateMigrationTests(unittest.TestCase):
    def test_app_today_resets_at_two_am(self):
        class BeforeReset(datetime.datetime):
            @classmethod
            def now(cls):
                return cls(2026, 5, 11, 1, 59, 0)

        class AtReset(datetime.datetime):
            @classmethod
            def now(cls):
                return cls(2026, 5, 11, 2, 0, 0)

        with mock.patch.object(main.datetime, "datetime", BeforeReset):
            self.assertEqual(main.get_app_today_str(), "2026-05-10")

        with mock.patch.object(main.datetime, "datetime", AtReset):
            self.assertEqual(main.get_app_today_str(), "2026-05-11")

    def test_legacy_yesterday_is_migrated_to_by_date_for_storage(self):
        old_entry = file_entry("old_plan.md")
        new_entry = file_entry("future_plan.md")
        files = main.default_files_struct({
            "yesterday": {"2026-05-09": [old_entry]},
            "byDate": {"2026-05-12": [new_entry]},
        })

        self.assertIs(files["byDate"], files["yesterday"])
        self.assertEqual(files["byDate"]["2026-05-09"], [old_entry])
        self.assertEqual(files["byDate"]["2026-05-12"], [new_entry])

        main.save_config({"files": files})
        saved = json.loads(Path(main.CONFIG_FILE).read_text(encoding="utf-8"))
        self.assertIn("byDate", saved["files"])
        self.assertNotIn("yesterday", saved["files"])

    def test_load_config_persists_by_date_migration_from_legacy_file(self):
        legacy_entry = file_entry("legacy.md")
        Path(main.CONFIG_FILE).write_text(
            json.dumps({
                "target_times": ["06:00"],
                "theme": "light",
                "files": {
                    "today": [],
                    "tomorrow": [],
                    "yesterday": {"2026-05-09": [legacy_entry]},
                    "postponed": [],
                    "trash": [],
                },
                "last_display_date": "2026-05-11",
                "triggered_times_today": [],
            }),
            encoding="utf-8",
        )

        loaded = main.load_config()
        saved = json.loads(Path(main.CONFIG_FILE).read_text(encoding="utf-8"))

        self.assertEqual(loaded["files"]["byDate"]["2026-05-09"], [legacy_entry])
        self.assertIn("byDate", saved["files"])
        self.assertNotIn("yesterday", saved["files"])
        self.assertNotIn("postponed", saved["files"])

    def test_load_config_deletes_legacy_postponed_files(self):
        postponed_path = Path(TEST_APP_DIR) / "postpone_reasons_2026-05-12.md"
        postponed_path.write_text("- Reason: test\n", encoding="utf-8")
        postponed_entry = file_entry("postpone_reasons_2026-05-12.md", str(postponed_path))

        Path(main.CONFIG_FILE).write_text(
            json.dumps({
                "target_times": ["06:00"],
                "theme": "light",
                "files": {
                    "today": [],
                    "tomorrow": [],
                    "byDate": {},
                    "postponed": [postponed_entry],
                    "trash": [],
                },
                "last_display_date": "2026-05-11",
                "triggered_times_today": [],
            }),
            encoding="utf-8",
        )

        loaded = main.load_config()
        saved = json.loads(Path(main.CONFIG_FILE).read_text(encoding="utf-8"))

        self.assertFalse(postponed_path.exists())
        self.assertNotIn("postponed", loaded["files"])
        self.assertNotIn("postponed", saved["files"])

    def test_skipped_days_do_not_promote_stale_tomorrow_into_today(self):
        today_entry = file_entry("tasks_2026-05-09.md")
        tomorrow_entry = file_entry("tasks_without_explicit_date.md")
        config = {
            "last_display_date": "2026-05-09",
            "files": main.default_files_struct({
                "today": [today_entry],
                "tomorrow": [tomorrow_entry],
            }),
        }

        migrated = main.perform_daily_migration(config, "2026-05-11")
        files = migrated["files"]

        self.assertEqual(files["today"], [])
        self.assertEqual(files["tomorrow"], [])
        self.assertEqual(files["byDate"]["2026-05-09"], [today_entry])
        self.assertEqual(files["byDate"]["2026-05-10"], [tomorrow_entry])
        self.assertEqual(migrated["activity_log"][0]["action"], "auto_migration")

    def test_date_keyed_tomorrow_is_promoted_only_when_it_is_tomorrow(self):
        future_entry = file_entry("tasks_2026-05-12.md")
        past_entry = file_entry("tasks_2026-05-09.md")
        config = {
            "files": main.default_files_struct({
                "byDate": {
                    "2026-05-12": [future_entry],
                    "2026-05-09": [past_entry],
                },
            }),
        }

        changed = main.promote_active_date_files(config, "2026-05-11")
        files = config["files"]

        self.assertTrue(changed)
        self.assertEqual(files["tomorrow"], [future_entry])
        self.assertNotIn("2026-05-12", files["byDate"])
        self.assertEqual(files["byDate"]["2026-05-09"], [past_entry])

    def test_explicit_future_file_is_reclassified_out_of_today(self):
        future_entry = file_entry("tasks_2026-05-12.md")
        config = {
            "files": main.default_files_struct({
                "today": [future_entry],
            }),
        }

        changed = main.reclassify_visible_date_files(config, "2026-05-11")
        files = config["files"]

        self.assertTrue(changed)
        self.assertEqual(files["today"], [])
        self.assertEqual(files["tomorrow"], [future_entry])

    def test_unfinished_task_migration_keeps_source_unchecked_and_tracks_hidden_state(self):
        source_path = Path(TEST_APP_DIR) / "source.md"
        source_path.write_text("- [ ] A/B 테스트 2세션 듣기\n", encoding="utf-8")
        source_entry = file_entry("source.md", str(source_path))
        config = {
            "last_display_date": main.get_app_today_str(),
            "files": main.default_files_struct({
                "byDate": {"2026-05-10": [source_entry]},
                "today": [],
            }),
        }
        api = main.Api(config)

        result = api.migrate_unfinished_task(
            str(source_path),
            "2026-05-10",
            0,
            "A/B 테스트 2세션 듣기",
        )

        self.assertTrue(result["success"])
        self.assertIn("- [ ] A/B 테스트 2세션 듣기", source_path.read_text(encoding="utf-8"))
        self.assertEqual(api.config["files"]["byDate"]["2026-05-10"], [source_entry])
        self.assertEqual(
            api.config["migrated_unfinished_tasks"],
            [{
                "source_date": "2026-05-10",
                "source_path": str(source_path),
                "line_index": 0,
                "task_text": "A/B 테스트 2세션 듣기",
            }],
        )
        self.assertEqual(api.config["activity_log"][0]["action"], "unfinished_task_copied")
        self.assertFalse(api.config["activity_log"][0]["details"]["source_marked_done"])
        today_file = api.config["files"]["today"][0]
        self.assertIn(
            "- [ ] A/B 테스트 2세션 듣기",
            Path(today_file["path"]).read_text(encoding="utf-8"),
        )
        self.assertEqual(
            result["files"]["migratedUnfinishedTasks"][0]["task_text"],
            "A/B 테스트 2세션 듣기",
        )

    def test_completed_checkbox_state_persists_after_reload(self):
        task_path = Path(TEST_APP_DIR) / "completion_reload.md"
        task_path.write_text("- [ ] 판다스 30분\n", encoding="utf-8")
        task_entry = file_entry("completion_reload.md", str(task_path))
        config = {
            "target_times": ["06:00"],
            "theme": "light",
            "last_display_date": main.get_app_today_str(),
            "triggered_times_today": [],
            "files": main.default_files_struct({
                "today": [task_entry],
            }),
        }
        main.save_config(config)

        api = main.Api(main.load_config())
        result = api.update_file_content(str(task_path), "- [x] 판다스 30분\n")
        self.assertTrue(result["success"])

        reloaded_api = main.Api(main.load_config())
        files = reloaded_api.read_all_files()

        self.assertIn("- [x] 판다스 30분", task_path.read_text(encoding="utf-8"))
        self.assertIn("- [x] 판다스 30분", files["today"][0]["content"])

    def test_completed_checkbox_state_survives_date_rollover(self):
        task_path = Path(TEST_APP_DIR) / "completion_rollover.md"
        task_path.write_text("- [x] 판다스 30분\n- [ ] 책 30분\n", encoding="utf-8")
        task_entry = file_entry("completion_rollover.md", str(task_path))
        config = {
            "target_times": ["06:00"],
            "theme": "light",
            "last_display_date": "2026-05-10",
            "triggered_times_today": [],
            "files": main.default_files_struct({
                "today": [task_entry],
            }),
        }

        class AfterReset(datetime.datetime):
            @classmethod
            def now(cls):
                return cls(2026, 5, 11, 3, 0, 0)

        with mock.patch.object(main.datetime, "datetime", AfterReset):
            migrated = main.ensure_config_is_current(config, persist=False)

        api = main.Api(migrated)
        files = api.read_all_files()

        self.assertEqual(files["today"], [])
        self.assertEqual(files["byDate"]["2026-05-10"][0]["path"], str(task_path))
        self.assertIn("- [x] 판다스 30분", files["byDate"]["2026-05-10"][0]["content"])
        self.assertIn("- [ ] 책 30분", files["byDate"]["2026-05-10"][0]["content"])


if __name__ == "__main__":
    unittest.main()
