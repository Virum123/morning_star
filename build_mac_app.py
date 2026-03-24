from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
UI_DIR = ROOT / "ui"
UI_DIST = UI_DIR / "dist"
VENDOR_DIR = ROOT / ".vendor"
PYINSTALLER_CACHE_DIR = ROOT / ".pyinstaller"
PYINSTALLER_SPEC_DIR = ROOT / ".pyinstaller"
APP_NAME = "Morning Star"


def data_arg(source: Path, target: str):
    return f"--add-data={source.resolve()}:{target}"


def run(cmd, cwd=ROOT, env=None):
    print("\n[CMD]", " ".join(str(part) for part in cmd))
    result = subprocess.run(cmd, cwd=cwd, env=env)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def has_ui_build():
    return UI_DIST.exists()


def build():
    if sys.platform != "darwin":
        raise SystemExit("build_mac_app.py can only be used on macOS.")

    print("=" * 55)
    print("  Morning Star - macOS App Build")
    print("=" * 55)

    run([sys.executable, "make_icon.py"])

    env = os.environ.copy()
    existing_pythonpath = env.get("PYTHONPATH")
    env["PYTHONPATH"] = str(VENDOR_DIR) if not existing_pythonpath else f"{VENDOR_DIR}:{existing_pythonpath}"
    PYINSTALLER_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    PYINSTALLER_SPEC_DIR.mkdir(parents=True, exist_ok=True)
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

    app_path = ROOT / "dist" / f"{APP_NAME}.app"
    if app_path.exists():
        print(f"\n[SUCCESS] Build complete: {app_path}")
    else:
        print("\n[WARN] PyInstaller finished, but the .app bundle was not found where expected.")


if __name__ == "__main__":
    build()
