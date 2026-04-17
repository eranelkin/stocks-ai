const START_MARKER = "<DAY_TRADE_TABLE_START>";
const END_MARKER = "<DAY_TRADE_TABLE_END>";

/**
 * Parses the markdown table enclosed in <DAY_TRADE_TABLE_START> / <DAY_TRADE_TABLE_END> markers.
 * Returns { columns: string[], rows: string[][] } or null if not found / invalid.
 */
export function parseMarkdownTable(content) {
  const startIdx = content.indexOf(START_MARKER);
  const endIdx = content.indexOf(END_MARKER);

  let tableContent;
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    tableContent = content.slice(startIdx + START_MARKER.length, endIdx).trim();
  } else {
    // Fallback: use entire content (handles responses without markers)
    tableContent = content;
  }

  const lines = tableContent.split("\n").map((l) => l.trim());

  // Find the first pipe-delimited header row (not a separator)
  const headerIdx = lines.findIndex(
    (l) => l.startsWith("|") && !/^\|[\s\-|:]+\|?$/.test(l),
  );
  if (headerIdx === -1) return null;

  const columns = parseCells(lines[headerIdx]);
  if (columns.length === 0) return null;

  const colCount = columns.length;
  const rows = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("|")) break; // end of table

    // Skip separator line (e.g. |---|---|)
    if (/^\|[\s\-|:]+\|?$/.test(line)) continue;

    const cells = parseCells(line);
    if (cells.length === 0) continue;

    // Pad or truncate to match column count
    while (cells.length < colCount) cells.push("");
    rows.push(cells.slice(0, colCount));
  }

  if (rows.length === 0) return null;

  return { columns, rows };
}

/**
 * Removes <DAY_TRADE_TABLE_START> / <DAY_TRADE_TABLE_END> markers from a message for clean display.
 * The markdown table content between them is preserved.
 */
export function stripTableMarkers(content) {
  return content
    .replace(new RegExp(`${START_MARKER}\\s*`, "g"), "")
    .replace(new RegExp(`${END_MARKER}\\s*`, "g"), "");
}

function parseCells(line) {
  return line
    .split("|")
    .map((c) => c.trim())
    .filter((c, i, arr) => (i !== 0 && i !== arr.length - 1 ? true : c !== ""));
}

/**
 * Derives a default report title from column names and today's date.
 * e.g. "Symbol / Price — Apr 15"
 */
export function deriveTitle(columns) {
  const date = new Date().toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const label = columns.slice(0, 2).join(" / ");
  return `${label} — ${date}`;
}
