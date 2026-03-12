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
    user_id: globalUserId, // Anonymous Tracker UUID
    timestamp: new Date().toISOString(),
    ...eventData
  };
  
  console.log(`[Analytics Track]`, payload);
  
  // Future GTM Integration:
  // if (window.dataLayer) {
  //   window.dataLayer.push(payload);
  // }
};
