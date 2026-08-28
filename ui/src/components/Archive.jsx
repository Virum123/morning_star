import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, CalendarCheck, CheckCircle2, ChevronDown, ChevronUp, Circle, PenLine, Save, X } from 'lucide-react';
import {
  DAILY_REFLECTION_MAX_LENGTH,
  getDailyReflections,
  saveDailyReflection,
} from '../services/dailyReflectionService';
import { getScheduleActivityLog, getSchedules } from '../services/scheduleService';
import { t } from '../utils/i18n';
import { localDateFromStr, localDateStr } from '../utils/date';
import { buildDateSummaries, getAppDateContext, getByDateFiles } from '../utils/plannerData';
import './Archive.css';

export default function Archive({ lang = 'ko', refreshSignal = 0 }) {
  const { todayStr: appTodayStr, tomorrowStr: appTomorrowStr } = getAppDateContext();
  const [activeTab, setActiveTab] = useState('yesterday');
  const [filesData, setFilesData] = useState({ byDate: {}, yesterday: {} });
  const [activityLog, setActivityLog] = useState([]);
  const [dailyReflections, setDailyReflections] = useState({});
  const [selectedReflectionDate, setSelectedReflectionDate] = useState(appTodayStr);
  const [reflectionDrafts, setReflectionDrafts] = useState({});
  const [reflectionSaveState, setReflectionSaveState] = useState('idle');
  const [reflectionLoadError, setReflectionLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedDates, setExpandedDates] = useState({});
  const [selectedFile, setSelectedFile] = useState(null);
  const previewCloseRef = useRef(null);
  const previousAppDateRef = useRef(appTodayStr);
  const reflectionDataVersionRef = useRef(0);

  useEffect(() => {
    if (!selectedFile) return undefined;
    const previousFocus = document.activeElement;
    previewCloseRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setSelectedFile(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus?.();
    };
  }, [selectedFile]);

  useEffect(() => {
    const previousAppDate = previousAppDateRef.current;
    if (previousAppDate === appTodayStr) return;
    if (reflectionSaveState === 'saving') return;

    if (selectedReflectionDate === previousAppDate) {
      setSelectedReflectionDate(appTodayStr);
      setReflectionSaveState('idle');
    }
    previousAppDateRef.current = appTodayStr;
  }, [appTodayStr, reflectionSaveState, selectedReflectionDate]);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const reflectionDataVersion = reflectionDataVersionRef.current;
      const reflectionsRequest = getDailyReflections()
        .then((reflections) => ({ reflections }))
        .catch((error) => ({ error }));
      const [allFiles, log, reflectionResult] = await Promise.all([
        getSchedules(),
        getScheduleActivityLog(),
        reflectionsRequest,
      ]);
      setFilesData(allFiles || { byDate: {}, yesterday: {} });
      setActivityLog(log || []);
      if (reflectionDataVersion === reflectionDataVersionRef.current) {
        if (reflectionResult.error) {
          console.error('Failed to load daily reflections.', reflectionResult.error);
          setReflectionLoadError(true);
        } else {
          setDailyReflections(reflectionResult.reflections);
          setReflectionLoadError(false);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles, refreshSignal]);

  const toggleAccordion = (dateKey) => {
    setExpandedDates(prev => ({
      ...prev,
      [dateKey]: !prev[dateKey]
    }));
  };

  const formatDate = (dateString, isFullTime = true) => {
    const normalized = typeof dateString === 'string' ? dateString.replace(' ', 'T') : dateString;
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return dateString;
    if (isFullTime) {
      return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
    }
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
  };

  const openFilePreview = (file, sectionLabel) => {
    setSelectedFile({
      ...file,
      sectionLabel,
    });
  };

  const closeFilePreview = () => {
    setSelectedFile(null);
  };

  const byDateFiles = getByDateFiles(filesData);
  const dateSummaries = useMemo(() => buildDateSummaries(filesData, {
    todayDate: localDateFromStr(appTodayStr),
    todayStr: appTodayStr,
    tomorrowStr: appTomorrowStr,
  }), [appTodayStr, appTomorrowStr, filesData]);
  const pastSummaries = dateSummaries.filter((summary) => summary.dateStr < appTodayStr);
  const scheduledSummaries = dateSummaries.filter((summary) => summary.dateStr >= appTodayStr);
  const reviewStartDate = localDateFromStr(appTodayStr);
  reviewStartDate.setDate(reviewStartDate.getDate() - 7);
  const recentReviewSummaries = pastSummaries.filter((summary) => summary.dateStr >= localDateStr(reviewStartDate));
  const reviewStats = recentReviewSummaries.reduce((stats, summary) => ({
    days: stats.days + 1,
    total: stats.total + summary.total,
    checked: stats.checked + summary.checked,
    remaining: stats.remaining + summary.remaining,
  }), { days: 0, total: 0, checked: 0, remaining: 0 });
  const reviewCompletionRate = reviewStats.total > 0
    ? Math.round((reviewStats.checked / reviewStats.total) * 100)
    : 0;
  const savedReflection = dailyReflections[selectedReflectionDate] || '';
  const reflectionDraft = Object.prototype.hasOwnProperty.call(reflectionDrafts, selectedReflectionDate)
    ? reflectionDrafts[selectedReflectionDate]
    : savedReflection;
  const reflectionIsDirty = reflectionDraft !== savedReflection;

  const saveReflection = async (event) => {
    event.preventDefault();
    if (!reflectionIsDirty || reflectionSaveState === 'saving') return;

    setReflectionSaveState('saving');
    setReflectionLoadError(false);
    reflectionDataVersionRef.current += 1;
    const reflectionDate = selectedReflectionDate;
    const reflectionContent = reflectionDraft;
    try {
      const savedContent = await saveDailyReflection(reflectionDate, reflectionContent);
      setDailyReflections((currentReflections) => {
        const nextReflections = { ...currentReflections };
        if (savedContent === null) {
          delete nextReflections[reflectionDate];
        } else {
          nextReflections[reflectionDate] = savedContent;
        }
        return nextReflections;
      });
      setReflectionDrafts((currentDrafts) => {
        if (!Object.prototype.hasOwnProperty.call(currentDrafts, reflectionDate)) return currentDrafts;
        const nextDrafts = { ...currentDrafts };
        delete nextDrafts[reflectionDate];
        return nextDrafts;
      });
      reflectionDataVersionRef.current += 1;
      setReflectionSaveState(reflectionContent.trim() ? 'saved' : 'deleted');
    } catch (error) {
      reflectionDataVersionRef.current += 1;
      console.error('Failed to save daily reflection.', error);
      setReflectionSaveState('error');
    }
  };

  const reflectionStatus = reflectionSaveState === 'saved'
    ? t(lang, 'dailyReflectionSaved')
    : reflectionSaveState === 'deleted'
      ? t(lang, 'dailyReflectionDeleted')
      : reflectionSaveState === 'error'
        ? t(lang, 'dailyReflectionSaveError')
        : reflectionLoadError
          ? t(lang, 'dailyReflectionLoadError')
          : '';

  const renderFileList = (fileArray, target, dateKey = null) => {
    if (!fileArray || fileArray.length === 0) {
      return (
        <div className="empty-state-mini">
          <p>{t(lang, 'noFiles')}</p>
        </div>
      );
    }

    return (
      <div className="files-grid">
        {fileArray.map((file, idx) => (
          <div
            className="file-item"
            key={idx}
            onClick={() => openFilePreview(file, dateKey || target)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openFilePreview(file, dateKey || target);
              }
            }}
            role="button"
            tabIndex={0}
            title={t(lang, 'openFilePreview')}
          >
            <div className="file-info">
              <div className="file-date">
                <CalendarCheck size={14} />
                {formatDate(file.added_date)}
              </div>
              <div className="file-name">{file.filename}</div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderTaskRows = (items, type) => (
    <ul className="archive-task-list">
      {items.map((item) => (
        <li key={item.key} className="archive-task-row">
          {type === 'completed'
            ? <CheckCircle2 size={15} className="archive-task-icon done" />
            : <Circle size={15} className="archive-task-icon" />
          }
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );

  const renderDateSummary = (summary) => {
    const hasTasks = summary.total > 0;

    return (
      <div className="archive-date-summary">
        <div className="archive-summary-metrics">
          <span>{t(lang, 'archiveTotal')} {summary.total}</span>
          <span>{t(lang, 'archiveCompleted')} {summary.checked}</span>
          <span>{t(lang, 'archiveUnfinished')} {summary.remaining}</span>
          <span>{t(lang, 'archiveFiles')} {summary.files.length}</span>
        </div>

        {!hasTasks ? (
          <div className="empty-state-mini compact">{t(lang, 'archiveNoTasksForDate')}</div>
        ) : (
          <div className="archive-task-columns">
            {summary.unfinished.length > 0 && (
              <section className="archive-task-section">
                <h4>{t(lang, 'archiveUnfinished')}</h4>
                {renderTaskRows(summary.unfinished, 'unfinished')}
              </section>
            )}
            {summary.completed.length > 0 && (
              <section className="archive-task-section">
                <h4>{t(lang, 'archiveCompleted')}</h4>
                {renderTaskRows(summary.completed, 'completed')}
              </section>
            )}
          </div>
        )}

        <div className="archive-source-files">
          <h4>{t(lang, 'archiveSourceFiles')}</h4>
          {renderFileList(summary.files, 'byDate', summary.dateStr)}
        </div>
      </div>
    );
  };

  const renderActivityLog = () => {
    if (activityLog.length === 0) {
      return <div className="empty-state-mini">{t(lang, 'noActivityLog')}</div>;
    }

    return (
      <div className="activity-log-list">
        {activityLog.map((entry, idx) => (
          <div className="activity-log-row" key={`${entry.timestamp}-${entry.action}-${idx}`}>
            <div className="activity-log-icon">
              <Activity size={15} />
            </div>
            <div className="activity-log-copy">
              <strong>{entry.message}</strong>
              <span>{formatDate(entry.timestamp)} · {entry.action}</span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderSummaryAccordion = (summaries) => (
    <div className="accordion-list">
      {summaries.map(summary => (
        <div className="accordion-item" key={summary.dateStr}>
          <button
            type="button"
            className="accordion-header"
            onClick={() => toggleAccordion(summary.dateStr)}
            aria-expanded={Boolean(expandedDates[summary.dateStr])}
          >
            <div className="archive-accordion-title">
              <span className="accordion-title">{summary.dateStr}</span>
              <span className="archive-title-meta">
                {t(lang, 'archiveUnfinished')} {summary.remaining} · {t(lang, 'archiveCompleted')} {summary.checked}
              </span>
            </div>
            {expandedDates[summary.dateStr] ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          {expandedDates[summary.dateStr] && (
            <div className="accordion-body">
              {renderDateSummary(summary)}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="archive-container fade-in">
      <section className="review-overview glass-card">
        <div className="review-heading">
          <span>{t(lang, 'reviewPeriod')}</span>
          <h2>{t(lang, 'reviewTitle')}</h2>
          <p>{t(lang, 'reviewDesc')}</p>
        </div>
        <div className="review-summary-grid" aria-label={t(lang, 'reviewTitle')}>
          <div className="review-summary-card">
            <span>{t(lang, 'reviewDays')}</span>
            <strong>{reviewStats.days}</strong>
          </div>
          <div className="review-summary-card highlight">
            <span>{t(lang, 'reviewCompletionRate')}</span>
            <strong>{reviewCompletionRate}%</strong>
          </div>
          <div className="review-summary-card">
            <span>{t(lang, 'archiveCompleted')}</span>
            <strong>{reviewStats.checked}</strong>
          </div>
          <div className="review-summary-card">
            <span>{t(lang, 'archiveUnfinished')}</span>
            <strong>{reviewStats.remaining}</strong>
          </div>
        </div>
      </section>

      <div className="archive-tabs-nav">
        <button 
          type="button"
          className={`archive-tab-btn ${activeTab === 'yesterday' ? 'active' : ''}`}
          onClick={() => setActiveTab('yesterday')}
        >{t(lang, 'dailyReview')}</button>
        <button
          type="button"
          className={`archive-tab-btn ${activeTab === 'activity' ? 'active' : ''}`}
          onClick={() => setActiveTab('activity')}
        >{t(lang, 'operationLog')}</button>
      </div>

      <div className="glass-card files-list-card">
        {loading ? (
          <div className="skeleton-loader">{t(lang, 'loadingTasks')}</div>
        ) : (
          <div className="tab-content">
            {activeTab === 'yesterday' && (
              <div className="tab-pane fade-in">
                <form className="daily-reflection-editor" onSubmit={saveReflection}>
                  <div className="daily-reflection-header">
                    <div className="daily-reflection-heading">
                      <PenLine size={18} aria-hidden="true" />
                      <div>
                        <h3 id="daily-reflection-title">{t(lang, 'dailyReflectionTitle')}</h3>
                        <p>{t(lang, 'dailyReflectionDesc')}</p>
                      </div>
                    </div>
                    <label className="daily-reflection-date">
                      <span>{t(lang, 'dailyReflectionDate')}</span>
                      <input
                        type="date"
                        value={selectedReflectionDate}
                        max={appTodayStr}
                        required
                        disabled={reflectionSaveState === 'saving'}
                        onChange={(event) => {
                          setSelectedReflectionDate(event.target.value);
                          setReflectionSaveState('idle');
                        }}
                      />
                    </label>
                  </div>
                  <textarea
                    className="daily-reflection-textarea"
                    value={reflectionDraft}
                    maxLength={DAILY_REFLECTION_MAX_LENGTH}
                    disabled={reflectionSaveState === 'saving'}
                    placeholder={t(lang, 'dailyReflectionPlaceholder')}
                    aria-labelledby="daily-reflection-title"
                    onChange={(event) => {
                      setReflectionDrafts((currentDrafts) => ({
                        ...currentDrafts,
                        [selectedReflectionDate]: event.target.value,
                      }));
                      setReflectionSaveState('idle');
                    }}
                  />
                  <div className="daily-reflection-actions">
                    <span
                      className={`daily-reflection-status ${reflectionSaveState === 'error' || reflectionLoadError ? 'error' : ''}`}
                      role="status"
                      aria-live="polite"
                    >
                      {reflectionStatus}
                    </span>
                    <button
                      type="submit"
                      className="daily-reflection-save-btn"
                      disabled={!reflectionIsDirty || reflectionSaveState === 'saving'}
                    >
                      <Save size={15} aria-hidden="true" />
                      {reflectionSaveState === 'saving'
                        ? t(lang, 'dailyReflectionSaving')
                        : t(lang, 'dailyReflectionSave')}
                    </button>
                  </div>
                </form>

                <h3 className="pane-title">{t(lang, 'taskHistory')}</h3>
                <p className="pane-desc">{t(lang, 'taskHistoryDesc')}</p>
                
                {Object.keys(byDateFiles).length === 0 ? (
                  <div className="empty-state-mini">{t(lang, 'noHistory')}</div>
                ) : (
                  <div className="archive-summary-groups">
                    {pastSummaries.length > 0 && (
                      <section>
                        <h4 className="archive-section-title">{t(lang, 'pastTasks')}</h4>
                        {renderSummaryAccordion(pastSummaries)}
                      </section>
                    )}
                    {scheduledSummaries.length > 0 && (
                      <section>
                        <h4 className="archive-section-title">{t(lang, 'upcomingPlans')}</h4>
                        {renderSummaryAccordion(scheduledSummaries)}
                      </section>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'activity' && (
              <div className="tab-pane fade-in">
                <h3 className="pane-title">{t(lang, 'operationLog')}</h3>
                <p className="pane-desc">{t(lang, 'operationLogDesc')}</p>
                {renderActivityLog()}
              </div>
            )}
            
          </div>
        )}
      </div>

      {selectedFile && (
        <div className="modal-overlay files-modal-overlay fade-in" onClick={closeFilePreview}>
          <div className="modal-content glass-card file-preview-modal" role="dialog" aria-modal="true" aria-labelledby="file-preview-title" onClick={(e) => e.stopPropagation()}>
            <button ref={previewCloseRef} type="button" className="icon-btn close-modal-btn" onClick={closeFilePreview} aria-label={t(lang, 'closeDialog')}>
              <X size={20} />
            </button>
            <h2 id="file-preview-title" className="modal-title">{selectedFile.filename}</h2>
            <p className="file-preview-meta">
              {selectedFile.sectionLabel} · {formatDate(selectedFile.added_date)}
            </p>
            <pre className="file-preview-content">
              {selectedFile.content?.trim() || t(lang, 'emptyFile')}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
