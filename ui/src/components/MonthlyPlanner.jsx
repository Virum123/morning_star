import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { t } from '../utils/i18n';
import { appTodayDate, localDateStr } from '../utils/date';
import { getFilesForDate, parseChecklist } from '../utils/plannerData';
import './Planner.css';

export default function MonthlyPlanner({ filesData, loading, fireDays, lang = 'ko', onJumpToDaily }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const todayDate = appTodayDate();
  const todayStr = localDateStr(todayDate);
  const tomorrowDate = new Date(todayDate);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = localDateStr(tomorrowDate);

  const calendarDays = useMemo(() => {
    const dateContext = { todayStr, tomorrowStr };
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // Day of week (0=Sun, 1=Mon, etc.)
    let startOffset = firstDay.getDay() - 1; 
    if (startOffset === -1) startOffset = 6; // Make Monday the first day
    
    const days = [];
    
    // Previous month padding
    for (let i = 0; i < startOffset; i++) {
      const d = new Date(year, month, -startOffset + i + 1);
      days.push({ dateObj: d, dateStr: localDateStr(d), isCurrentMonth: false });
    }
    
    // Current month days
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const d = new Date(year, month, i);
      days.push({ dateObj: d, dateStr: localDateStr(d), isCurrentMonth: true });
    }
    
    // Next month padding (to fill the grid to 42 cells)
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      days.push({ dateObj: d, dateStr: localDateStr(d), isCurrentMonth: false });
    }
    
    return days.map(day => {
      const files = getFilesForDate(day.dateStr, filesData, dateContext);
      
      const tasks = [];
      files.forEach(f => {
        const { items } = parseChecklist(f.content);
        items.forEach(item => tasks.push(item));
      });
      
      return { ...day, tasks, isToday: day.dateStr === todayStr, isFire: fireDays[day.dateStr] };
    });
  }, [currentMonth, filesData, todayStr, tomorrowStr, fireDays]);

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  if (loading) {
    return <div className="skeleton-loader" style={{ padding: '20px' }}>{t(lang, 'loadingTasks')}</div>;
  }

  return (
    <div className="monthly-planner-container glass-card">
      <div className="monthly-header">
        <button className="icon-btn" onClick={prevMonth}><ChevronLeft size={20} /></button>
        <h2>{currentMonth.getFullYear()} - {t(lang, 'monthNames')[currentMonth.getMonth()]}</h2>
        <button className="icon-btn" onClick={nextMonth}><ChevronRight size={20} /></button>
      </div>
      
      <div className="monthly-grid">
        {t(lang, 'shortDays').map(day => (
          <div key={day} className="m-day-header">{day}</div>
        ))}
        
        {calendarDays.map((day, idx) => (
          <div 
            key={idx} 
            className={`m-day-cell ${day.isCurrentMonth ? '' : 'other-month'} ${day.isToday ? 'today' : ''}`}
            onClick={() => onJumpToDaily && onJumpToDaily(day.dateStr)}
            style={{ cursor: 'pointer' }}
          >
            <div className="m-date-num">
              {day.dateObj.getDate()}
              {day.isFire && <span className="m-fire-dot">🔥</span>}
            </div>
            <div className="m-task-preview">
              {day.tasks.slice(0, 3).map((t, i) => (
                <div key={i} className={`m-preview-item ${t.checked ? 'checked' : ''}`}>
                  {t.text}
                </div>
              ))}
              {day.tasks.length > 3 && (
                <div className="m-preview-more">+{day.tasks.length - 3} {t(lang, 'moreLabel')}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
