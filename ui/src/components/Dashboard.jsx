import { useState, useEffect, useMemo } from 'react';
import { Flame, CalendarDays, CheckCircle2, Circle, TrendingUp } from 'lucide-react';
import { api } from '../utils/api';
import { trackEvent } from '../utils/analytics';
import './Dashboard.css';

/* ─── Donut Chart (SVG, no library) ─── */
function DonutChart({ percent, size = 140, strokeWidth = 14, label, sublabel }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="donut-wrapper">
      <svg width={size} height={size} className="donut-svg">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--divider)"
          strokeWidth={strokeWidth}
        />
        {/* Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#donutGrad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="donut-progress"
        />
        <defs>
          <linearGradient id="donutGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--accent-color)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--card-stripe)" />
          </linearGradient>
        </defs>
        {/* Center text */}
        <text x="50%" y="46%" dominantBaseline="middle" textAnchor="middle" className="donut-pct">
          {percent}%
        </text>
        <text x="50%" y="62%" dominantBaseline="middle" textAnchor="middle" className="donut-sub">
          done
        </text>
      </svg>
      {label && <p className="donut-label">{label}</p>}
      {sublabel && <p className="donut-sublabel">{sublabel}</p>}
    </div>
  );
}

/* ─── Consistency + This Week (merged) ─── */
function WeeklyConsistency({ streak, fireDays = {} }) {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));

    const week = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });

    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return (
      <div className="streak-widget">
        <div className="streak-top" style={{ marginBottom: '16px' }}>
          <Flame size={22} className="streak-icon" />
          <div>
            <div className="streak-count">{streak}</div>
            <div className="streak-desc">day streak</div>
          </div>
        </div>

        <div className="week-days" style={{ marginTop: '0' }}>
          {week.map((d, i) => {
            const isToday = d.toDateString() === today.toDateString();
            const isWeekend = i >= 5;
            const dateStr = d.toISOString().split('T')[0];
            const hasFire = fireDays[dateStr];
            return (
              <div key={i} className={`week-day ${isToday ? 'today' : ''} ${isWeekend ? 'weekend' : ''} ${hasFire ? 'fire-day' : ''}`}>
                <span className="wd-name">{dayNames[i]}</span>
                {hasFire
                  ? <div className="wd-fire"><Flame size={18} color="#ff6a00" fill="#ff6a00" strokeWidth={1.5} /></div>
                  : <span className="wd-num">{d.getDate()}</span>
                }
              </div>
            );
          })}
        </div>
      </div>
    );
}

/* ─── Quote Widget ─── */
function QuoteWidget() {
  const quotes = [
    { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
    { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
    { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
    { text: "Push yourself, because no one else is going to do it for you.", author: "Unknown" },
    { text: "Great things never come from comfort zones.", author: "Unknown" },
    { text: "Dream it. Wish it. Do it.", author: "Unknown" },
    { text: "Success doesn't just find you. You have to go out and get it.", author: "Unknown" },
  ];
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const quote = quotes[dayOfYear % quotes.length];
  return (
    <div className="quote-widget">
      <p className="quote-text">"{quote.text}"</p>
      <p className="quote-author">— {quote.author}</p>
    </div>
  );
}

/* ─── Task Summary Card (left column) ─── */
function TaskSummaryCard({ file, checked, total }) {
  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
  return (
    <div className="ds-task-card glass-card">
      <div className="ds-task-header">
        <span className="ds-task-filename">{file.filename}</span>
        <span className="ds-task-count">{checked}/{total}</span>
      </div>
      <div className="ds-progress-bar-track">
        <div className="ds-progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <ul className="ds-task-items">
        {file.items?.slice(0, 5).map((item, i) => (
          <li key={i} className={`ds-task-item ${item.checked ? 'checked' : ''}`}>
            {item.checked
              ? <CheckCircle2 size={14} className="ds-check-icon done" />
              : <Circle size={14} className="ds-check-icon" />}
            <span>{item.text}</span>
          </li>
        ))}
        {(file.items?.length || 0) > 5 && (
          <li className="ds-task-item more">+{file.items.length - 5} more items...</li>
        )}
      </ul>
    </div>
  );
}

/* ─── Parse markdown checklist ─── */
function parseChecklist(content = '') {
  // Guard against null/undefined (Python None becomes JS null via PyWebView)
  if (!content) return { items: [], checked: 0, total: 0 };
  const lines = content.split('\n');
  const items = [];
  let checked = 0;
  for (const line of lines) {
    // Handle indented items (^\s*), both - * + markers, optional space in []
    const matchDone = line.match(/^\s*[-*+]\s+\[x\]\s*(.*)/i);
    const matchTodo = line.match(/^\s*[-*+]\s+\[ *\]\s*(.*)/);
    if (matchDone) { items.push({ text: matchDone[1].trim(), checked: true }); checked++; }
    else if (matchTodo) { items.push({ text: matchTodo[1].trim(), checked: false }); }
  }
  return { items, checked, total: items.length };
}

/* ─── Main Dashboard Component ─── */
export default function Dashboard() {
  const [todayFiles, setTodayFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [streak, setStreak] = useState(1);
  const [dailyCompletion, setDailyCompletion] = useState({});
  const [fireDays, setFireDays] = useState({});
  const [fireBtnClicked, setFireBtnClicked] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.readAllFiles();
        setTodayFiles(data.today || []);
      } catch (e) {
        console.error('Dashboard load error', e);
      } finally {
        setLoading(false);
      }
      trackEvent('dashboard_view');
    };
    load();

    // Load fire days
    try {
      const rawFire = localStorage.getItem('ms_fire_days');
      if (rawFire) setFireDays(JSON.parse(rawFire));
    } catch { }
  }, []);

  // Compute real streak from localStorage
  useEffect(() => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const raw = localStorage.getItem('ms_streak_data');
      let data = raw ? JSON.parse(raw) : null;

      if (!data) {
        data = { lastDate: today, count: 1 };
      } else {
        const diffMs = new Date(today) - new Date(data.lastDate);
        const diff = Math.round(diffMs / 86400000);
        if (diff === 0) {
          // same day — use stored count
        } else if (diff === 1) {
          data = { lastDate: today, count: data.count + 1 };
        } else {
          data = { lastDate: today, count: 1 };
        }
      }

      localStorage.setItem('ms_streak_data', JSON.stringify(data));
      setStreak(data.count);
    } catch { setStreak(1); }
  }, []);

  // Compute overall stats
  const stats = useMemo(() => {
    let totalChecked = 0, totalItems = 0;
    const enriched = todayFiles.map(f => {
      const { items, checked, total } = parseChecklist(f.content);
      totalChecked += checked;
      totalItems += total;
      return { ...f, items, checked, total };
    });
    const pct = totalItems > 0 ? Math.round((totalChecked / totalItems) * 100) : 0;
    return { enriched, totalChecked, totalItems, pct };
  }, [todayFiles]);

  // Update daily completion in localStorage when stats are ready
  useEffect(() => {
    if (loading) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      const raw = localStorage.getItem('ms_daily_completion');
      const data = raw ? JSON.parse(raw) : {};
      data[today] = stats.pct;
      localStorage.setItem('ms_daily_completion', JSON.stringify(data));
      setDailyCompletion(data);
    } catch { }
  }, [stats.pct, loading]);

  return (
    <div className="dashboard-container fade-in">
      {loading ? (
        <div className="skeleton-loader">Loading dashboard...</div>
      ) : (
        <div className="dashboard-grid">
          {/* ── Left Column ── */}
          <div className="dashboard-left">
            <div className="ds-stats-bar">
              <div className="ds-stat-chip">
                <span className="ds-stat-num">{stats.totalItems}</span>
                <span className="ds-stat-label">Total Tasks</span>
              </div>
              <div className="ds-stat-chip">
                <span className="ds-stat-num">{stats.totalChecked}</span>
                <span className="ds-stat-label">Completed</span>
              </div>
              <div className="ds-stat-chip">
                <span className="ds-stat-num">{stats.totalItems - stats.totalChecked}</span>
                <span className="ds-stat-label">Remaining</span>
              </div>
            </div>

            {/* 🔥 완료 button — visible when 5+ tasks checked */}
            {stats.totalChecked >= 5 && (() => {
              const todayStr = new Date().toISOString().split('T')[0];
              const alreadyFired = fireDays[todayStr];
              return (
                <button
                  className={`ds-fire-btn ${alreadyFired ? 'fired' : ''}`}
                  onClick={() => {
                    if (alreadyFired) return;
                    const updated = { ...fireDays, [todayStr]: true };
                    setFireDays(updated);
                    localStorage.setItem('ms_fire_days', JSON.stringify(updated));
                    setFireBtnClicked(true);
                    setTimeout(() => setFireBtnClicked(false), 2000);
                    trackEvent('fire_complete');
                  }}
                >
                  {alreadyFired ? (
                    <>
                      <CheckCircle2 size={18} className="fire-icon-done" /> Today Marked!
                    </>
                  ) : fireBtnClicked ? (
                    <>
                      <Flame size={18} className="fire-icon animate-pulse" /> Marking...
                    </>
                  ) : (
                    <>
                      <Flame size={18} className="fire-icon" /> Mark Today Complete
                    </>
                  )}
                </button>

              );
            })()}

            <div className="ds-section-label">
              <TrendingUp size={15} />
              Today's Tasks
            </div>
            {stats.enriched.length === 0 ? (
              <div className="glass-card ds-empty">
                <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🌅</div>
                <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Your slate is clean!
                </p>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Add tasks for tomorrow in the <strong>Files → Tomorrow</strong> tab and they'll show up here.
                </p>
              </div>
            ) : (
              stats.enriched.map((f, i) => (
                <TaskSummaryCard
                  key={i}
                  file={f}
                  checked={f.checked}
                  total={f.total}
                />
              ))
            )}
          </div>

          {/* ── Right Column ── */}
          <div className="dashboard-right">
            {/* Donut */}
            <div className="glass-card ds-widget donut-card">
              <p className="ds-widget-title">Today's Progress</p>
              <DonutChart
                percent={stats.pct}
                label={`${stats.totalChecked} of ${stats.totalItems} tasks done`}
              />
            </div>

            {/* Consistency + This Week */}
            <div className="glass-card ds-widget">
              <p className="ds-widget-title" style={{ marginBottom: '16px' }}>Consistency · This Week</p>
              <WeeklyConsistency streak={streak} fireDays={fireDays} />
            </div>

            {/* Daily Quote */}
            <div className="glass-card ds-widget">
              <p className="ds-widget-title">Daily Inspiration</p>
              <QuoteWidget />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
