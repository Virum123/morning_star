import { useState, useEffect } from 'react';
import { ListTodo, FileText, Settings as SettingsIcon, HelpCircle, X, LayoutDashboard } from 'lucide-react';
import { api } from './utils/api';
import { trackEvent, setAnalyticsUser } from './utils/analytics';
import { t } from './utils/i18n';
import './App.css';
import appIcon from './assets/morning_star_app_icon.png';
import coverImage from './assets/morning_star_cover.png';
import { DYNSUN } from './utils/suns';

// Components
import Tasks from './components/Tasks';
import Files from './components/Files';
import Settings from './components/Settings';
import Dashboard from './components/Dashboard';

function getDynamicThemePhase(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'sunset';
  return 'night';
}

function applyThemeMode(theme, date = new Date()) {
  const nextTheme = theme || 'light';
  const phase = getDynamicThemePhase(date);
  const { body } = document;
  const useDarkChrome = nextTheme === 'dark' || (nextTheme === 'dynamic' && phase === 'night');

  body.classList.toggle('theme-dark', useDarkChrome);
  body.classList.toggle('theme-dynamic', nextTheme === 'dynamic');

  if (nextTheme === 'dynamic') {
    body.dataset.dynamicPhase = phase;
  } else {
    delete body.dataset.dynamicPhase;
  }
}

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [theme, setTheme] = useState('light');
  const [lang, setLang] = useState('ko');
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
        const nextTheme = config.theme || 'light';
        applyThemeMode(nextTheme);
        setTheme(nextTheme);
        setLang(config.language || 'ko');
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
      applyThemeMode(newTheme);
      setTheme(newTheme);
    };
    window.addEventListener('themeChanged', handleThemeChange);

    const handleNicknameChange = (e) => {
      setNickname(e.detail);
    };
    window.addEventListener('nicknameChanged', handleNicknameChange);

    const handleLanguageChange = (e) => {
      setLang(e.detail);
    };
    window.addEventListener('languageChanged', handleLanguageChange);

    return () => {
      window.removeEventListener('pywebviewready', initTheme);
      window.removeEventListener('themeChanged', handleThemeChange);
      window.removeEventListener('nicknameChanged', handleNicknameChange);
      window.removeEventListener('languageChanged', handleLanguageChange);
    };
  }, []);

  useEffect(() => {
    applyThemeMode(theme);
    if (theme !== 'dynamic') return undefined;

    const intervalId = window.setInterval(() => {
      applyThemeMode('dynamic');
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [theme]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return `${t(lang, 'goodMorning')}, ${nickname}! ☀️`;
    if (hour >= 12 && hour < 17) return `${t(lang, 'goodAfternoon')}, ${nickname}!`;
    if (hour >= 17 && hour < 21) return `${t(lang, 'goodEvening')}, ${nickname}! 🌅`;
    return `${t(lang, 'goodNight')}, ${nickname}! 🌙`;
  };

  const getDynamicSun = () => {
    const phase = getDynamicThemePhase(new Date());
    if (phase === 'morning') return DYNSUN.MORNING;
    if (phase === 'day') return DYNSUN.NOON;
    if (phase === 'sunset') return DYNSUN.EVENING;
    return DYNSUN.NIGHT;
  };

  const renderContent = () => {
    if (!isReady) {
      return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</div>;
    }

    const wrapper = (children) => (
      <div className="main-content-layout" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="app-header-greeting">
          <h1 className="tab-title">{getGreeting()}</h1>
          <p>{t(lang, 'greetingDesc')}</p>
        </div>
        {children}
      </div>
    );

    switch (activeTab) {
      case 'dashboard': return wrapper(<Dashboard key={dashboardKey} lang={lang} />);
      case 'tasks': return wrapper(<Tasks key={tasksKey} lang={lang} />);
      case 'files': return wrapper(<Files lang={lang} />);
      case 'settings': return wrapper(<Settings lang={lang} />);
      default: return wrapper(<Tasks key={tasksKey} lang={lang} />);
    }
  };

  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (e) => e.preventDefault();

  const navItems = [
    { id: 'dashboard', icon: <LayoutDashboard size={18} />, label: t(lang, 'dashboard') },
    { id: 'tasks', icon: <ListTodo size={18} />, label: t(lang, 'tasks') },
    { id: 'files', icon: <FileText size={18} />, label: t(lang, 'files') },
    { id: 'settings', icon: <SettingsIcon size={18} />, label: t(lang, 'settings') },
  ];

  return (
    <div className="app-container" onDragOver={handleDragOver} onDrop={handleDrop}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <img src={getDynamicSun()} alt="Morning Star app icon" className="sidebar-brand-image" />
          <div>
            <h1 className="sidebar-title">Morning Star</h1>
            <p className="sidebar-subtitle">Forge tomorrow tonight.</p>
          </div>
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
            <span>{t(lang, 'howToUse')}</span>
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
