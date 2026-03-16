import { useState, useEffect, useMemo } from 'react';
import { Flame, CheckCircle2, Circle, TrendingUp, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { api } from '../utils/api';
import { trackEvent } from '../utils/analytics';
import './Dashboard.css';

/* ─── Donut Chart (SVG, no library) ─── */
function DonutChart({ percent, size = 140, strokeWidth = 14, label }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  return (
    <div className="donut-wrapper">
      <svg width={size} height={size} className="donut-svg">
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--divider)" strokeWidth={strokeWidth}/>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="url(#donutGrad)"
          strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          transform={`rotate(-90 ${size/2} ${size/2})`} className="donut-progress"/>
        <defs>
          <linearGradient id="donutGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--accent-color)" stopOpacity="0.9"/>
            <stop offset="100%" stopColor="var(--card-stripe)"/>
          </linearGradient>
        </defs>
        <text x="50%" y="46%" dominantBaseline="middle" textAnchor="middle" className="donut-pct">{percent}%</text>
        <text x="50%" y="62%" dominantBaseline="middle" textAnchor="middle" className="donut-sub">done</text>
      </svg>
      {label && <p className="donut-label">{label}</p>}
    </div>
  );
}

/* ─── Streak Calendar Modal ─── */
function StreakCalendar({ fireDays, onClose }) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // Mon=0
  const todayStr = now.toISOString().split('T')[0];
  const pad = n => String(n).padStart(2, '0');

  const monthFireCount = Object.keys(fireDays).filter(d => {
    const [y, m] = d.split('-').map(Number);
    return y === viewYear && m === viewMonth + 1;
  }).length;
  const totalFireCount = Object.keys(fireDays).length;

  const prevMonth = () => viewMonth === 0
    ? (setViewYear(y => y - 1), setViewMonth(11))
    : setViewMonth(m => m - 1);
  const nextMonth = () => viewMonth === 11
    ? (setViewYear(y => y + 1), setViewMonth(0))
    : setViewMonth(m => m + 1);

  const monthLabel = new Date(viewYear, viewMonth, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const cells = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="cal-overlay" onClick={onClose}>
      <div className="cal-modal glass-card" onClick={e => e.stopPropagation()}>

        <div className="cal-header">
          <button className="cal-nav" onClick={prevMonth}><ChevronLeft size={16}/></button>
          <div className="cal-title-area">
            <span className="cal-month-label">{monthLabel}</span>
            <span className="cal-fire-stat">
              🔥 {monthFireCount} this month &nbsp;·&nbsp; {totalFireCount} total
            </span>
          </div>
          <button className="cal-nav" onClick={nextMonth}><ChevronRight size={16}/></button>
          <button className="cal-close-btn" onClick={onClose}><X size={15}/></button>
        </div>

        <div className="cal-weekdays">
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
            <span key={d} className="cal-wd">{d}</span>
          ))}
        </div>

        <div className="cal-grid">
          {cells.map((day, i) => {
            if (!day) return <div key={i} className="cal-cell empty"/>;
            const dateStr = `${viewYear}-${pad(viewMonth+1)}-${pad(day)}`;
            const isFire   = !!fireDays[dateStr];
            const isToday  = dateStr === todayStr;
            const isFuture = dateStr > todayStr;
            return (
              <div key={i} className={`cal-cell${isFire?' fire':''}${isToday?' today':''}${isFuture?' future':''}`}>
                {isFire ? '🔥' : day}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}

/* ─── Streak Widget (streak count + this week) ─── */
function StreakWidget({ streak, fireDays = {} }) {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));

  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  const monthLabel = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="streak-widget">
      <div className="streak-top">
        <Flame size={22} className="streak-icon"/>
        <div>
          <div className="streak-count">{streak}</div>
          <div className="streak-desc">day streak</div>
        </div>
      </div>

      <div className="week-month-row">
        <span className="week-month-label">{monthLabel}</span>
      </div>

      <div className="week-days">
        {week.map((d, i) => {
          const isToday   = d.toDateString() === today.toDateString();
          const isWeekend = i >= 5;
          const dateStr   = d.toISOString().split('T')[0];
          const hasFire   = fireDays[dateStr];
          return (
            <div key={i} className={`week-day${isToday?' today':''}${isWeekend?' weekend':''}${hasFire?' fire-day':''}`}>
              <span className="wd-name">{dayNames[i]}</span>
              {hasFire
                ? <div className="wd-fire"><Flame size={18} color="#ff6a00" fill="#ff6a00" strokeWidth={1.5}/></div>
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

/* ─── Task Summary Card ─── */
function TaskSummaryCard({ file, checked, total }) {
  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
  return (
    <div className="ds-task-card glass-card">
      <div className="ds-task-header">
        <span className="ds-task-filename">{file.filename}</span>
        <span className="ds-task-count">{checked}/{total}</span>
      </div>
      <div className="ds-progress-bar-track">
        <div className="ds-progress-bar-fill" style={{ width: `${pct}%` }}/>
      </div>
      <ul className="ds-task-items">
        {file.items?.slice(0, 5).map((item, i) => (
          <li key={i} className={`ds-task-item ${item.checked ? 'checked' : ''}`}>
            {item.checked
              ? <CheckCircle2 size={14} className="ds-check-icon done"/>
              : <Circle size={14} className="ds-check-icon"/>}
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
  if (!content) return { items: [], checked: 0, total: 0 };
  const lines = content.split('\n');
  const items = [];
  let checked = 0;
  for (const line of lines) {
    const matchDone = line.match(/^\s*[-*+]\s+\[x\]\s*(.*)/i);
    const matchTodo = line.match(/^\s*[-*+]\s+\[ *\]\s*(.*)/);
    if (matchDone) { items.push({ text: matchDone[1].trim(), checked: true }); checked++; }
    else if (matchTodo) { items.push({ text: matchTodo[1].trim(), checked: false }); }
  }
  return { items, checked, total: items.length };
}

/* ─── Main Dashboard Component ─── */
export default function Dashboard() {
  const [todayFiles, setTodayFiles]     = useState([]);
  const [loading, setLoading]           = useState(true);
  const [streak, setStreak]             = useState(1);
  const [fireDays, setFireDays]         = useState({});
  const [fireBtnClicked, setFireBtnClicked] = useState(false);
  const [isCalOpen, setIsCalOpen]       = useState(false);

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
    try {
      const rawFire = localStorage.getItem('ms_fire_days');
      if (rawFire) setFireDays(JSON.parse(rawFire));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const raw  = localStorage.getItem('ms_streak_data');
      let data   = raw ? JSON.parse(raw) : null;
      if (!data) {
        data = { lastDate: today, count: 1 };
      } else {
        const diff = Math.round((new Date(today) - new Date(data.lastDate)) / 86400000);
        if (diff === 1)      data = { lastDate: today, count: data.count + 1 };
        else if (diff > 1)   data = { lastDate: today, count: 1 };
      }
      localStorage.setItem('ms_streak_data', JSON.stringify(data));
      setStreak(data.count);
    } catch { setStreak(1); }
  }, []);

  const stats = useMemo(() => {
    let totalChecked = 0, totalItems = 0;
    const enriched = todayFiles.map(f => {
      const { items, checked, total } = parseChecklist(f.content);
      totalChecked += checked;
      totalItems   += total;
      return { ...f, items, checked, total };
    });
    const pct = totalItems > 0 ? Math.round((totalChecked / totalItems) * 100) : 0;
    return { enriched, totalChecked, totalItems, pct };
  }, [todayFiles]);

  useEffect(() => {
    if (loading) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      const raw   = localStorage.getItem('ms_daily_completion');
      const data  = raw ? JSON.parse(raw) : {};
      data[today] = stats.pct;
      localStorage.setItem('ms_daily_completion', JSON.stringify(data));
    } catch {}
  }, [stats.pct, loading]);

  const markFire = (eventName) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const updated  = { ...fireDays, [todayStr]: true };
    setFireDays(updated);
    localStorage.setItem('ms_fire_days', JSON.stringify(updated));
    trackEvent(eventName);
  };

  const todayStr    = new Date().toISOString().split('T')[0];
  const alreadyFired = fireDays[todayStr];

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

            {/* 일정이 없을 때: 오늘 일정 없음 버튼 */}
            {stats.totalItems === 0 && (
              <button
                className={`ds-fire-btn no-tasks-btn ${alreadyFired ? 'fired' : ''}`}
                onClick={() => { if (!alreadyFired) markFire('no_task_fire'); }}
              >
                {alreadyFired
                  ? <><CheckCircle2 size={18} className="fire-icon-done"/> 오늘 완료! 🔥</>
                  : <><Flame size={18} className="fire-icon"/> 오늘 일정 없음</>
                }
              </button>
            )}

            {/* 일정이 있고 5개 이상 완료 시: Mark Today Complete */}
            {stats.totalItems > 0 && stats.totalChecked >= 5 && (
              <button
                className={`ds-fire-btn ${alreadyFired ? 'fired' : ''}`}
                onClick={() => {
                  if (alreadyFired) return;
                  setFireBtnClicked(true);
                  setTimeout(() => setFireBtnClicked(false), 2000);
                  markFire('fire_complete');
                }}
              >
                {alreadyFired
                  ? <><CheckCircle2 size={18} className="fire-icon-done"/> Today Marked!</>
                  : fireBtnClicked
                    ? <><Flame size={18} className="fire-icon animate-pulse"/> Marking...</>
                    : <><Flame size={18} className="fire-icon"/> Mark Today Complete</>
                }
              </button>
            )}

            <div className="ds-section-label">
              <TrendingUp size={15}/>
              Today's Tasks
            </div>

            {stats.enriched.length === 0 ? (
              <div className="glass-card ds-empty">
                <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🌅</div>
                <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Your slate is clean!
                </p>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Add tasks for tomorrow in the <strong>Files → Tomorrow</strong> tab.
                </p>
              </div>
            ) : (
              stats.enriched.map((f, i) => (
                <TaskSummaryCard key={i} file={f} checked={f.checked} total={f.total}/>
              ))
            )}
          </div>

          {/* ── Right Column ── */}
          <div className="dashboard-right">
            <div className="glass-card ds-widget donut-card">
              <p className="ds-widget-title">Today's Progress</p>
              <DonutChart
                percent={stats.pct}
                label={`${stats.totalChecked} of ${stats.totalItems} tasks done`}
              />
            </div>

            {/* Streak (formerly: Consistency + This Week) */}
            <div className="glass-card ds-widget">
              <div className="ds-widget-title-row">
                <p className="ds-widget-title">Streak</p>
                <button className="cal-open-btn" onClick={() => setIsCalOpen(true)} title="View full history">+</button>
              </div>
              <StreakWidget streak={streak} fireDays={fireDays}/>
            </div>

            <div className="glass-card ds-widget">
              <p className="ds-widget-title">Daily Inspiration</p>
              <QuoteWidget/>
            </div>
          </div>

        </div>
      )}

      {/* Calendar modal */}
      {isCalOpen && (
        <StreakCalendar fireDays={fireDays} onClose={() => setIsCalOpen(false)}/>
      )}
    </div>
  );
}
