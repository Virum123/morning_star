/**
 * Basic Analytics Utility for GTM/GA4 integration
 */

let globalUserId = null;

export const setAnalyticsUser = (userId) => {
  globalUserId = userId;
};

export const trackEvent = (eventName, eventData = {}) => {
  const payload = {
    event: eventName,
    user_id: globalUserId,
    timestamp: new Date().toISOString(),
    ...eventData
  };

  if (window.dataLayer) {
    window.dataLayer.push(payload);
  }
};
