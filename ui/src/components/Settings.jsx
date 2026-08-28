import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Save, Clock, RotateCcw } from 'lucide-react';
import { api } from '../utils/api';
import { trackEvent } from '../utils/analytics';
import { t } from '../utils/i18n';
import { AnalyticsConsentSettings } from './AnalyticsConsent';
import './Settings.css';

function normalizeConfig(configSnapshot) {
  const nextConfig = { ...(configSnapshot || {}) };

  if (!nextConfig.target_times || nextConfig.target_times.length === 0) {
    nextConfig.target_times = ['06:00'];
  }
  
  if (nextConfig.theme && !nextConfig.themeMode) {
    if (['purple', 'blue', 'green'].includes(nextConfig.theme)) {
      nextConfig.themeMode = 'dark';
      nextConfig.colorTheme = nextConfig.theme;
    } else {
      nextConfig.themeMode = nextConfig.theme;
      nextConfig.colorTheme = 'default';
    }
  }

  if (!nextConfig.themeMode) nextConfig.themeMode = 'light';
  if (!nextConfig.colorTheme) nextConfig.colorTheme = 'default';
  if (!nextConfig.language) nextConfig.language = 'ko';

  return nextConfig;
}

export default function Settings({ lang = 'ko', configSnapshot = null, onConfigSaved }) {
  const [config, setConfig] = useState(() => normalizeConfig(configSnapshot));
  const [nickname, setNickname] = useState(configSnapshot?.nickname || 'Alex');
  const [saving, setSaving] = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashItems, setTrashItems] = useState([]);

  const loadTrash = useCallback(async () => {
    try {
      const trashFiles = await api.readTrashFiles();
      setTrashItems(trashFiles || []);
    } catch {
      setTrashItems([]);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadInitialTrash = async () => {
      try {
        const trashFiles = await api.readTrashFiles();
        if (isMounted) {
          setTrashItems(trashFiles || []);
        }
      } catch {
        if (isMounted) {
          setTrashItems([]);
        }
      }
    };

    loadInitialTrash();
    return () => {
      isMounted = false;
    };
  }, []);

  const parseTime = (timeStr) => {
    if (!timeStr) return { hour12: 6, minute: '00', ampm: 'AM' };
    const [h, m] = timeStr.split(':');
    const hours = parseInt(h, 10);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return { hour12, minute: m, ampm };
  };

  const buildTime = (hour12, minute, ampm) => {
    let h = parseInt(hour12, 10);
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return `${h.toString().padStart(2, '0')}:${minute}`;
  };

  const updateTargetTime = (idx, updater) => {
    setConfig((currentConfig) => {
      const nextTimes = [...currentConfig.target_times];
      nextTimes[idx] = updater(nextTimes[idx]);
      return { ...currentConfig, target_times: nextTimes };
    });
  };

  const handleHourSelect = (idx, hour12) => {
    updateTargetTime(idx, (currentTime) => {
      const { minute, ampm } = parseTime(currentTime);
      return buildTime(hour12, minute, ampm);
    });
  };

  const handleMinuteSelect = (idx, minute) => {
    updateTargetTime(idx, (currentTime) => {
      const { hour12, ampm } = parseTime(currentTime);
      return buildTime(hour12, minute, ampm);
    });
  };

  const handleAmPmSelect = (idx, ampm) => {
    updateTargetTime(idx, (currentTime) => {
      const { hour12, minute } = parseTime(currentTime);
      return buildTime(hour12, minute, ampm);
    });
  };

  const handleClockClick = (idx) => {
    setEditingIdx((currentIdx) => (currentIdx === idx ? null : idx));
  };

  const handleThemeModeChange = (e) => {
    setConfig((currentConfig) => ({ ...currentConfig, themeMode: e.target.value }));
  };

  const handleColorThemeChange = (e) => {
    setConfig((currentConfig) => ({ ...currentConfig, colorTheme: e.target.value }));
  };

  const handleLanguageChange = (e) => {
    setConfig((currentConfig) => ({ ...currentConfig, language: e.target.value }));
  };

  const handleAddTime = () => {
    setConfig((currentConfig) => ({
      ...currentConfig,
      target_times: [...currentConfig.target_times, '07:00'],
    }));
  };

  const handleRemoveTime = (index) => {
    setConfig((currentConfig) => {
      const nextTimes = [...currentConfig.target_times];
      nextTimes.splice(index, 1);
      if (nextTimes.length === 0) nextTimes.push('06:00');
      return { ...currentConfig, target_times: nextTimes };
    });
    if (editingIdx === index) setEditingIdx(null);
  };

  const handleRestoreTrash = async (path) => {
    setTrashLoading(true);
    try {
      await api.restoreTrash(path);
      await onConfigSaved?.();
      await loadTrash();
    } finally {
      setTrashLoading(false);
    }
  };

  const handleEmptyTrash = async () => {
    setTrashLoading(true);
    try {
      await api.emptyTrash();
      await onConfigSaved?.();
      await loadTrash();
    } finally {
      setTrashLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setEditingIdx(null);

    const nextConfig = {
      target_times: config.target_times,
      themeMode: config.themeMode,
      colorTheme: config.colorTheme,
      language: config.language,
      nickname,
    };

    await api.saveConfig(nextConfig);
    trackEvent('settings_save', {
      target_time_count: config.target_times.length,
      theme_mode: config.themeMode,
      color_theme: config.colorTheme,
      app_language: config.language,
    });
    await onConfigSaved?.(nextConfig);
    setTimeout(() => setSaving(false), 600);
  };

  return (
    <div className="settings-container">
      <div className="settings-card glass-card">
        <form className="settings-form" onSubmit={handleSave}>
          <div className="form-section">
            <h3 className="section-title">{t(lang, 'profile')}</h3>
            <p className="section-desc">{t(lang, 'profileDesc')}</p>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="theme-select"
              style={{ backgroundImage: 'none' }}
              placeholder="Enter Nickname"
              required
            />
          </div>

          <div className="form-section">
            <h3 className="section-title">{t(lang, 'targetTimes')}</h3>
            <p className="section-desc">{t(lang, 'targetTimesDesc')}</p>
            <p className="section-note">{t(lang, 'dayResetNote')}</p>

            <div className="times-list">
              {config.target_times.map((time, idx) => {
                const { hour12, minute, ampm } = parseTime(time);
                const isEditing = editingIdx === idx;

                return (
                  <div className="time-row" key={idx}>
                    <div className={`time-input-wrapper ${isEditing ? 'editing' : ''}`}>
                      <button
                        type="button"
                        className={`time-icon-btn ${isEditing ? 'active' : ''}`}
                        onClick={() => handleClockClick(idx)}
                        title={isEditing ? 'Close editor' : 'Click to edit time'}
                      >
                        <Clock size={17} className="time-icon" />
                      </button>

                      {isEditing ? (
                        <div className="time-edit-controls">
                          <select
                            className="time-dropdown"
                            value={hour12}
                            onChange={(e) => handleHourSelect(idx, e.target.value)}
                          >
                            {Array.from({ length: 12 }, (_, i) => i + 1).map((hourValue) => (
                              <option key={hourValue} value={hourValue}>
                                {hourValue.toString().padStart(2, '0')}
                              </option>
                            ))}
                          </select>
                          <span className="time-sep">:</span>
                          <select
                            className="time-dropdown"
                            value={minute}
                            onChange={(e) => handleMinuteSelect(idx, e.target.value)}
                          >
                            {Array.from({ length: 12 }, (_, i) => i * 5).map((minuteValue) => {
                              const value = minuteValue.toString().padStart(2, '0');
                              return (
                                <option key={value} value={value}>
                                  {value}
                                </option>
                              );
                            })}
                          </select>
                          <select
                            className={`time-dropdown ampm-select ${ampm === 'AM' ? 'badge-am' : 'badge-pm'}`}
                            value={ampm}
                            onChange={(e) => handleAmPmSelect(idx, e.target.value)}
                          >
                            <option value="AM">AM</option>
                            <option value="PM">PM</option>
                          </select>
                        </div>
                      ) : (
                        <span className="time-display-static">
                          {hour12.toString().padStart(2, '0')}:{minute}
                          <span className={`ampm-badge ${ampm === 'AM' ? 'badge-am' : 'badge-pm'}`} style={{ marginLeft: '8px' }}>
                            {ampm}
                          </span>
                        </span>
                      )}
                    </div>

                    {config.target_times.length > 1 && (
                      <button
                        type="button"
                        className="icon-btn remove-btn"
                        onClick={() => handleRemoveTime(idx)}
                        title="Remove Time"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}

                    {idx === config.target_times.length - 1 && (
                      <button
                        type="button"
                        className="btn btn-outline-primary add-time-btn"
                        title="Add Target Time"
                        onClick={handleAddTime}
                      >
                        <Plus size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="form-section">
            <h3 className="section-title">{t(lang, 'appearance')}</h3>
            <p className="section-desc">{t(lang, 'appearanceDesc')}</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <select value={config.themeMode} onChange={handleThemeModeChange} className="theme-select" style={{ flex: 1 }}>
                <option value="light">{t(lang, 'lightMode')}</option>
                <option value="dark">{t(lang, 'darkMode')}</option>
                <option value="dynamic">{t(lang, 'timeAdaptive')}</option>
              </select>
              <select value={config.colorTheme} onChange={handleColorThemeChange} className="theme-select" style={{ flex: 1 }}>
                <option value="default">{t(lang, 'colorDefault') || '기본 (Default)'}</option>
                <option value="purple">{t(lang, 'colorPurple') || '퍼플 (Purple)'}</option>
                <option value="blue">{t(lang, 'colorBlue') || '블루 (Blue)'}</option>
                <option value="green">{t(lang, 'colorGreen') || '그린 (Green)'}</option>
              </select>
            </div>
          </div>

          <div className="form-section">
            <h3 className="section-title">{t(lang, 'language')}</h3>
            <p className="section-desc">{t(lang, 'languageDesc')}</p>
            <select value={config.language} onChange={handleLanguageChange} className="theme-select">
              <option value="ko">한국어</option>
              <option value="en">English</option>
              <option value="jp">日本語</option>
            </select>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <Save size={16} /> {saving ? t(lang, 'saving') : t(lang, 'saveSettings')}
            </button>
          </div>
        </form>

        <AnalyticsConsentSettings lang={lang} />

        {/* Trash Management Section (outside form) */}
        <div className="form-section" style={{ marginTop: '8px', borderTop: '1px solid var(--divider)', paddingTop: '24px' }}>
          <h3 className="section-title">🗑️ {t(lang, 'trashSettingsTitle')}</h3>
          <p className="section-desc">{t(lang, 'trashSettingsDesc')}</p>
          
          {trashItems.length === 0 ? (
            <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
              {t(lang, 'trashNoItems')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
              {trashItems.map((file, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  background: 'var(--card-bg)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '8px',
                  fontSize: '0.76rem',
                  color: 'var(--text-secondary)',
                }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {file.original_text?.replace(/^\s*[-*+]\s*\[[x ]\]\s*/i, '') || file.content?.trim() || file.filename}
                  </span>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => handleRestoreTrash(file.path)}
                    disabled={trashLoading}
                    title={t(lang, 'trashRestore')}
                    style={{ flexShrink: 0 }}
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-outline-primary"
                onClick={handleEmptyTrash}
                disabled={trashLoading}
                style={{ marginTop: '8px', width: '100%', color: '#e05555', borderColor: '#e05555' }}
              >
                <Trash2 size={16} /> {t(lang, 'trashEmpty')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
