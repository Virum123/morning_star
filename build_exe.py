import os
import subprocess


def build():
    """Build Morning Star into a standalone Windows EXE using PyInstaller.
    
    Prerequisites:
      1. npm run build   (inside the ./ui folder)
      2. pip install pyinstaller plyer
    """
    print("=" * 55)
    print("  Morning Star — PyInstaller Build")
    print("=" * 55)

    # Check for the UI dist folder
    dist_dir = os.path.join(os.path.dirname(__file__), "ui", "dist")
    if not os.path.isdir(dist_dir):
        print("\n[ERROR] ui/dist not found. Please run 'npm run build' inside the ./ui folder first.")
        return

    print(f"[OK] Found UI build at: {dist_dir}")

    import sys
    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--windowed",                        # No console/terminal window
        "--icon=morning_star.ico",
        "--add-data=ui/dist;ui/dist",        # Bundle the React build
        "--name=Morning Star",
        "main.py"
    ]

    print("\n[CMD] " + " ".join(cmd))
    print()

    result = subprocess.run(cmd)

    if result.returncode == 0:
        print("\n[SUCCESS] Build complete!")
        print("  → Executable: dist/Morning Star/Morning Star.exe")
    else:
        print("\n[FAILED] PyInstaller exited with errors.")


if __name__ == "__main__":
    build()
