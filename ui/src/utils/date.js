const DAY_START_HOUR = 2; // 오전 2시 이전은 전날로 취급

// Returns a YYYY-MM-DD string using LOCAL timezone (not UTC)
export function localDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function localDateFromStr(dateStr) {
  const match = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (
    Number.isNaN(parsed.getTime())
    || parsed.getFullYear() !== Number(match[1])
    || parsed.getMonth() !== Number(match[2]) - 1
    || parsed.getDate() !== Number(match[3])
  ) {
    return null;
  }
  return parsed;
}

export function startOfLocalWeek(date = new Date()) {
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
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
