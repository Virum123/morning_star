import { useState, useEffect, useCallback } from 'react';
import { Calendar, LayoutGrid, CalendarDays, Star } from 'lucide-react';
import { getScheduleCompletionDays, getSchedules, saveScheduleCompletionDays } from '../services/scheduleService';
import { t } from '../utils/i18n';
import { buildCompletedDateFireDays } from '../utils/plannerData';
import DailyPlanner from './DailyPlanner';
import WeeklyPlanner from './WeeklyPlanner';
import MonthlyPlanner from './MonthlyPlanner';
import './Planner.css';

export default function Planner({ lang = 'ko', refreshSignal = 0 }) {
  const [activeView, setActiveView] = useState('daily'); // 'daily', 'weekly', 'monthly'
  const [targetDateStr, setTargetDateStr] = useState(null);
  const [freqTrigger, setFreqTrigger] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filesData, setFilesData] = useState({ tomorrow: [], today: [], byDate: {}, yesterday: {} });
  const [streak, setStreak] = useState(0);
  const [fireDays, setFireDays] = useState({});

  function calculateStreakFromFireDays(fireDaysObj = {}) {
    const markedDays = Object.keys(fireDaysObj).filter(k => fireDaysObj[k]).sort();
    if (markedDays.length === 0) return 0;
    let streakCount = 1;
    for (let index = markedDays.length - 1; index > 0; index -= 1) {
      const currentDate = new Date(markedDays[index]);
      const previousDate = new Date(markedDays[index - 1]);
      const diff = Math.round((currentDate - previousDate) / 86400000);
      if (diff !== 1) break;
      streakCount += 1;
    }
    return streakCount;
  }

  const loadContent = useCallback(async () => {
    setLoading(true);
    try {
      const files = await getSchedules();
      setFilesData(files);
      const parsedFireDays = getScheduleCompletionDays();
      const completedFireDays = buildCompletedDateFireDays(files);
      const nextFireDays = { ...parsedFireDays, ...completedFireDays };
      if (Object.keys(completedFireDays).some((dateStr) => !parsedFireDays[dateStr])) {
        saveScheduleCompletionDays(nextFireDays);
      }
      setFireDays(nextFireDays);
      setStreak(calculateStreakFromFireDays(nextFireDays));
    } catch (e) {
      console.error('Failed to load planner data.', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Silent refresh: syncs filesData without triggering loading state (preserves scroll)
  const silentRefresh = useCallback(async () => {
    try {
      const files = await getSchedules();
      setFilesData(files);
    } catch (e) {
      console.error('Failed to silently refresh planner data.', e);
    }
  }, []);

  useEffect(() => {
    loadContent();
  }, [loadContent, refreshSignal]);

  useEffect(() => {
    if (loading) return;

    const completedFireDays = buildCompletedDateFireDays(filesData);
    const hasNewCompletedDay = Object.keys(completedFireDays).some((dateStr) => !fireDays[dateStr]);
    if (!hasNewCompletedDay) return;

    const nextFireDays = { ...fireDays, ...completedFireDays };
    setFireDays(nextFireDays);
    setStreak(calculateStreakFromFireDays(nextFireDays));
    saveScheduleCompletionDays(nextFireDays);
  }, [filesData, fireDays, loading]);

  const handleJumpToDaily = (dateStr) => {
    setTargetDateStr(dateStr);
    setActiveView('daily');
  };

  return (
    <div className="planner-container fade-in">
      <div className="planner-view-tabs glass-card">
        <button
          className={`view-tab-btn ${activeView === 'daily' ? 'active' : ''}`}
          onClick={() => setActiveView('daily')}
        >
          <CalendarDays size={18} /> {t(lang, 'daily')}
        </button>
        <button
          className={`view-tab-btn ${activeView === 'weekly' ? 'active' : ''}`}
          onClick={() => setActiveView('weekly')}
        >
          <LayoutGrid size={18} /> {t(lang, 'weekly')}
        </button>
        <button
          className={`view-tab-btn ${activeView === 'monthly' ? 'active' : ''}`}
          onClick={() => setActiveView('monthly')}
        >
          <Calendar size={18} /> {t(lang, 'monthly')}
        </button>
        {activeView !== 'monthly' && (
          <button className="freq-tasks-trigger-btn tab-row-freq-btn" onClick={() => setFreqTrigger(n => n + 1)}>
            <Star size={15} />
            {t(lang, 'frequentTasks')}
          </button>
        )}
      </div>

      <div className="planner-view-content">
        {activeView === 'daily' && (
          <DailyPlanner
            lang={lang}
            loading={loading}
            filesData={filesData}
            setFilesData={setFilesData}
            streak={streak}
            setStreak={setStreak}
            fireDays={fireDays}
            setFireDays={setFireDays}
            loadContent={loadContent}
            targetDateStr={targetDateStr}
            freqTrigger={freqTrigger}
          />
        )}
        {activeView === 'weekly' && (
          <WeeklyPlanner
            lang={lang}
            loading={loading}
            filesData={filesData}
            setFilesData={setFilesData}
            loadContent={loadContent}
            silentRefresh={silentRefresh}
            freqTrigger={freqTrigger}
          />
        )}
        {activeView === 'monthly' && (
          <MonthlyPlanner 
            lang={lang} 
            loading={loading}
            filesData={filesData}
            fireDays={fireDays}
            loadContent={loadContent}
            onJumpToDaily={handleJumpToDaily}
          />
        )}
      </div>
    </div>
  );
}
