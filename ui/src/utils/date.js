const DAY_START_HOUR = 2; // 오전 2시 이전은 전날로 취급

// Returns a YYYY-MM-DD string using LOCAL timezone (not UTC)
export function localDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Returns "app today" Date — before DAY_START_HOUR, treat as still the previous day
export function appTodayDate() {
  const now = new Date();
  if (now.getHours() < DAY_START_HOUR) {
    const d = new Date(now);
    d.setDate(now.getDate() - 1);
    return d;
  }
  return now;
}
