# Morning Star ✨

Morning Star is a desktop app that greets you with your daily plan at your chosen wake-up time. Schedules and daily reflections are saved to your signed-in Supabase account. It started as a Windows background app and now also includes a macOS app build path and refreshed app branding.

## 🌟 Key Features
- **Daily Auto-Migration:** Tomorrow's tasks move into Today when a new app day starts, and completed days are organized into a dated history.
- **Planner Views:** Daily, weekly, and monthly views share the same schedules stored in Supabase.
- **Daily Reflections:** Save a reflection, then browse saved entries by date and explicitly edit an existing entry. The editor clears after a successful save.
- **Task Controls:** Check tasks in daily or weekly views, reorder daily tasks with the handle or move buttons, and move weekly tasks by dragging or selecting a date.
- **Fast Task Entry:** Add one-off tasks from the planner or reuse Frequent Tasks across selected days.
- **Account Persistence:** Task changes, completion states, ordering, and daily reflections are saved to Supabase. Reordering or moving a task keeps its database identity.
- **Desktop Startup:** Windows can run in background startup mode, while macOS packages as a `.app` bundle with a Desktop launcher.

## 🚀 How to Use
1. **Launch the App:** Run `Morning Star.exe`. (The app automatically registers itself to run silently on Windows Startup).
2. **Profile & Timing:** Navigate to the `Settings` tab. Enter your **Nickname** and set one or more **Target Times** (e.g., `07:00 AM`). 
3. **Plan Your Day:** Use the `Planner` tab to add tasks, review today, plan tomorrow, and scan weekly/monthly progress.
4. **Wake Up:** Close the UI. The app will stay asleep in the background. At `07:00 AM`, the window will elegantly pop up displaying your "Today" tasks, greeting you by name!

## 🛠️ Tech Stack
- **Backend/Host:** Python 3, `pywebview`, `pyinstaller`, Windows Registry startup integration.
- **Frontend UI:** Vite, React 19, standard custom CSS (No Tailwind).
- **Storage:** Supabase stores schedules (`schedule_items`) and daily reflections (`daily_reflections`). Desktop settings and Frequent Tasks use local app data in `%LOCALAPPDATA%/MorningStar` on Windows and `~/Library/Application Support/MorningStar` on macOS.

The React planner uses an in-memory checklist representation for rendering and task entry; it does not create separate Markdown files. Older Markdown file handlers remain in the Python host for compatibility, but the current planner reads and writes schedules through the Supabase repository.

## 🏗️ Building for Production

### Windows EXE

Follow these steps to package the app as a single distributable folder for users who don't have Python installed.

### Step 1 — Build the React UI
```bash
cd ui
npm run build
cd ..
```

### Step 2 — Install Python dependencies
```bash
pip install pyinstaller plyer
```

> **Note:** `plyer` is required for Windows tray notifications. Without it, notifications are silently skipped.

### Step 3 — Run the build script
```bash
python build_exe.py
```

### Output
The final executable will be at:
```
dist/Morning Star/Morning Star.exe
```
Distribute the entire `dist/Morning Star/` folder to end-users.

### macOS `.app`

1. Install Python packages into the local vendor folder:
```bash
python3 -m pip install --target .vendor --upgrade Pillow PyInstaller pywebview
```

2. Install the UI dependencies and build the frontend:
```bash
cd ui
npm ci
npm run build
cd ..
```

3. Build the macOS app bundle:
```bash
PYTHONPATH=.vendor python3 build_mac_app.py
```

Output:
```bash
dist/Morning Star.app
```

The Desktop `Morning Star.app` is refreshed as a hidden launcher that opens the latest packaged app bundle.

## Validation

Run the frontend interaction and storage regression tests, lint, and production build:
```bash
cd ui
npm ci
npm test
npm run lint
npm run build
```

The frontend tests use mocked repositories and do not write to a live Supabase database. Run the existing Python host regression tests from the project root with `python3 -m unittest discover -s tests -v`.
