# Morning Star ✨

Morning Star is a Windows background application that automatically greets you with your Markdown-based to-do list at your specified wake-up time. It enforces a healthy morning routine by explicitly showing your goals for the day in a premium, modern glassmorphism interface.

## 🌟 Key Features
- **Daily Auto-Migration:** Drop your `.md` task files into the **Tomorrow** tab. When the clock strikes your target time the next day, they automatically migrate to **Today**, and old tasks move into an organized **Yesterday** history.
- **Premium Glassmorphism UI:** Built with Vite + React, the interface features a stunning dark-mode/light-mode togglable aesthetic mimicking high-end iOS designs.
- **In-App Markdown Editor & Persistence:** Write tasks directly in the app, and interactively check them off. Your `[x]` checkmarks are permanently saved to the local markdown file!
- **Zero-Friction Startup:** Runs completely silently in the Windows background utilizing a Mutex lock. It only pops up the beautiful UI when it's time for you to see your tasks.
- **Anonymous Analytics Tracker:** Includes a built-in UUID session tracker for Google Analytics 4 (GA4) / Tag Manager integrations, allowing you to measure retention without needing user accounts!

## 🚀 How to Use
1. **Launch the App:** Run `Morning Star.exe`. (The app automatically registers itself to run silently on Windows Startup).
2. **Profile & Timing:** Navigate to the `Settings` tab. Enter your **Nickname** and set one or more **Target Times** (e.g., `07:00 AM`). 
3. **Plan Tomorrow:** Go to the `Files` -> `Tomorrow` tab. Click the **Write Task** button or Drag-and-Drop an existing `.md` file into the dashed Dropzone.
4. **Wake Up:** Close the UI. The app will stay asleep in the background. At `07:00 AM`, the window will elegantly pop up displaying your "Today" tasks, greeting you by name!

## 🛠️ Tech Stack
- **Backend/Host:** Python 3, `pywebview` (Edge/Chromium WebView2), `pyinstaller`, Windows Registry (winreg).
- **Frontend UI:** Vite, React 18, standard custom CSS (No Tailwind).
- **Storage:** Local `%LOCALAPPDATA%/MorningStar` JSON config and direct File I/O.

## 📱 Future Roadmap
Check out `next_step.md` for a guide on how to port this project into a Mobile App (Android/PlayStore) or a Toss Mini Web-App utilizing Capacitor or React Native.
