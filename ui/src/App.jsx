import { useState, useEffect } from 'react';
import { ListTodo, FileText, Settings as SettingsIcon, Sunrise, Sun, Sunset, Moon, MoonStar, HelpCircle, X, LayoutDashboard } from 'lucide-react';
import { api } from './utils/api';
import { trackEvent, setAnalyticsUser } from './utils/analytics';
import './App.css';

// Components
import Tasks from './components/Tasks';
import Files from './components/Files';
import Settings from './components/Settings';
import Dashboard from './components/Dashboard';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [theme, setTheme] = useState('light');
  const [isReady, setIsReady] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [nickname, setNickname] = useState('Alex');
  // Increments every time user navigates to Dashboard → forces re-fetch
  const [dashboardKey, setDashboardKey] = useState(0);
  // Increments every time user navigates to Tasks → forces remount + re-fetch
  const [tasksKey, setTasksKey] = useState(0);

  useEffect(() => {
    let initDone = false;

    const initTheme = async () => {
      if (initDone) return;
      initDone = true;
      try {
        const config = await api.getConfig();
        if (config.theme === 'dark') {
          document.body.classList.add('theme-dark');
          setTheme('dark');
        } else {
          document.body.classList.remove('theme-dark');
          setTheme('light');
        }
        if (config.user_id) setAnalyticsUser(config.user_id);
        if (config.nickname) setNickname(config.nickname);
      } catch (e) {
        console.error('Failed to load config:', e);
      }
      setIsReady(true);
      // Force-refresh data components after pywebview is confirmed ready
      setDashboardKey(k => k + 1);
      setTasksKey(k => k + 1);
      trackEvent('app_open');
    };

    if (window.pywebview) {
      initTheme();
    } else {
      // Poll every 100ms so we never fire before pywebview is ready
      let attempts = 0;
      const poll = setInterval(() => {
        attempts++;
        if (window.pywebview) {
          clearInterval(poll);
          initTheme();
        } else if (attempts >= 100) {
          // 10s elapsed — genuine dev-mode fallback (no pywebview)
          clearInterval(poll);
          initTheme();
        }
      }, 100);
    }

    const handleThemeChange = (e) => {
      const newTheme = e.detail;
      if (newTheme === 'dark') {
        document.body.classList.add('theme-dark');
      } else {
        document.body.classList.remove('theme-dark');
      }
      setTheme(newTheme);
    };
    window.addEventListener('themeChanged', handleThemeChange);

    const handleNicknameChange = (e) => {
      setNickname(e.detail);
    };
    window.addEventListener('nicknameChanged', handleNicknameChange);

    return () => {
      window.removeEventListener('pywebviewready', initTheme);
      window.removeEventListener('themeChanged', handleThemeChange);
      window.removeEventListener('nicknameChanged', handleNicknameChange);
    };
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return `Good Morning, ${nickname}! ☀️`;
    if (hour >= 12 && hour < 17) return `Good Afternoon, ${nickname}!`;
    if (hour >= 17 && hour < 21) return `Good Evening, ${nickname}! 🌅`;
    return `Good Night, ${nickname}! 🌙`;
  };

  const renderContent = () => {
    if (!isReady) {
      return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</div>;
    }

    const wrapper = (children) => (
      <div className="main-content-layout" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="app-header-greeting">
          <h1 className="tab-title">{getGreeting()}</h1>
          <p>Here's what you have planned for today.</p>
        </div>
        {children}
      </div>
    );

    switch (activeTab) {
      case 'dashboard': return wrapper(<Dashboard key={dashboardKey} />);
      case 'tasks': return wrapper(<Tasks key={tasksKey} />);
      case 'files': return wrapper(<Files />);
      case 'settings': return wrapper(<Settings />);
      default: return wrapper(<Tasks key={tasksKey} />);
    }
  };

  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (e) => e.preventDefault();

  const renderDynamicLogo = () => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return <Sunrise className="sidebar-logo" size={26} />;
    if (hour >= 12 && hour < 16) return <Sun className="sidebar-logo" size={26} />;
    if (hour >= 16 && hour < 18) return <Sunset className="sidebar-logo" size={26} />;
    if (hour >= 18 && hour < 22) return <Moon className="sidebar-logo" size={26} />;
    if (hour >= 22 || hour < 3) return <MoonStar className="sidebar-logo" size={26} />;
    return <Moon className="sidebar-logo" size={26} />;
  };

  const navItems = [
    { id: 'dashboard', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
    { id: 'tasks', icon: <ListTodo size={18} />, label: 'Tasks' },
    { id: 'files', icon: <FileText size={18} />, label: 'Files' },
    { id: 'settings', icon: <SettingsIcon size={18} />, label: 'Settings' },
  ];

  return (
    <div className="app-container" onDragOver={handleDragOver} onDrop={handleDrop}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          {renderDynamicLogo()}
          <h1 className="sidebar-title">Morning ★</h1>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(({ id, icon, label }) => (
            <div
              key={id}
              className={`nav-item ${activeTab === id ? 'active' : ''}`}
              onClick={() => {
                setActiveTab(id);
                if (id === 'dashboard') setDashboardKey(k => k + 1);
                if (id === 'tasks') setTasksKey(k => k + 1);
                trackEvent(`tab_${id}`);
              }}
            >
              {icon}
              <span>{label}</span>
            </div>
          ))}


          <div style={{ flexGrow: 1 }} />

          <div
            className="nav-item"
            onClick={() => {
              setIsHelpOpen(true);
              trackEvent('onboarding_view');
            }}
          >
            <HelpCircle size={18} />
            <span>How to Use</span>
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="main-content fade-in">
        {renderContent()}
      </main>

      {/* Help Modal */}
      {isHelpOpen && (
        <div className="modal-overlay fade-in" onClick={() => setIsHelpOpen(false)}>
          <div className="modal-content glass-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px', maxHeight: '88vh', overflowY: 'auto' }}>
            <button className="icon-btn close-modal-btn" onClick={() => setIsHelpOpen(false)}>
              <X size={20} />
            </button>
            <h2 className="modal-title">Welcome to Morning Star! ⭐️</h2>

            <div className="onboarding-steps">
              <div className="step-item">
                <div className="step-number">1</div>
                <div className="step-text">
                  <strong>Plan your Tomorrow</strong>
                  <p>Go to <b>Files Tab ➔ Tomorrow</b> and click [Write Task] or drop a <code>.md</code> file.</p>
                </div>
              </div>
              <div className="step-item">
                <div className="step-number">2</div>
                <div className="step-text">
                  <strong>Set your Morning Routine</strong>
                  <p>Go to the <b>Settings Tab</b> and set the time you usually wake up.</p>
                </div>
              </div>
              <div className="step-item">
                <div className="step-number">3</div>
                <div className="step-text">
                  <strong>Track your Progress</strong>
                  <p>Check the <b>Dashboard</b> to see your daily completion rate, streak, and weekly overview.</p>
                </div>
              </div>
            </div>

            {/* ── AI Prompt Template ── */}
            <div style={{ marginTop: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>🤖 AI Task Generator Prompt</strong>
                <button
                  className="btn btn-outline-primary"
                  style={{ padding: '4px 12px', fontSize: '0.78rem' }}
                  onClick={() => {
                    const prompt = document.getElementById('ms-prompt-box').value;
                    navigator.clipboard.writeText(prompt).catch(() => {
                      document.getElementById('ms-prompt-box').select();
                      document.execCommand('copy');
                    });
                  }}
                >
                  Copy
                </button>
              </div>
              <textarea
                id="ms-prompt-box"
                readOnly
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  height: '140px',
                  fontSize: '0.78rem',
                  fontFamily: 'monospace',
                  background: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '10px',
                  padding: '12px',
                  resize: 'none',
                  lineHeight: '1.55',
                }}
                defaultValue={`You are a professional daily planner assistant. Your job is to create a clean, concise markdown task list based on the user's input.

Rules:
- Output ONLY a markdown checklist. No headings, no explanations.
- Each item must use "- [ ] " format.
- Group related tasks under a short section heading using "## ".  
- Respond in the SAME language the user writes their tasks in.
- End with a blank line after the last item.

Now organize the tasks listed below:`}
              />
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: '1.5' }}>
                ① Copy the prompt above → ② Paste into ChatGPT / Claude → ③ Write your tasks at the end → ④ Copy the output and save it as a <code>.md</code> file in <b>Files → Tomorrow</b>.
              </p>
            </div>

            <button
              className="btn btn-primary"
              style={{ marginTop: '20px', width: '100%' }}
              onClick={() => setIsHelpOpen(false)}
            >
              Got it! Let's start
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


export default App;
