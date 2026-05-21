from __future__ import annotations

import plistlib
import shutil
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DESKTOP_APP = Path.home() / "Desktop" / "Morning Star.app"
PACKAGED_APP = ROOT / "dist" / "Morning Star.app"
BUILD_SCRIPT = ROOT / "build_mac_app.py"
VENDOR_DIR = ROOT / ".vendor"
ICON_SOURCE = ROOT / "morning_star.icns"
ICON_TARGET = DESKTOP_APP / "Contents" / "Resources" / "applet.icns"
INFO_PLIST = DESKTOP_APP / "Contents" / "Info.plist"
LOG_FILE = Path("/tmp/morning_star_launcher.log")
ASSETS_CAR = DESKTOP_APP / "Contents" / "Resources" / "Assets.car"


def remove_app_bundle(path: Path) -> None:
    if not path.exists():
        return

    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path)
        return

    path.unlink()


def remove_duplicate_desktop_apps() -> None:
    for path in sorted(DESKTOP_APP.parent.glob("Morning Star*.app")):
        remove_app_bundle(path)


def install_bundle_icon() -> None:
    if not ICON_SOURCE.exists():
        print(f"[WARN] Icon source not found: {ICON_SOURCE}")
        return

    ICON_TARGET.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ICON_SOURCE, ICON_TARGET)

    if ASSETS_CAR.exists():
        ASSETS_CAR.unlink()


def configure_launcher_bundle() -> None:
    if not INFO_PLIST.exists():
        print(f"[WARN] Launcher Info.plist not found: {INFO_PLIST}")
        return

    with INFO_PLIST.open("rb") as file:
        info = plistlib.load(file)

    # Keep the launcher itself out of the Dock so only the real app is visible.
    info["LSUIElement"] = True
    info["CFBundleIconFile"] = "applet.icns"
    info.pop("CFBundleIconName", None)
    info["NSDesktopFolderUsageDescription"] = "Morning Star needs Desktop access to refresh the workspace app before launch."
    info["NSDocumentsFolderUsageDescription"] = "Morning Star may need file access when your workspace lives in protected folders."

    with INFO_PLIST.open("wb") as file:
        plistlib.dump(info, file)


def main() -> None:
    if shutil.which("osacompile") is None:
        raise SystemExit("osacompile is required to create the desktop launcher app.")

    applescript = f'''
on run
  try
    do shell script "/usr/bin/open " & quoted form of "{PACKAGED_APP}"
  on error errMsg number errNum
    display dialog "Morning Star could not be opened. Check that the app exists at {PACKAGED_APP}\\n\\nError: " & errMsg buttons {{"OK"}} default button "OK"
  end try
end run
'''.strip()

    with tempfile.TemporaryDirectory() as tmpdir:
        script_path = Path(tmpdir) / "Morning Star Launcher.applescript"
        script_path.write_text(applescript, encoding="utf-8")

        remove_duplicate_desktop_apps()
        subprocess.run(
            ["osacompile", "-o", str(DESKTOP_APP), str(script_path)],
            check=True,
        )

    configure_launcher_bundle()
    install_bundle_icon()
    print(f"Installed desktop launcher: {DESKTOP_APP}")
    print("This launcher simply opens the packaged workspace app without trying to auto-rebuild it.")


if __name__ == "__main__":
    main()
