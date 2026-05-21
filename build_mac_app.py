from __future__ import annotations

import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parent
UI_DIR = ROOT / "ui"
UI_DIST = UI_DIR / "dist"
PYINSTALLER_CACHE_DIR = ROOT / ".pyinstaller"
PYINSTALLER_SPEC_DIR = ROOT / ".pyinstaller"
TEMP_BUILD_ROOT = Path(os.environ.get("MORNING_STAR_BUILD_ROOT", "/private/tmp/morning_star_build"))
TEMP_WORK_DIR = TEMP_BUILD_ROOT / "work"
TEMP_DIST_DIR = TEMP_BUILD_ROOT / "dist"
APP_NAME = "Morning Star"
APP_BUNDLE = ROOT / "dist" / f"{APP_NAME}.app"
TEMP_APP_BUNDLE = TEMP_DIST_DIR / f"{APP_NAME}.app"
PREFERRED_MAC_PYTHON = Path(
    os.environ.get(
        "MORNING_STAR_BUILD_PYTHON",
        "/Applications/Xcode.app/Contents/Developer/usr/bin/python3",
    )
)
TRACKED_SUFFIXES = {
    ".py",
    ".css",
    ".html",
    ".ico",
    ".icns",
    ".jpg",
    ".js",
    ".json",
    ".jsx",
    ".md",
    ".png",
    ".svg",
}
EXCLUDED_DIR_NAMES = {".git", ".pyinstaller", ".vendor", "build", "dist", "node_modules"}
ICON_OUTPUTS = [
    ROOT / "morning_star_app_icon.png",
    ROOT / "morning_star_cover.png",
    ROOT / "morning_star.ico",
    ROOT / "morning_star.icns",
    UI_DIR / "src" / "assets" / "morning_star_app_icon.png",
    UI_DIR / "src" / "assets" / "morning_star_cover.png",
    UI_DIR / "public" / "favicon.ico",
]
REQUIRED_ASSETS = [
    ROOT / "morning_star.icns",
    ROOT / "morning_star.ico",
    ROOT / "morning_star_app_icon.png",
    ROOT / "morning_star_cover.png",
    UI_DIR / "mac_fallback.html",
]


def is_conda_python():
    markers = [
        sys.executable,
        sys.prefix,
        os.environ.get("CONDA_PREFIX", ""),
        os.environ.get("CONDA_DEFAULT_ENV", ""),
    ]
    return any("conda" in str(marker).lower() or "anaconda" in str(marker).lower() for marker in markers)


def maybe_reexec_for_packaging():
    if sys.platform != "darwin" or os.environ.get("MORNING_STAR_BUILD_REEXEC") == "1":
        return

    user_requested_python = "MORNING_STAR_BUILD_PYTHON" in os.environ
    should_switch_python = user_requested_python or is_conda_python()
    if not should_switch_python:
        return

    if not PREFERRED_MAC_PYTHON.exists():
        if is_conda_python():
            print(
                "[WARN] macOS packaging is running under conda Python, but the preferred "
                f"build Python was not found: {PREFERRED_MAC_PYTHON}"
            )
        return

    if Path(sys.executable).resolve() == PREFERRED_MAC_PYTHON.resolve():
        return

    env = os.environ.copy()
    env["MORNING_STAR_BUILD_REEXEC"] = "1"
    vendor_path = str(ROOT / ".vendor")
    existing_pythonpath = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = vendor_path if not existing_pythonpath else f"{vendor_path}{os.pathsep}{existing_pythonpath}"

    print(f"[OK] Re-running macOS build with {PREFERRED_MAC_PYTHON}")
    os.execve(
        str(PREFERRED_MAC_PYTHON),
        [str(PREFERRED_MAC_PYTHON), str(Path(__file__).resolve()), *sys.argv[1:]],
        env,
    )


maybe_reexec_for_packaging()


def data_arg(source: Path, target: str):
    return f"--add-data={source.resolve()}:{target}"


def run(cmd, cwd=ROOT, env=None):
    print("\n[CMD]", " ".join(str(part) for part in cmd))
    result = subprocess.run(cmd, cwd=cwd, env=env)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def has_ui_build():
    return UI_DIST.exists()


def latest_mtime(path: Path) -> float:
    latest = 0.0
    if not path.exists():
        return latest

    if path.is_file():
        return path.stat().st_mtime

    latest = path.stat().st_mtime
    for current_root, dir_names, file_names in os.walk(path):
        dir_names[:] = [name for name in dir_names if name not in EXCLUDED_DIR_NAMES]
        for file_name in file_names:
            file_path = Path(current_root) / file_name
            if file_path.suffix.lower() not in TRACKED_SUFFIXES:
                continue
            latest = max(latest, file_path.stat().st_mtime)

    return latest


def ui_sources_mtime() -> float:
    candidates = [
        UI_DIR / "src",
        UI_DIR / "public",
        UI_DIR / "index.html",
        UI_DIR / "vite.config.js",
        UI_DIR / "package.json",
        UI_DIR / "package-lock.json",
    ]
    return max((latest_mtime(path) for path in candidates), default=0.0)


def ui_build_mtime() -> float:
    return latest_mtime(UI_DIST)


def app_sources_mtime() -> float:
    candidates = [
        ROOT / "main.py",
        ROOT / "build_mac_app.py",
        ROOT / "install_desktop_launcher.py",
        ROOT / "run_mac.sh",
        ROOT / "ui" / "mac_fallback.html",
        *ICON_OUTPUTS,
    ]
    if UI_DIST.exists():
        candidates.append(UI_DIST)

    return max((latest_mtime(path) for path in candidates), default=0.0)


def app_bundle_mtime() -> float:
    return latest_mtime(APP_BUNDLE)


def needs_ui_build() -> bool:
    if not has_ui_build():
        return True
    return ui_sources_mtime() > ui_build_mtime()


def needs_app_build() -> bool:
    if not APP_BUNDLE.exists():
        return True
    return app_sources_mtime() > app_bundle_mtime()


def missing_required_assets():
    return [path for path in REQUIRED_ASSETS if not path.exists()]


def format_timestamp(timestamp: float) -> str:
    if not timestamp:
        return "missing"
    return datetime.fromtimestamp(timestamp).strftime("%Y-%m-%d %H:%M:%S")


def build_ui():
    print("[OK] UI sources changed. Rebuilding ui/dist before packaging.")
    run(["npm", "run", "build"], cwd=UI_DIR)


def prepare_temp_build_dirs():
    if TEMP_BUILD_ROOT.exists():
        shutil.rmtree(TEMP_BUILD_ROOT)
    TEMP_WORK_DIR.mkdir(parents=True, exist_ok=True)
    TEMP_DIST_DIR.mkdir(parents=True, exist_ok=True)


def copy_packaged_app_to_workspace():
    if not TEMP_APP_BUNDLE.exists():
        return False

    APP_BUNDLE.parent.mkdir(parents=True, exist_ok=True)
    if APP_BUNDLE.exists():
        shutil.rmtree(APP_BUNDLE)

    run(["ditto", str(TEMP_APP_BUNDLE), str(APP_BUNDLE)])
    return True


def verify_app_bundle():
    if shutil.which("codesign") is None:
        print("[WARN] codesign not found. Skipping app signature verification.")
        return

    run(["codesign", "--verify", "--deep", "--verbose=1", str(APP_BUNDLE)])


def install_desktop_launcher():
    if os.environ.get("MORNING_STAR_SKIP_LAUNCHER_REFRESH") == "1":
        print("[OK] Skipping Desktop launcher refresh for this run.")
        return False

    launcher_script = ROOT / "install_desktop_launcher.py"
    if not launcher_script.exists():
        print("[WARN] Desktop launcher installer not found. Skipping Desktop launcher refresh.")
        return False

    print("[OK] Refreshing the Desktop launcher.")
    run([sys.executable, str(launcher_script)])
    return True


def build(force=False):
    if sys.platform != "darwin":
        raise SystemExit("build_mac_app.py can only be used on macOS.")

    print("=" * 55)
    print("  Morning Star - macOS App Build")
    print("=" * 55)

    missing_assets = missing_required_assets()
    if missing_assets:
        missing_list = "\n".join(f"  - {path}" for path in missing_assets)
        raise SystemExit(f"Missing required packaging assets:\n{missing_list}")

    ui_changed = needs_ui_build()
    app_changed = force or ui_changed or needs_app_build()
    if not app_changed:
        print("[OK] Packaged app is already up to date.")
        print(f"[OK] Current app bundle: {APP_BUNDLE}")
        print(f"[OK] Source timestamp: {format_timestamp(app_sources_mtime())}")
        print(f"[OK] Bundle timestamp: {format_timestamp(app_bundle_mtime())}")
        return

    ui_changed = needs_ui_build()
    if ui_changed:
        build_ui()

    env = os.environ.copy()
    PYINSTALLER_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    PYINSTALLER_SPEC_DIR.mkdir(parents=True, exist_ok=True)
    prepare_temp_build_dirs()
    env["PYINSTALLER_CONFIG_DIR"] = str(PYINSTALLER_CACHE_DIR)

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--windowed",
        f"--name={APP_NAME}",
        f"--specpath={PYINSTALLER_SPEC_DIR}",
        f"--workpath={TEMP_WORK_DIR}",
        f"--distpath={TEMP_DIST_DIR}",
        "--osx-bundle-identifier=com.morningstar.desktop",
        f"--icon={(ROOT / 'morning_star.icns').resolve()}",
        data_arg(ROOT / "ui" / "mac_fallback.html", "ui"),
        data_arg(ROOT / "morning_star.ico", "."),
        data_arg(ROOT / "morning_star_app_icon.png", "."),
        data_arg(ROOT / "morning_star_cover.png", "."),
        "--collect-submodules=webview",
        "--hidden-import=Foundation",
        "--hidden-import=AppKit",
        "--hidden-import=WebKit",
        "main.py",
    ]

    if has_ui_build():
        print("[OK] Found ui/dist. The packaged app will use the full React UI.")
        cmd.insert(9, data_arg(UI_DIST, "ui/dist"))
    else:
        print("[INFO] ui/dist was not found. Building the macOS app with the bundled fallback UI.")

    run(cmd, env=env)

    copied_app = copy_packaged_app_to_workspace()

    if copied_app and APP_BUNDLE.exists():
        verify_app_bundle()
        launcher_refreshed = install_desktop_launcher()
        print(f"\n[SUCCESS] Build complete! Packaged app: {APP_BUNDLE}")
        if launcher_refreshed:
            print("[SUCCESS] Desktop launcher refreshed to open the latest workspace build.")
        else:
            print("[OK] Desktop launcher refresh was skipped for this run.")
    else:
        print("\n[WARN] PyInstaller finished, but the .app bundle was not found where expected.")


if __name__ == "__main__":
    build(force="--if-needed" not in sys.argv)
