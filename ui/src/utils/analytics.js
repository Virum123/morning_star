/**
 * Consent-aware Google Tag Manager data layer.
 * GA4 tags are configured in GTM so events have one delivery path.
 */

const CONSENT_STORAGE_KEY = 'morning-star.analytics-consent.v1';
const CONSENT_CHANGE_EVENT = 'morning-star:analytics-consent-change';
const GTM_SCRIPT_ID = 'morning-star-gtm';
const GTM_ID = import.meta.env.VITE_GTM_ID?.trim().toUpperCase() || '';

const EVENT_PARAMETER_RULES = {
  app_open: {},
  tab_view: { tab_name: ['planner', 'archive', 'settings'] },
  onboarding_view: {},
  task_check_planner: { checked: 'boolean', target: ['today', 'tomorrow', 'byDate'] },
  task_quick_add: { target: ['today', 'tomorrow', 'byDate'] },
  task_inline_edit: {},
  task_migrate: {},
  freq_tasks_deleted_bulk: { count: 'non_negative_integer' },
  freq_tasks_added_daily: {},
  no_task_fire: {},
  fire_complete: {},
  settings_save: {
    target_time_count: 'non_negative_integer',
    theme_mode: ['light', 'dark', 'dynamic'],
    color_theme: ['default', 'purple', 'blue', 'green'],
    app_language: ['ko', 'en', 'jp'],
  },
};
const EVENT_PARAMETER_KEYS = [...new Set(
  Object.values(EVENT_PARAMETER_RULES).flatMap((rules) => Object.keys(rules)),
)];

let globalUserId = null;
let inMemoryConsent = null;
let consentModeInitialized = false;
let storageListenerInitialized = false;
let pageViewQueued = false;

function isBrowserRuntime() {
  return typeof window !== 'undefined'
    && typeof document !== 'undefined'
    && ['http:', 'https:'].includes(window.location.protocol);
}

function isValidGtmId(value) {
  return /^GTM-[A-Z0-9]+$/.test(value);
}

function ensureDataLayer() {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };
}

function consentState(granted) {
  return {
    analytics_storage: granted ? 'granted' : 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  };
}

function initializeConsentMode(granted) {
  ensureDataLayer();
  if (consentModeInitialized) return;

  window.gtag('consent', 'default', {
    ...consentState(granted),
    wait_for_update: granted ? 0 : 500,
  });
  consentModeInitialized = true;
}

function updateConsentMode(granted) {
  initializeConsentMode(false);
  window.gtag('consent', 'update', consentState(granted));
}

function getSafePageLocation() {
  return `${window.location.origin}${window.location.pathname}`;
}

function pushAnalyticsContext() {
  window.dataLayer.push({
    event: 'analytics_config',
    analytics_user_id: globalUserId,
    page_location: getSafePageLocation(),
    page_title: document.title,
  });
}

function loadGtm() {
  if (document.getElementById(GTM_SCRIPT_ID)) return;

  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  const script = document.createElement('script');
  script.id = GTM_SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(GTM_ID)}`;
  document.head.appendChild(script);
}

function queuePageView() {
  if (pageViewQueued) return;
  pageViewQueued = true;
  window.dataLayer.push({
    event: 'page_view',
    analytics_user_id: globalUserId,
    page_location: getSafePageLocation(),
    page_title: document.title,
  });
}

function readStoredConsent() {
  try {
    const storedConsent = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    return storedConsent === 'granted' || storedConsent === 'denied' ? storedConsent : 'unknown';
  } catch {
    return inMemoryConsent || 'unknown';
  }
}

function applyConsent(consent, { persist = true, notify = true } = {}) {
  inMemoryConsent = consent;

  if (persist) {
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, consent);
    } catch {
      // In-memory consent still applies when storage is unavailable.
    }
  }

  const granted = consent === 'granted';
  updateConsentMode(granted);

  if (granted) {
    pushAnalyticsContext();
    loadGtm();
    queuePageView();
  }

  if (notify) {
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: { consent } }));
  }
}

function normalizeUserId(userId) {
  if (typeof userId !== 'string') return null;
  const normalized = userId.trim();
  return /^[A-Za-z0-9_-]{1,128}$/.test(normalized) ? normalized : null;
}

function isAllowedParameterValue(rule, value) {
  if (rule === 'boolean') return typeof value === 'boolean';
  if (rule === 'non_negative_integer') {
    return Number.isInteger(value) && value >= 0;
  }
  return Array.isArray(rule) && typeof value === 'string' && rule.includes(value);
}

function sanitizeEventData(eventName, eventData) {
  const rules = EVENT_PARAMETER_RULES[eventName];
  if (!rules || !eventData || typeof eventData !== 'object') return {};

  return Object.entries(rules).reduce((safeData, [key, rule]) => {
    const value = eventData[key];
    if (isAllowedParameterValue(rule, value)) safeData[key] = value;
    return safeData;
  }, {});
}

export function isAnalyticsConfigured() {
  return isBrowserRuntime() && isValidGtmId(GTM_ID);
}

export function getAnalyticsConsent() {
  if (!isBrowserRuntime()) return 'unknown';
  const storedConsent = readStoredConsent();
  inMemoryConsent = storedConsent;
  return storedConsent;
}

export function initializeAnalytics() {
  if (!isAnalyticsConfigured()) return false;

  const consent = getAnalyticsConsent();
  initializeConsentMode(consent === 'granted');

  if (!storageListenerInitialized) {
    window.addEventListener('storage', (event) => {
      if (event.key !== CONSENT_STORAGE_KEY) return;
      const nextConsent = readStoredConsent();
      applyConsent(nextConsent === 'granted' ? 'granted' : 'denied', {
        persist: false,
      });
    });
    storageListenerInitialized = true;
  }

  if (consent === 'granted') {
    pushAnalyticsContext();
    loadGtm();
    queuePageView();
  }

  return true;
}

export function setAnalyticsConsent(consent) {
  if (!isAnalyticsConfigured() || !['granted', 'denied'].includes(consent)) return false;
  applyConsent(consent);
  return true;
}

export function subscribeAnalyticsConsent(listener) {
  if (!isBrowserRuntime()) return () => {};
  const handleChange = (event) => listener(event.detail?.consent || getAnalyticsConsent());
  window.addEventListener(CONSENT_CHANGE_EVENT, handleChange);
  return () => window.removeEventListener(CONSENT_CHANGE_EVENT, handleChange);
}

export function setAnalyticsUser(userId) {
  globalUserId = normalizeUserId(userId);

  if (isAnalyticsConfigured() && getAnalyticsConsent() === 'granted') {
    window.dataLayer.push({
      event: 'analytics_user_context',
      analytics_user_id: globalUserId,
    });
  }
}

export function trackEvent(eventName, eventData = {}) {
  if (!EVENT_PARAMETER_RULES[eventName]) return false;
  if (!isAnalyticsConfigured() || getAnalyticsConsent() !== 'granted') return false;

  window.dataLayer.push({
    ...Object.fromEntries(EVENT_PARAMETER_KEYS.map((key) => [key, undefined])),
    event: eventName,
    analytics_user_id: globalUserId,
    ...sanitizeEventData(eventName, eventData),
  });
  return true;
}
