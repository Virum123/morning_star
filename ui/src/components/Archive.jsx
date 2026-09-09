import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Circle, PenLine, Save } from 'lucide-react';
import {
  DAILY_REFLECTION_MAX_LENGTH,
  getDailyReflections,
  saveDailyReflection,
} from '../services/dailyReflectionService';
import { getSchedules } from '../services/scheduleService';
import { t } from '../utils/i18n';
import { localDateFromStr } from '../utils/date';
import { buildDateSummaries, getAppDateContext, getByDateFiles } from '../utils/plannerData';
import './Archive.css';

export default function Archive({ lang = 'ko', refreshSignal = 0 }) {
  const { todayStr: appTodayStr, tomorrowStr: appTomorrowStr } = getAppDateContext();
  const [filesData, setFilesData] = useState({ byDate: {}, yesterday: {} });
  const [dailyReflections, setDailyReflections] = useState({});
  const [selectedReflectionDate, setSelectedReflectionDate] = useState(appTodayStr);
  const [reflectionDrafts, setReflectionDrafts] = useState({});
  const [reflectionEditingDates, setReflectionEditingDates] = useState({});
  const [reflectionSaveState, setReflectionSaveState] = useState('idle');
  const [reflectionLoadError, setReflectionLoadError] = useState(false);
  const [archiveLoadError, setArchiveLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedDates, setExpandedDates] = useState({});
  const previousAppDateRef = useRef(appTodayStr);
  const reflectionDataVersionRef = useRef(0);
  const reflectionSavingRef = useRef(false);
  const reflectionEditorRef = useRef(null);

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
      const [filesResult, reflectionResult] = await Promise.allSettled([
        getSchedules(),
        getDailyReflections(),
      ]);
      if (filesResult.status === 'fulfilled') {
        setFilesData(filesResult.value || { byDate: {}, yesterday: {} });
      } else {
        console.error('Failed to load archived schedules.', filesResult.reason);
      }
      setArchiveLoadError(filesResult.status === 'rejected');
      if (reflectionDataVersion === reflectionDataVersionRef.current) {
        if (reflectionResult.status === 'rejected') {
          console.error('Failed to load daily reflections.', reflectionResult.reason);
          setReflectionLoadError(true);
        } else {
          setDailyReflections(reflectionResult.value);
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

  const dateSummaries = useMemo(() => {
    const byDate = Object.fromEntries(Object.entries(getByDateFiles(filesData))
      .filter(([, files]) => files?.length > 0));
    if (filesData.today?.length) byDate[appTodayStr] = filesData.today;
    if (filesData.tomorrow?.length) byDate[appTomorrowStr] = filesData.tomorrow;
    Object.keys(dailyReflections).forEach((date) => {
      if (!byDate[date]) byDate[date] = [];
    });
    return buildDateSummaries({ byDate }, {
      todayDate: localDateFromStr(appTodayStr),
      todayStr: appTodayStr,
      tomorrowStr: appTomorrowStr,
    });
  }, [appTodayStr, appTomorrowStr, dailyReflections, filesData]);
  const savedReflection = dailyReflections[selectedReflectionDate] || '';
  const reflectionDraft = reflectionDrafts[selectedReflectionDate] ?? '';
  const reflectionIsEditing = Boolean(reflectionEditingDates[selectedReflectionDate]);
  const reflectionNeedsEdit = Boolean(savedReflection) && !reflectionIsEditing;
  const reflectionIsDirty = reflectionIsEditing
    ? reflectionDraft !== savedReflection
    : Boolean(reflectionDraft.trim());
  const editReflection = (date) => {
    if (reflectionSavingRef.current) return;
    setSelectedReflectionDate(date);
    setReflectionDrafts((currentDrafts) => ({
      ...currentDrafts,
      [date]: currentDrafts[date] ?? dailyReflections[date],
    }));
    setReflectionEditingDates((currentDates) => ({ ...currentDates, [date]: true }));
    setReflectionSaveState('idle');
    reflectionEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    reflectionEditorRef.current?.focus();
  };

  const startReflection = (date) => {
    if (reflectionSavingRef.current || date > appTodayStr) return;
    setSelectedReflectionDate(date);
    setReflectionSaveState('idle');
    reflectionEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    reflectionEditorRef.current?.focus();
  };

  const clearReflectionDraft = (date) => {
    setReflectionDrafts((currentDrafts) => {
      const nextDrafts = { ...currentDrafts };
      delete nextDrafts[date];
      return nextDrafts;
    });
    setReflectionEditingDates((currentDates) => {
      const nextDates = { ...currentDates };
      delete nextDates[date];
      return nextDates;
    });
  };

  const saveReflection = async (event) => {
    event.preventDefault();
    if (!reflectionIsDirty || reflectionNeedsEdit || reflectionLoadError || reflectionSavingRef.current) return;

    reflectionSavingRef.current = true;
    setReflectionSaveState('saving');
    reflectionDataVersionRef.current += 1;
    const reflectionDate = selectedReflectionDate;
    const reflectionContent = reflectionDraft;
    try {
      const savedContent = await saveDailyReflection(reflectionDate, reflectionContent, {
        createOnly: !reflectionIsEditing,
      });
      setDailyReflections((currentReflections) => {
        const nextReflections = { ...currentReflections };
        if (savedContent === null) {
          delete nextReflections[reflectionDate];
        } else {
          nextReflections[reflectionDate] = savedContent;
        }
        return nextReflections;
      });
      clearReflectionDraft(reflectionDate);
      setExpandedDates((currentDates) => ({ ...currentDates, [reflectionDate]: true }));
      reflectionDataVersionRef.current += 1;
      setReflectionSaveState(reflectionContent.trim() ? 'saved' : 'deleted');
    } catch (error) {
      reflectionDataVersionRef.current += 1;
      console.error('Failed to save daily reflection.', error);
      if (error.code === '23505') {
        try {
          setDailyReflections(await getDailyReflections());
          setExpandedDates((currentDates) => ({ ...currentDates, [reflectionDate]: true }));
          setReflectionLoadError(false);
        } catch {
          setReflectionLoadError(true);
        }
        setReflectionSaveState('conflict');
      } else {
        setReflectionSaveState('error');
      }
    } finally {
      reflectionSavingRef.current = false;
    }
  };

  const reflectionStatus = reflectionSaveState === 'saved'
    ? t(lang, 'dailyReflectionSaved')
    : reflectionSaveState === 'deleted'
      ? t(lang, 'dailyReflectionDeleted')
      : reflectionSaveState === 'conflict'
        ? t(lang, 'dailyReflectionConflict')
        : reflectionSaveState === 'error'
          ? t(lang, 'dailyReflectionSaveError')
          : reflectionLoadError
            ? t(lang, 'dailyReflectionLoadError')
            : '';

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
      </div>
    );
  };

  const renderDateReflection = (date) => {
    const content = dailyReflections[date];
    const canWrite = date <= appTodayStr;
    return (
      <section className="daily-reflection-entry" aria-labelledby={`reflection-title-${date}`}>
        <div className="daily-reflection-entry-header">
          <h4 id={`reflection-title-${date}`}>{t(lang, 'dailyReflectionTitle')}</h4>
          {canWrite && (
            <button
              type="button"
              className="daily-reflection-secondary-btn"
              disabled={reflectionSaveState === 'saving' || reflectionLoadError}
              aria-label={`${date} ${t(lang, content ? 'dailyReflectionEdit' : 'dailyReflectionWrite')}`}
              onClick={() => content ? editReflection(date) : startReflection(date)}
            >
              <PenLine size={14} aria-hidden="true" />
              {t(lang, content ? 'dailyReflectionEdit' : 'dailyReflectionWrite')}
            </button>
          )}
        </div>
        {content ? (
          <p className="daily-reflection-content">{content}</p>
        ) : (
          <p className="daily-reflection-empty">
            {t(lang, reflectionLoadError ? 'dailyReflectionLoadError' : canWrite ? 'dailyReflectionMissing' : 'dailyReflectionUpcoming')}
          </p>
        )}
      </section>
    );
  };

  const renderSummaryAccordion = (summaries) => (
    <div className="accordion-list">
      {summaries.map(summary => (
        <div className="accordion-item" key={summary.dateStr} data-date={summary.dateStr}>
          <button
            type="button"
            className="accordion-header"
            onClick={() => toggleAccordion(summary.dateStr)}
            id={`archive-date-${summary.dateStr}`}
            aria-expanded={Boolean(expandedDates[summary.dateStr])}
            aria-controls={`archive-details-${summary.dateStr}`}
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
            <div className="accordion-body" id={`archive-details-${summary.dateStr}`} role="region" aria-labelledby={`archive-date-${summary.dateStr}`}>
              {renderDateReflection(summary.dateStr)}
              <h4 className="archive-section-title">{t(lang, 'archiveScheduleRecords')}</h4>
              {renderDateSummary(summary)}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="archive-container fade-in">
      <div className="glass-card files-list-card">
        {loading ? (
          <div className="skeleton-loader">{t(lang, 'loadingTasks')}</div>
        ) : (
          <div className="tab-content">
            {archiveLoadError && (
              <div className="archive-load-error daily-reflection-notice" role="alert">
                <span>{t(lang, 'archiveLoadError')}</span>
                <button type="button" className="daily-reflection-secondary-btn" onClick={loadFiles}>
                  {t(lang, 'archiveReload')}
                </button>
              </div>
            )}
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
                {reflectionNeedsEdit && (
                  <div className="daily-reflection-notice">
                    <span>{t(lang, 'dailyReflectionExists')}</span>
                    <button
                      type="button"
                      className="daily-reflection-secondary-btn"
                      disabled={reflectionSaveState === 'saving'}
                      onClick={() => editReflection(selectedReflectionDate)}
                    >
                      <PenLine size={14} aria-hidden="true" />
                      {t(lang, 'dailyReflectionEdit')}
                    </button>
                  </div>
                )}
                {reflectionIsEditing && (
                  <p className="daily-reflection-editing" id="daily-reflection-editing">
                    {selectedReflectionDate} · {t(lang, 'dailyReflectionEditing')}
                  </p>
                )}
                <textarea
                  ref={reflectionEditorRef}
                  className="daily-reflection-textarea"
                  value={reflectionDraft}
                  maxLength={DAILY_REFLECTION_MAX_LENGTH}
                  disabled={reflectionSaveState === 'saving'}
                  readOnly={reflectionNeedsEdit || reflectionLoadError}
                  placeholder={t(lang, reflectionNeedsEdit ? 'dailyReflectionExists' : 'dailyReflectionPlaceholder')}
                  aria-labelledby="daily-reflection-title"
                  aria-describedby={reflectionIsEditing ? 'daily-reflection-editing' : undefined}
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
                    className={`daily-reflection-status ${reflectionSaveState === 'error' || reflectionSaveState === 'conflict' || reflectionLoadError ? 'error' : ''}`}
                    role="status"
                    aria-live="polite"
                  >
                    {reflectionStatus}
                  </span>
                  {reflectionIsEditing && (
                    <button
                      type="button"
                      className="daily-reflection-secondary-btn"
                      disabled={reflectionSaveState === 'saving'}
                      onClick={() => {
                        clearReflectionDraft(selectedReflectionDate);
                        setReflectionSaveState('idle');
                      }}
                    >
                      {t(lang, 'dailyReflectionCancel')}
                    </button>
                  )}
                  <button
                    type="submit"
                    className="daily-reflection-save-btn"
                    disabled={!reflectionIsDirty || reflectionNeedsEdit || reflectionLoadError || reflectionSaveState === 'saving'}
                  >
                    <Save size={15} aria-hidden="true" />
                    {reflectionSaveState === 'saving'
                      ? t(lang, 'dailyReflectionSaving')
                      : reflectionIsEditing && !reflectionDraft.trim()
                        ? t(lang, 'dailyReflectionDelete')
                        : t(lang, reflectionIsEditing ? 'dailyReflectionUpdate' : 'dailyReflectionSave')}
                  </button>
                </div>
              </form>

              <section className="archive-date-history" aria-labelledby="archive-date-history-title">
                <h3 className="pane-title" id="archive-date-history-title">{t(lang, 'taskHistory')}</h3>
                <p className="pane-desc">{t(lang, 'taskHistoryDesc')}</p>
                {reflectionLoadError && (
                  <div className="daily-reflection-notice" role="alert">
                    <span>{t(lang, 'dailyReflectionLoadError')}</span>
                    <button type="button" className="daily-reflection-secondary-btn" onClick={loadFiles}>
                      {t(lang, 'dailyReflectionRetry')}
                    </button>
                  </div>
                )}
                {dateSummaries.length === 0 ? (
                  !archiveLoadError && !reflectionLoadError && <div className="empty-state-mini">{t(lang, 'noHistory')}</div>
                ) : renderSummaryAccordion(dateSummaries)}
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
