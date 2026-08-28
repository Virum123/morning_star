import { useEffect, useState } from 'react';
import {
  getAnalyticsConsent,
  isAnalyticsConfigured,
  setAnalyticsConsent,
  subscribeAnalyticsConsent,
} from '../utils/analytics';
import { t } from '../utils/i18n';
import './AnalyticsConsent.css';

function getBrowserLanguage() {
  const language = navigator.language?.toLowerCase() || '';
  if (language.startsWith('ja')) return 'jp';
  if (language.startsWith('ko')) return 'ko';
  return 'en';
}

function useAnalyticsConsent() {
  const [consent, setConsent] = useState(() => getAnalyticsConsent());

  useEffect(() => subscribeAnalyticsConsent(setConsent), []);
  return consent;
}

export default function AnalyticsConsent() {
  const consent = useAnalyticsConsent();
  const lang = getBrowserLanguage();

  if (!isAnalyticsConfigured() || consent !== 'unknown') return null;

  return (
    <section className="analytics-consent-banner" role="region" aria-label={t(lang, 'analyticsConsentTitle')}>
      <div className="analytics-consent-copy">
        <strong>{t(lang, 'analyticsConsentTitle')}</strong>
        <p>{t(lang, 'analyticsConsentDesc')}</p>
        <small>{t(lang, 'analyticsPrivacyNote')}</small>
      </div>
      <div className="analytics-consent-actions">
        <button type="button" className="btn btn-secondary" onClick={() => setAnalyticsConsent('denied')}>
          {t(lang, 'analyticsConsentDeny')}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => setAnalyticsConsent('granted')}>
          {t(lang, 'analyticsConsentAllow')}
        </button>
      </div>
    </section>
  );
}

export function AnalyticsConsentSettings({ lang = 'ko' }) {
  const consent = useAnalyticsConsent();

  if (!isAnalyticsConfigured()) return null;

  return (
    <div className="form-section analytics-settings-section">
      <h3 className="section-title">{t(lang, 'analyticsSettingsTitle')}</h3>
      <p className="section-desc">{t(lang, 'analyticsSettingsDesc')}</p>
      <p className="section-note">{t(lang, 'analyticsPrivacyNote')}</p>
      <div className="analytics-settings-row">
        <span className={`analytics-consent-status status-${consent}`}>
          {t(lang, `analyticsConsentStatus_${consent}`)}
        </span>
        <div className="analytics-consent-actions">
          <button
            type="button"
            className="btn btn-secondary"
            aria-pressed={consent === 'denied'}
            onClick={() => setAnalyticsConsent('denied')}
          >
            {t(lang, 'analyticsConsentDeny')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            aria-pressed={consent === 'granted'}
            onClick={() => setAnalyticsConsent('granted')}
          >
            {t(lang, 'analyticsConsentAllow')}
          </button>
        </div>
      </div>
    </div>
  );
}
