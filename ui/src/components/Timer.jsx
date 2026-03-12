import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import './Timer.css';

export default function Timer() {
  const [timeLeft, setTimeLeft] = useState(null);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      const config = await api.getConfig();
      if (config.auto_close_seconds > 0) {
        setTimeLeft(config.auto_close_seconds);
        setIsActive(true);
      }
    };
    fetchConfig();
  }, []);

  useEffect(() => {
    if (!isActive || timeLeft === null) return;

    if (timeLeft <= 0) {
      api.closeWindow();
      return;
    }

    const interval = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, timeLeft]);

  const toggleTimer = () => {
    setIsActive(!isActive);
  };

  const closeNow = () => {
    api.closeWindow();
  };

  return (
    <div className="timer-container fade-in">
      <h2 className="tab-title">Auto-Close Timer</h2>
      
      <div className="timer-card">
        {timeLeft === null ? (
          <p className="timer-disabled">Timer is disabled in settings.</p>
        ) : (
          <>
            <div className={`countdown ${timeLeft <= 10 ? 'urgent' : ''}`}>
              {Math.floor(timeLeft / 60).toString().padStart(2, '0')}:
              {(timeLeft % 60).toString().padStart(2, '0')}
            </div>
            
            <p className="timer-label">Time remaining before closing</p>
            
            <div className="timer-controls">
              <button 
                className={`btn ${isActive ? 'btn-secondary' : 'btn-primary'}`}
                onClick={toggleTimer}
              >
                {isActive ? 'Pause Timer' : 'Resume Timer'}
              </button>
              
              <button className="btn btn-danger" onClick={closeNow}>
                Close App Now
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
