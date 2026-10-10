const LIBRARY_NOW = localTime("2026-10-10T16:00");

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const MONTH_DAY_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function localTime(dateTime: string): number {
  return new Date(dateTime).getTime();
}

export function formatLastOpened(time: number): string {
  const days = calendarDaysBetween(time, LIBRARY_NOW);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const sameYear = new Date(time).getFullYear() === new Date(LIBRARY_NOW).getFullYear();
  return (sameYear ? MONTH_DAY : MONTH_DAY_YEAR).format(time);
}

function calendarDaysBetween(earlier: number, later: number): number {
  const startOfDay = (time: number) => new Date(time).setHours(0, 0, 0, 0);
  return Math.round((startOfDay(later) - startOfDay(earlier)) / DAY_MS);
}
