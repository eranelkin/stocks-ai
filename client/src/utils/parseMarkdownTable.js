/**
 * Parses the markdown table whose header contains "| Symbol | Current Price".
 * Returns { columns: string[], rows: string[][] } or null if not found / invalid.
 */
export function parseMarkdownTable(content) {
  const lines = content.split('\n').map((l) => l.trim());

  // Find the header row by the known column pattern (case-insensitive)
  const headerIdx = lines.findIndex((l) =>
    l.toLowerCase().includes('| symbol |') && l.toLowerCase().includes('| current price')
  );
  if (headerIdx === -1) return null;

  const columns = parseCells(lines[headerIdx]);
  if (columns.length === 0) return null;

  const colCount = columns.length;
  const rows = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('|')) break; // end of table

    // Skip separator line (e.g. |---|---|)
    if (/^\|[\s\-|:]+\|?$/.test(line)) continue;

    const cells = parseCells(line);
    if (cells.length === 0) continue;

    // Pad or truncate to match column count
    while (cells.length < colCount) cells.push('');
    rows.push(cells.slice(0, colCount));
  }

  if (rows.length === 0) return null;

  return { columns, rows };
}

function parseCells(line) {
  return line
    .split('|')
    .map((c) => c.trim())
    .filter((c, i, arr) => i !== 0 && i !== arr.length - 1 ? true : c !== '');
}

/**
 * Derives a default report title from column names and today's date.
 * e.g. "Symbol / Price — Apr 15"
 */
export function deriveTitle(columns) {
  const date = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const label = columns.slice(0, 2).join(' / ');
  return `${label} — ${date}`;
}
