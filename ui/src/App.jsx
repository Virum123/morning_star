import { useState, useEffect } from 'react';
import { ListTodo, FileText, Settings as SettingsIcon, Sunrise, Sun, Sunset, Moon, MoonStar, HelpCircle, X } from 'lucide-react';
import { api } from './utils/api';
import { trackEvent, setAnalyticsUser } from './utils/analytics';
import './App.css';

// Components
import Tasks from './components/Tasks';
import Files from './components/Files';
import Settings from './components/Settings';

function App() {
  const [activeTab, setActiveTab] = useState('tasks');
  const [theme, setTheme] = useState('light');
  const [isReady, setIsReady] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [nickname, setNickname] = useState('Alex');

  useEffect(() => {
    const initTheme = async () => {
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
        console.error("Failed to load config:", e);
      }
      setIsReady(true);
      trackEvent('app_open');
    };

    if (window.pywebview) {
      initTheme();
    } else {
      window.addEventListener('pywebviewready', initTheme);
      // Fallback for real browser Dev
      setTimeout(() => {
        if (!window.pywebview) initTheme();
      }, 500);
    }

    // Listen to theme changes from Settings
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

    // Listen to nickname changes from Settings
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

  const renderContent = () => {
    if (!isReady) {
      return <div style={{padding: '2rem', textAlign: 'center'}}>Loading App Data...</div>;
    }
    
    // Create the global wrapper containing the dynamic greeting
    const wrapper = (children) => (
      <div className="main-content-layout" style={{display: 'flex', flexDirection: 'column', height: '100%', gap: '20px'}}>
        <div className="app-header-greeting">
          <h1 className="tab-title" style={{ fontSize: "2.8rem", marginBottom: "4px" }}>Good Morning, {nickname}!</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "1.05rem" }}>Here's what you have planned for today.</p>
        </div>
        {children}
      </div>
    );
    
    switch (activeTab) {
      case 'tasks':
        return wrapper(<Tasks />);
      case 'files':
        return wrapper(<Files />);
      case 'settings':
        return wrapper(<Settings />);
      default:
        return wrapper(<Tasks />);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault(); // crucial to allow dropping globally
  };

  const handleDrop = (e) => {
    e.preventDefault(); // Stop edge from opening the file immediately
  };

  const renderDynamicLogo = () => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return <Sunrise className="sidebar-logo" size={28} />;
    if (hour >= 12 && hour < 16) return <Sun className="sidebar-logo" size={28} />;
    if (hour >= 16 && hour < 18) return <Sunset className="sidebar-logo" size={28} />;
    if (hour >= 18 && hour < 22) return <Moon className="sidebar-logo" size={28} />;
    if (hour >= 22 || hour < 3) return <MoonStar className="sidebar-logo" size={28} />;
    return <Moon className="sidebar-logo" size={28} />; // 03:00 - 06:00
  };

  return (
    <div className="app-container" onDragOver={handleDragOver} onDrop={handleDrop}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          {renderDynamicLogo()}
          <h1 className="sidebar-title">Morning</h1>
        </div>
        
        <nav className="sidebar-nav">
          <div 
            className={`nav-item ${activeTab === 'tasks' ? 'active' : ''}`}
            onClick={() => setActiveTab('tasks')}
          >
            <ListTodo size={20} />
            <span>Tasks</span>
          </div>
          
          <div 
            className={`nav-item ${activeTab === 'files' ? 'active' : ''}`}
            onClick={() => setActiveTab('files')}
          >
            <FileText size={20} />
            <span>Files</span>
          </div>
          
          <div 
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <SettingsIcon size={20} />
            <span>Settings</span>
          </div>

          <div style={{ flexGrow: 1 }}></div>

          <div 
            className="nav-item nav-item-help"
            onClick={() => {
              setIsHelpOpen(true);
              trackEvent('onboarding_view');
            }}
          >
            <HelpCircle size={20} />
            <span>How to Use</span>
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="main-content fade-in">
        {renderContent()}
      </main>

      {/* Onboarding / Help Modal */}
      {isHelpOpen && (
        <div className="modal-overlay fade-in" onClick={() => setIsHelpOpen(false)}>
          <div className="modal-content glass-card" onClick={e => e.stopPropagation()}>
            <button className="icon-btn close-modal-btn" onClick={() => setIsHelpOpen(false)}>
              <X size={20} />
            </button>
            <h2 className="modal-title">Welcome to Morning Star! ⭐️</h2>
            
            <div className="onboarding-steps">
              <div className="step-item">
                <div className="step-number">1</div>
                <div className="step-text">
                  <strong>Plan your Tomorrow</strong>
                  <p>Go to the <b>Files Tab ➔ Tomorrow</b> and click [Write Task] or drop a `.md` file to save your tasks for the next day.</p>
                </div>
              </div>
              
              <div className="step-item">
                <div className="step-number">2</div>
                <div className="step-text">
                  <strong>Set your Morning Routine</strong>
                  <p>Go to the <b>Settings Tab</b> and set the time you usually wake up or start work.</p>
                </div>
              </div>

              <div className="step-item">
                <div className="step-number">3</div>
                <div className="step-text">
                  <strong>Start your Day right</strong>
                  <p>Morning Star will silently wait in the background and <b>automatically pop up</b> at your specified time, showing you all the tasks migrating from Tomorrow to Today.</p>
                </div>
              </div>
            </div>
            
            <button className="btn btn-primary w-100" style={{marginTop: '20px', width: '100%'}} onClick={() => setIsHelpOpen(false)}>
              Got it! Let's start
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
