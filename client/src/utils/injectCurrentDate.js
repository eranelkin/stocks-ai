export function injectCurrentDate(text) {
  if (!text) return text;
  let result = text;

  if (result.includes('<CURRENT_DATE>')) {
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
    const parts = formatter.formatToParts(new Date());
    const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
    const dateStr = `${get('month')} ${get('day')}, ${get('year')}, ${get('hour')}:${get('minute')} ${get('timeZoneName')}`;
    result = result.replaceAll('<CURRENT_DATE>', dateStr);
  }

  if (result.includes('<MARKET_CURRENT_DATE>')) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    const parts = formatter.formatToParts(new Date());
    const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
    const dateStr = `${get('month')} ${get('day')} ${get('year')} at ${get('hour')}:${get('minute')} ${get('dayPeriod')}`;
    result = result.replaceAll('<MARKET_CURRENT_DATE>', dateStr);
  }

  return result;
}
