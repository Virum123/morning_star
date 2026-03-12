import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Clock } from 'lucide-react';
import { api } from '../utils/api';
import { trackEvent } from '../utils/analytics';
import './Settings.css';

export default function Settings() {
  const [config, setConfig] = useState(null);
  const [nickname, setNickname] = useState('Alex');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      const data = await api.getConfig();
      
      // Ensure target_times exists
      if (!data.target_times || data.target_times.length === 0) {
        data.target_times = ["06:00"];
      }
      if (!data.theme) {
        data.theme = "light";
      }
      
      setConfig(data);
      if (data.nickname) setNickname(data.nickname);
      setLoading(false);
    };
    fetchConfig();
  }, []);

  const handleTimeChange = (index, value) => {
    const newTimes = [...config.target_times];
    newTimes[index] = value;
    setConfig({ ...config, target_times: newTimes });
  };

  const formatAMPM = (timeStr) => {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':');
    let hours = parseInt(h, 10);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    return hours.toString().padStart(2, '0') + ':' + m + ' ' + ampm;
  };

  const handleThemeChange = (e) => {
    const newTheme = e.target.value;
    setConfig({ ...config, theme: newTheme });
  };

  const handleAddTime = () => {
    setConfig({
      ...config,
      target_times: [...config.target_times, "07:00"] // default new time
    });
  };

  const handleClockClick = (idx) => {
    const input = document.getElementById(`time-input-${idx}`);
    if (input && typeof input.showPicker === 'function') {
      try {
        input.showPicker();
      } catch (e) {
        console.log("showPicker not supported or failed", e);
      }
    }
  };

  const handleRemoveTime = (index) => {
    const newTimes = [...config.target_times];
    newTimes.splice(index, 1);
    // If we removed the last one, at least keep one empty? 
    // Usually they just have 1. Let's keep at least 1.
    if (newTimes.length === 0) newTimes.push("06:00");
    setConfig({ ...config, target_times: newTimes });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    await api.saveConfig({ 
      target_times: config.target_times, 
      theme: config.theme,
      nickname: nickname
    });
    
    trackEvent('settings_save', { target_times: config.target_times, theme: config.theme });
    
    // Dispatch global events for App.jsx to pick up immediately
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: config.theme }));
    window.dispatchEvent(new CustomEvent('nicknameChanged', { detail: nickname }));
    
    setTimeout(() => {
      setSaving(false);
    }, 600);
  };

  return (
    <div className="settings-container fade-in">
      
      {loading ? (
        <div className="skeleton-loader">Loading settings...</div>
      ) : (
        <div className="settings-card glass-card">
          <form className="settings-form" onSubmit={handleSave}>

            <div className="form-section">
              <h3 className="section-title">Profile</h3>
              <p className="section-desc">What should we call you in the morning?</p>
              
              <input 
                type="text" 
                value={nickname} 
                onChange={(e) => setNickname(e.target.value)}
                className="theme-select"
                style={{backgroundImage: 'none'}}
                placeholder="Enter Nickname"
                required
              />
            </div>
            
            <div className="form-section">
              <h3 className="section-title">Target Times</h3>
              <p className="section-desc">App will display tasks automatically after these times.</p>
              
              <div className="times-list">
                {config.target_times.map((time, idx) => (
                  <div className="time-row" key={idx}>
                    <div className="time-input-wrapper" style={{ position: 'relative' }}>
                      <Clock 
                        size={20} 
                        className="time-icon" 
                        onClick={() => handleClockClick(idx)}
                        title="Set Time"
                        style={{ zIndex: 10 }}
                      />
                      <div className="custom-time-display">
                        {formatAMPM(time)}
                      </div>
                      <input 
                        id={`time-input-${idx}`}
                        type="time" 
                        value={time} 
                        onChange={(e) => handleTimeChange(idx, e.target.value)}
                        required
                        className="time-input-hidden"
                      />
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
                ))}
              </div>
            </div>

            <div className="form-section">
              <h3 className="section-title">Appearance</h3>
              <p className="section-desc">Choose between Light or Dark theme.</p>
              
              <select 
                value={config.theme} 
                onChange={handleThemeChange}
                className="theme-select"
              >
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
