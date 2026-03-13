import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Save, Clock } from 'lucide-react';
import { api } from '../utils/api';
import { trackEvent } from '../utils/analytics';
import './Settings.css';

export default function Settings() {
  const [config, setConfig] = useState(null);
  const [nickname, setNickname] = useState('Alex');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Track which row is in "edit mode"
  const [editingIdx, setEditingIdx] = useState(null);
  const inputRefs = useRef([]);

  useEffect(() => {
    const fetchConfig = async () => {
      const data = await api.getConfig();
      if (!data.target_times || data.target_times.length === 0) {
        data.target_times = ['06:00'];
      }
      if (!data.theme) data.theme = 'light';
      setConfig(data);
      if (data.nickname) setNickname(data.nickname);
      setLoading(false);
    };
    fetchConfig();
  }, []);

  // Parse "HH:MM" (24h) → { hour12, minute, ampm }
  const parseTime = (timeStr) => {
    if (!timeStr) return { hour12: 6, minute: '00', ampm: 'AM', display: '6:00' };
    const [h, m] = timeStr.split(':');
    let hours = parseInt(h, 10);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return { hour12, minute: m, ampm, display: `${hour12}:${m}` };
  };

  // Rebuild 24h string from hour12 + minute + ampm
  const buildTime = (hour12, minute, ampm) => {
    let h = parseInt(hour12, 10);
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return h.toString().padStart(2, '0') + ':' + minute;
  };

  const handleAmPmToggle = (idx, currentAmPm) => {
    const { hour12, minute } = parseTime(config.target_times[idx]);
    const newAmPm = currentAmPm === 'AM' ? 'PM' : 'AM';
    const newTimes = [...config.target_times];
    newTimes[idx] = buildTime(hour12, minute, newAmPm);
    setConfig({ ...config, target_times: newTimes });
  };

  // Update hour (from select)
  const handleHourSelect = (idx, hour12) => {
    const { minute, ampm } = parseTime(config.target_times[idx]);
    const newTimes = [...config.target_times];
    newTimes[idx] = buildTime(hour12, minute, ampm);
    setConfig({ ...config, target_times: newTimes });
  };

  // Update minute (from select)
  const handleMinuteSelect = (idx, minute) => {
    const { hour12, ampm } = parseTime(config.target_times[idx]);
    const newTimes = [...config.target_times];
    newTimes[idx] = buildTime(hour12, minute, ampm);
    setConfig({ ...config, target_times: newTimes });
  };

  // Update AM/PM (from select)
  const handleAmPmSelect = (idx, ampm) => {
    const { hour12, minute } = parseTime(config.target_times[idx]);
    const newTimes = [...config.target_times];
    newTimes[idx] = buildTime(hour12, minute, ampm);
    setConfig({ ...config, target_times: newTimes });
  };

  // When left-clock icon is clicked, activate edit mode for that row
  const handleClockClick = (idx) => {
    setEditingIdx(editingIdx === idx ? null : idx);
  };

  const handleThemeChange = (e) => {
    setConfig({ ...config, theme: e.target.value });
  };

  const handleAddTime = () => {
    setConfig({ ...config, target_times: [...config.target_times, '07:00'] });
  };

  const handleRemoveTime = (index) => {
    const newTimes = [...config.target_times];
    newTimes.splice(index, 1);
    if (newTimes.length === 0) newTimes.push('06:00');
    setConfig({ ...config, target_times: newTimes });
    if (editingIdx === index) setEditingIdx(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setEditingIdx(null);
    await api.saveConfig({
      target_times: config.target_times,
      theme: config.theme,
      nickname,
    });
    trackEvent('settings_save', { target_times: config.target_times, theme: config.theme });
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: config.theme }));
    window.dispatchEvent(new CustomEvent('nicknameChanged', { detail: nickname }));
    setTimeout(() => setSaving(false), 600);
  };

  return (
    <div className="settings-container fade-in">
      {loading ? (
        <div className="skeleton-loader">Loading settings...</div>
      ) : (
        <div className="settings-card glass-card">
          <form className="settings-form" onSubmit={handleSave}>

            {/* Profile */}
            <div className="form-section">
              <h3 className="section-title">Profile</h3>
              <p className="section-desc">What should we call you in the morning?</p>
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

            {/* Target Times */}
            <div className="form-section">
              <h3 className="section-title">Target Times</h3>
              <p className="section-desc">App will display tasks automatically after these times. Click the clock icon to edit.</p>

              <div className="times-list">
                {config.target_times.map((time, idx) => {
                  const { hour12, minute, ampm } = parseTime(time);
                  const isEditing = editingIdx === idx;

                  return (
                    <div className="time-row" key={idx}>
                      <div className={`time-input-wrapper ${isEditing ? 'editing' : ''}`}>
                        {/* Left clock icon — click to enter edit mode */}
                        <button
                          type="button"
                          className={`time-icon-btn ${isEditing ? 'active' : ''}`}
                          onClick={() => handleClockClick(idx)}
                          title={isEditing ? 'Close editor' : 'Click to edit time'}
                        >
                          <Clock size={20} className="time-icon" />
                        </button>

                        {/* Time display / edit */}
                        {isEditing ? (
                          <div className="time-edit-controls">
                            {/* Hour dropdown */}
                            <select
                              className="time-dropdown"
                              value={hour12}
                              onChange={(e) => handleHourSelect(idx, e.target.value)}
                            >
                              {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                                <option key={h} value={h}>{h.toString().padStart(2, '0')}</option>
                              ))}
                            </select>
                            <span className="time-sep">:</span>
                            {/* Minute dropdown (5-min steps) */}
                            <select
                              className="time-dropdown"
                              value={minute}
                              onChange={(e) => handleMinuteSelect(idx, e.target.value)}
                            >
                              {Array.from({ length: 12 }, (_, i) => i * 5).map(m => (
                                <option key={m} value={m.toString().padStart(2, '0')}>{m.toString().padStart(2, '0')}</option>
                              ))}
                            </select>
                            {/* AM/PM dropdown */}
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
                          <Trash2 size={18} />
                        </button>
                      )}

                      {idx === config.target_times.length - 1 && (
                        <button
                          type="button"
                          className="btn btn-outline-primary add-time-btn"
                          title="Add Target Time"
                          onClick={handleAddTime}
                        >
                          <Plus size={16} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Appearance */}
            <div className="form-section">
              <h3 className="section-title">Appearance</h3>
              <p className="section-desc">Choose between Light or Dark theme.</p>
              <select value={config.theme} onChange={handleThemeChange} className="theme-select">
                <option value="light">Light Mode</option>
                <option value="dark">Dark Mode</option>
              </select>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                <Save size={18} /> {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
