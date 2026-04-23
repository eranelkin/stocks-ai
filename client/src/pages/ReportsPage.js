import { useCallback, useEffect, useState } from "react";
import Box from "@mui/joy/Box";
import Button from "@mui/joy/Button";
import Chip from "@mui/joy/Chip";
import CircularProgress from "@mui/joy/CircularProgress";
import IconButton from "@mui/joy/IconButton";
import Input from "@mui/joy/Input";
import Sheet from "@mui/joy/Sheet";
import Tab from "@mui/joy/Tab";
import TabList from "@mui/joy/TabList";
import Tabs from "@mui/joy/Tabs";
import Table from "@mui/joy/Table";
import Tooltip from "@mui/joy/Tooltip";
import Typography from "@mui/joy/Typography";

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toLocalDateStr(sqlOrIso) {
  // SQLite stores "2026-04-17 14:30:00" without timezone — treat as UTC
  const normalized = sqlOrIso.includes("T")
    ? sqlOrIso
    : sqlOrIso.replace(" ", "T") + "Z";
  return new Date(normalized).toLocaleDateString("en-CA"); // YYYY-MM-DD local
}

function todayStr() {
  return new Date().toLocaleDateString("en-CA");
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("en-CA");
}

function formatDate(sqlOrIso) {
  const normalized = sqlOrIso.includes("T")
    ? sqlOrIso
    : sqlOrIso.replace(" ", "T") + "Z";
  return new Date(normalized).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function ReportsList({
  reports,
  selectedId,
  deleting,
  onSelect,
  onDelete,
  emptyText,
}) {
  if (reports.length === 0) {
    return (
      <Sheet
        variant="outlined"
        sx={{ borderRadius: "md", p: 4, textAlign: "center", flexShrink: 0 }}
      >
        <Typography level="body-md" textColor="neutral.500">
          {emptyText}
        </Typography>
      </Sheet>
    );
  }

  return (
    // ~44px header + 44px × 5 rows = ~264px cap
    <Sheet
      variant="outlined"
      sx={{
        borderRadius: "md",
        overflow: "auto",
        flexShrink: 0,
        maxHeight: 264,
      }}
    >
      <Table
        hoverRow
        stickyHeader
        sx={{
          "& th": { bgcolor: "background.surface" },
          "& tbody tr": { cursor: "pointer" },
          "& tbody tr.report-row-selected td": { bgcolor: "primary.softBg" },
        }}
      >
        <thead>
          <tr>
            <th>Title</th>
            <th style={{ width: 180 }}>Source</th>
            <th style={{ width: 80 }}>Rows</th>
            <th style={{ width: 160 }}>Created</th>
            <th style={{ width: 64 }}></th>
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => (
            <tr
              key={r.id}
              onClick={() => onSelect(r.id === selectedId ? null : r.id)}
              className={r.id === selectedId ? "report-row-selected" : ""}
            >
              <td>
                <Typography level="body-sm" fontWeight="lg">
                  {r.title}
                </Typography>
              </td>
              <td>
                {r.source_prompt_title ? (
                  <Typography level="body-sm" textColor="neutral.600">
                    {r.source_prompt_title}
                  </Typography>
                ) : (
                  <Typography level="body-xs" textColor="neutral.400">
                    —
                  </Typography>
                )}
              </td>
              <td>
                <Chip size="sm" variant="soft" color="neutral">
                  {r.rows.length}
                </Chip>
              </td>
              <td>
                <Typography level="body-xs" textColor="neutral.500">
                  {formatDate(r.created_at)}
                </Typography>
              </td>
              <td onClick={(e) => e.stopPropagation()}>
                <Tooltip title="Delete" placement="top">
                  <IconButton
                    size="sm"
                    variant="plain"
                    color="danger"
                    loading={deleting.has(r.id)}
                    onClick={() => onDelete(r.id)}
                  >
                    <TrashIcon />
                  </IconButton>
                </Tooltip>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Sheet>
  );
}

const WIDE_COLS = new Set(["detect", "reason", "ai suggestion"]);

function getColWidth(col) {
  return WIDE_COLS.has(col?.toLowerCase())
    ? { minWidth: 320, width: 320 }
    : { minWidth: 180, width: 180 };
}

function exportReportAsHtml(report) {
  const safeName = report.title
    .replace(/[^a-zA-Z0-9 .\-]/g, "_")
    .replace(/_+/g, "_")
    .trim();
  const filename = safeName + ".html";

  const numericCols = new Set(
    report.columns
      .filter((c) => SORTABLE_COLS[c.toLowerCase()] === "number")
      .map((c) => c.toLowerCase())
  );
  const headerCells = report.columns
    .map((col, i) => `<th data-col="${i}" data-dir="asc" style="cursor:pointer;user-select:none">${col} <span class="arrow" style="opacity:0.3">↑</span></th>`)
    .join("");
  const bodyRows = report.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${report.title}</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 2rem; color: #1a1a1a; }
  h1 { font-size: 1.4rem; margin-bottom: 1.25rem; }
  table { border-collapse: collapse; width: 100%; font-size: 0.875rem; }
  th, td { border: 1px solid #d0d0d0; padding: 6px 12px; text-align: left; white-space: nowrap; }
  th { background: #f4f4f5; font-weight: 600; }
  th.sorted { background: #e8e8ea; }
  tr:nth-child(even) td { background: #fafafa; }
</style>
</head>
<body>
<h1>${report.title}</h1>
<table id="t">
<thead><tr>${headerCells}</tr></thead>
<tbody>
${bodyRows}
</tbody>
</table>
<script>
const NUMERIC = new Set(${JSON.stringify([...numericCols])});
const table = document.getElementById('t');
table.querySelectorAll('th').forEach(th => {
  th.addEventListener('click', () => {
    const col = +th.dataset.col;
    const dir = th.dataset.dir;
    table.querySelectorAll('th').forEach(h => {
      h.dataset.dir = 'asc';
      h.classList.remove('sorted');
      h.querySelector('.arrow').textContent = '↑';
      h.querySelector('.arrow').style.opacity = '0.3';
    });
    th.dataset.dir = dir === 'asc' ? 'desc' : 'asc';
    th.classList.add('sorted');
    th.querySelector('.arrow').textContent = th.dataset.dir === 'asc' ? '↑' : '↓';
    th.querySelector('.arrow').style.opacity = '1';
    const colName = th.textContent.replace(/[↑↓]/, '').trim().toLowerCase();
    const isNum = NUMERIC.has(colName);
    const tbody = table.querySelector('tbody');
    const rows = [...tbody.querySelectorAll('tr')];
    rows.sort((a, b) => {
      const av = a.cells[col].textContent;
      const bv = b.cells[col].textContent;
      const cmp = isNum ? (parseFloat(av) || 0) - (parseFloat(bv) || 0) : av.localeCompare(bv);
      return th.dataset.dir === 'asc' ? cmp : -cmp;
    });
    rows.forEach(r => tbody.appendChild(r));
  });
});
</script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const SORTABLE_COLS = { "symbol": "string", "confidence": "number", "success probability": "number" };

function DetailPanel({ report, onClose }) {
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState("asc");

  if (!report) return null;

  const handleSort = (col) => {
    const key = col.toLowerCase();
    if (sortCol === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(key);
      setSortDir("asc");
    }
  };

  const sortedRows = (() => {
    if (!sortCol) return report.rows;
    const colIdx = report.columns.findIndex((c) => c.toLowerCase() === sortCol);
    if (colIdx === -1) return report.rows;
    const type = SORTABLE_COLS[sortCol];
    return [...report.rows].sort((a, b) => {
      const av = a[colIdx] ?? "";
      const bv = b[colIdx] ?? "";
      const cmp =
        type === "number"
          ? (parseFloat(av) || 0) - (parseFloat(bv) || 0)
          : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  })();

  return (
    <Sheet
      variant="outlined"
      sx={{
        borderRadius: "md",
        overflow: "hidden",
        flex: 1,
        mt: 2,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <Box
        sx={{
          px: 2,
          py: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
          bgcolor: "background.surface",
        }}
      >
        <Typography level="title-sm">{report.title}</Typography>
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <Tooltip title="Export HTML" placement="top">
            <IconButton
              size="sm"
              variant="plain"
              color="neutral"
              onClick={() => exportReportAsHtml({ ...report, rows: sortedRows })}
            >
              <DownloadIcon />
            </IconButton>
          </Tooltip>
          <IconButton size="sm" variant="plain" color="neutral" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
      </Box>

      <Box sx={{ overflow: "auto", flex: 1 }}>
        <Table
          hoverRow
          stickyHeader
          sx={{
            minWidth: "max-content",
            "& th": {
              bgcolor: "background.surface",
              minWidth: 180,
              whiteSpace: "nowrap",
            },
            "& td": {
              minWidth: 180,
              whiteSpace: "nowrap",
            },
          }}
        >
          <thead>
            <tr>
              {report.columns.map((col, i) => {
                const key = col.toLowerCase();
                const sortable = key in SORTABLE_COLS;
                const active = sortCol === key;
                return (
                  <th
                    key={i}
                    style={{
                      ...getColWidth(col),
                      cursor: sortable ? "pointer" : "default",
                      userSelect: "none",
                    }}
                    onClick={sortable ? () => handleSort(col) : undefined}
                  >
                    {col}
                    {sortable && (
                      <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3 }}>
                        {active && sortDir === "desc" ? "↓" : "↑"}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} style={getColWidth(report.columns[ci])}>
                    <Typography level="body-sm">{cell}</Typography>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
      </Box>
    </Sheet>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ReportsPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [deleting, setDeleting] = useState(new Set());
  const [activeTab, setActiveTab] = useState("today");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reports");
      const data = await res.json();
      setReports(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  async function handleDelete(id) {
    if (!window.confirm("Delete this report?")) return;
    setDeleting((prev) => new Set(prev).add(id));
    try {
      await fetch(`/api/reports/${id}`, { method: "DELETE" });
      setReports((prev) => prev.filter((r) => r.id !== id));
      if (selectedId === id) setSelectedId(null);
    } finally {
      setDeleting((prev) => {
        const s = new Set(prev);
        s.delete(id);
        return s;
      });
    }
  }

  function handleTabChange(_, val) {
    setActiveTab(val);
    setSelectedId(null);
    setDateFrom("");
    setDateTo("");
  }

  function clearFilter() {
    setDateFrom("");
    setDateTo("");
    setSelectedId(null);
  }

  const today = todayStr();
  const todayReports = reports.filter(
    (r) => toLocalDateStr(r.created_at) === today,
  );
  const historyReports = reports.filter(
    (r) => toLocalDateStr(r.created_at) < today,
  );
  const hasFilter = dateFrom || dateTo;
  const filteredHistory = hasFilter
    ? historyReports.filter((r) => {
        const d = toLocalDateStr(r.created_at);
        if (dateFrom && d < dateFrom) return false;
        if (dateTo && d > dateTo) return false;
        return true;
      })
    : historyReports;

  const selectedReport = reports.find((r) => r.id === selectedId) ?? null;

  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        p: 3,
      }}
    >
      {/* Page header */}
      <Box sx={{ mb: 2, flexShrink: 0 }}>
        <Typography level="h3">Reports</Typography>
        <Typography level="body-sm" textColor="neutral.500">
          Saved output tables from your AI analyses.
        </Typography>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        // Tabs owns only the tab-strip; content lives in a sibling Box so flex
        // sizing is never blocked by TabPanel's internal display:none toggling.
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <Tabs
            value={activeTab}
            onChange={handleTabChange}
            sx={{ flexShrink: 0, bgcolor: "transparent" }}
          >
            <TabList>
              <Tab value="today">Today</Tab>
              <Tab value="history">History</Tab>
            </TabList>
          </Tabs>

          {/* ── Today content ── */}
          {activeTab === "today" && (
            <Box
              sx={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                pt: 1.5,
              }}
            >
              <ReportsList
                reports={todayReports}
                selectedId={selectedId}
                deleting={deleting}
                onSelect={setSelectedId}
                onDelete={handleDelete}
                emptyText="No reports generated today."
              />
              <DetailPanel
                report={selectedReport}
                onClose={() => setSelectedId(null)}
              />
            </Box>
          )}

          {/* ── History content ── */}
          {activeTab === "history" && (
            <Box
              sx={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                pt: 1.5,
              }}
            >
              {/* Date range filter — pinned just below the tab strip */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  mb: 1.5,
                  flexShrink: 0,
                }}
              >
                <Input
                  type="date"
                  size="sm"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setSelectedId(null);
                  }}
                  slotProps={{ input: { max: dateTo || yesterdayStr() } }}
                  sx={{ width: 160 }}
                />
                <Typography level="body-xs" textColor="neutral.400">
                  —
                </Typography>
                <Input
                  type="date"
                  size="sm"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setSelectedId(null);
                  }}
                  slotProps={{
                    input: { min: dateFrom || undefined, max: yesterdayStr() },
                  }}
                  sx={{ width: 160 }}
                />
                {hasFilter && (
                  <>
                    <Button
                      size="sm"
                      variant="plain"
                      color="neutral"
                      onClick={clearFilter}
                    >
                      Clear
                    </Button>
                    <Typography level="body-xs" textColor="neutral.500">
                      {filteredHistory.length} report
                      {filteredHistory.length !== 1 ? "s" : ""}
                    </Typography>
                  </>
                )}
              </Box>

              <ReportsList
                reports={filteredHistory}
                selectedId={selectedId}
                deleting={deleting}
                onSelect={setSelectedId}
                onDelete={handleDelete}
                emptyText={
                  hasFilter
                    ? "No reports for this date range."
                    : "No historical reports yet."
                }
              />
              <DetailPanel
                report={selectedReport}
                onClose={() => setSelectedId(null)}
              />
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function TrashIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export default ReportsPage;
