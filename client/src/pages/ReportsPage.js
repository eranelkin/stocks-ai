import { useCallback, useEffect, useState } from 'react';
import Box from '@mui/joy/Box';
import Chip from '@mui/joy/Chip';
import CircularProgress from '@mui/joy/CircularProgress';
import IconButton from '@mui/joy/IconButton';
import Sheet from '@mui/joy/Sheet';
import Table from '@mui/joy/Table';
import Tooltip from '@mui/joy/Tooltip';
import Typography from '@mui/joy/Typography';

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function ReportsPage() {
  const [reports, setReports]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [deleting, setDeleting]   = useState(new Set());

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/reports');
      const data = await res.json();
      setReports(data);
    } catch {
      // ignore — table stays empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  async function handleDelete(id) {
    if (!window.confirm('Delete this report?')) return;
    setDeleting((prev) => new Set(prev).add(id));
    try {
      await fetch(`/api/reports/${id}`, { method: 'DELETE' });
      setReports((prev) => prev.filter((r) => r.id !== id));
      if (selectedId === id) setSelectedId(null);
    } finally {
      setDeleting((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  const selectedReport = reports.find((r) => r.id === selectedId) ?? null;

  return (
    <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
      {/* Page header */}
      <Box sx={{ mb: 3 }}>
        <Typography level="h3">Reports</Typography>
        <Typography level="body-sm" textColor="neutral.500">
          Saved output tables from your AI analyses.
        </Typography>
      </Box>

      {/* Reports list */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : reports.length === 0 ? (
        <Sheet variant="outlined" sx={{ borderRadius: 'md', p: 6, textAlign: 'center' }}>
          <Typography level="body-md" textColor="neutral.500">
            No reports yet. Save a report from a chat response to see it here.
          </Typography>
        </Sheet>
      ) : (
        <Sheet variant="outlined" sx={{ borderRadius: 'md', overflow: 'auto' }}>
          <Table
            hoverRow
            stickyHeader
            sx={{
              '& th': { bgcolor: 'background.surface' },
              '& tbody tr': { cursor: 'pointer' },
              '& tbody tr.report-row-selected td': { bgcolor: 'primary.softBg' },
            }}
          >
            <thead>
              <tr>
                <th>Title</th>
                <th style={{ width: 180 }}>Source</th>
                <th style={{ width: 80 }}>Rows</th>
                <th style={{ width: 160 }}>Created</th>
                <th style={{ width: 80 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelectedId(r.id === selectedId ? null : r.id)}
                  className={r.id === selectedId ? 'report-row-selected' : ''}
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
                      <Typography level="body-xs" textColor="neutral.400">—</Typography>
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
                        onClick={() => handleDelete(r.id)}
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
      )}

      {/* Detail panel */}
      {selectedReport && (
        <Sheet
          variant="outlined"
          sx={{ borderRadius: 'md', overflow: 'auto', height: 320, mt: 2, display: 'flex', flexDirection: 'column' }}
        >
          {/* Panel header */}
          <Box
            sx={{
              px: 2,
              py: 1,
              borderBottom: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
              bgcolor: 'background.surface',
            }}
          >
            <Typography level="title-sm">{selectedReport.title}</Typography>
            <IconButton size="sm" variant="plain" color="neutral" onClick={() => setSelectedId(null)}>
              <CloseIcon />
            </IconButton>
          </Box>

          {/* Data table */}
          <Box sx={{ overflow: 'auto', flex: 1 }}>
            <Table hoverRow stickyHeader sx={{ '& th': { bgcolor: 'background.surface' } }}>
              <thead>
                <tr>
                  {selectedReport.columns.map((col, i) => (
                    <th key={i}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedReport.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci}>
                        <Typography level="body-sm">{cell}</Typography>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Table>
          </Box>
        </Sheet>
      )}
    </Box>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default ReportsPage;
