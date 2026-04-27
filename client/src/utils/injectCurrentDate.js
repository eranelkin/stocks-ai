/**
 * Replaces <CURRENT_DATE> in a string with the current date/time in EDT.
 * Format: "April 27, 2026, 06:00 EDT"
 */
export function injectCurrentDate(text) {
  if (!text || !text.includes('<CURRENT_DATE>')) return text;

  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  });

  const parts = formatter.formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';

  const dateStr = `${get('month')} ${get('day')}, ${get('year')}, ${get('hour')}:${get('minute')} ${get('timeZoneName')}`;
  return text.replaceAll('<CURRENT_DATE>', dateStr);
}
