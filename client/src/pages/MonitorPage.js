import { useCallback, useEffect, useRef, useState } from 'react';
import Box from '@mui/joy/Box';
import Chip from '@mui/joy/Chip';
import IconButton from '@mui/joy/IconButton';
import Option from '@mui/joy/Option';
import Select from '@mui/joy/Select';
import Sheet from '@mui/joy/Sheet';
import Switch from '@mui/joy/Switch';
import Table from '@mui/joy/Table';
import Tooltip from '@mui/joy/Tooltip';
import Typography from '@mui/joy/Typography';

const REFRESH_MS = 15_000;

function StatusDot({ ok, label }) {
  return (
    <Chip
      size="sm"
      variant="soft"
      color={ok === null ? 'neutral' : ok ? 'success' : 'danger'}
      startDecorator={
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: ok === null ? 'neutral.400' : ok ? 'success.400' : 'danger.400',
          }}
        />
      }
    >
      {label}: {ok === null ? 'checking…' : ok ? 'online' : 'offline'}
    </Chip>
  );
}

function StatCard({ label, value, color }) {
  return (
    <Sheet variant="soft" sx={{ px: 2, py: 1.5, borderRadius: 'sm', minWidth: 120 }}>
      <Typography level="body-xs" textColor="text.secondary">{label}</Typography>
      <Typography level="title-lg" textColor={color || 'text.primary'}>
        {value ?? '—'}
      </Typography>
    </Sheet>
  );
}

function durationColor(ms) {
  if (ms == null) return 'text.secondary';
  if (ms < 3000) return 'success.plainColor';
  if (ms < 10000) return 'warning.plainColor';
  return 'danger.plainColor';
}

function fmtMs(ms) {
  if (ms == null) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function fmtTs(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return ts;
  }
}

function fmtDate(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleDateString();
  } catch {
    return ts;
  }
}

export default function MonitorPage() {
  const [serverOk, setServerOk] = useState(null);
  const [aiOk, setAiOk] = useState(null);
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [sortCol, setSortCol] = useState('ts');
  const [sortDir, setSortDir] = useState('desc');
  const [modelColWidth, setModelColWidth] = useState(120);
  const timerRef = useRef(null);

  const checkHealth = useCallback(async () => {
    try {
      const r = await fetch('/api/health');
      setServerOk(r.ok);
    } catch {
      setServerOk(false);
    }
    try {
      const r = await fetch('/api/ai/health');
      setAiOk(r.ok);
    } catch {
      setAiOk(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams({ limit: 200 });
    if (typeFilter) params.set('type', typeFilter);
    if (modelFilter) params.set('model_id', modelFilter);

    try {
      const [logsRes, statsRes] = await Promise.all([
        fetch(`/api/ai/logs?${params}`),
        fetch('/api/ai/logs/stats'),
      ]);
      if (logsRes.ok) setLogs(await logsRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch {}
  }, [typeFilter, modelFilter]);

  const refresh = useCallback(async () => {
    await Promise.all([checkHealth(), fetchData()]);
  }, [checkHealth, fetchData]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [autoRefresh, refresh]);

  async function clearLogs() {
    setClearing(true);
    try {
      await fetch('/api/ai/logs', { method: 'DELETE' });
      setLogs([]);
      setStats(null);
    } finally {
      setClearing(false);
    }
  }

  const uniqueModels = [...new Set(logs.map((l) => l.model_id).filter(Boolean))];

  function startModelResize(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = modelColWidth;
    function onMouseMove(e) {
      setModelColWidth(Math.max(60, startWidth + e.clientX - startX));
    }
    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function handleSort(col) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  }

  const dateThreshold = dateFilter !== 'all'
    ? Date.now() - { '1d': 1, '7d': 7, '30d': 30 }[dateFilter] * 864e5
    : null;

  const sortedLogs = [...logs]
    .filter((l) => !dateThreshold || new Date(l.ts).getTime() >= dateThreshold)
    .sort((a, b) => {
    let av = a[sortCol];
    let bv = b[sortCol];
    if (typeof av === 'string' || sortCol === 'ts') {
      av = av ?? '';
      bv = bv ?? '';
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    av = av ?? -1;
    bv = bv ?? -1;
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  return (
    <Box sx={{ p: 2.5, overflow: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Health */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography level="title-sm" sx={{ mr: 1 }}>Services</Typography>
        <StatusDot ok={serverOk} label="server" />
        <StatusDot ok={aiOk} label="ai-service" />
      </Box>

      {/* Stats */}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        <StatCard label="Requests (24h)" value={stats?.total_24h} />
        <StatCard
          label="Errors (24h)"
          value={stats?.error_24h}
          color={stats?.error_24h > 0 ? 'danger.plainColor' : undefined}
        />
        <StatCard label="Avg search latency" value={stats?.avg_search_ms != null ? fmtMs(stats.avg_search_ms) : null} />
        <StatCard label="Slowest model" value={stats?.slowest_model} />
      </Box>

      {/* Filters + controls */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Select
          size="sm"
          placeholder="All types"
          value={typeFilter || null}
          onChange={(_, v) => setTypeFilter(v || '')}
          sx={{ minWidth: 140 }}
        >
          <Option value="">All types</Option>
          <Option value="chat">chat</Option>
          <Option value="search_chat">search_chat</Option>
          <Option value="probe">probe</Option>
        </Select>

        <Select
          size="sm"
          placeholder="All models"
          value={modelFilter || null}
          onChange={(_, v) => setModelFilter(v || '')}
          sx={{ minWidth: 160 }}
        >
          <Option value="">All models</Option>
          {uniqueModels.map((m) => (
            <Option key={m} value={m}>{m}</Option>
          ))}
        </Select>

        <Select
          size="sm"
          value={dateFilter}
          onChange={(_, v) => setDateFilter(v ?? 'all')}
          sx={{ minWidth: 130 }}
        >
          <Option value="all">All time</Option>
          <Option value="1d">Last day</Option>
          <Option value="7d">Last 7 days</Option>
          <Option value="30d">Last month</Option>
        </Select>

        <Box sx={{ ml: 'auto', display: 'flex', gap: 1, alignItems: 'center' }}>
          <Typography level="body-sm" textColor="text.secondary">Auto-refresh</Typography>
          <Switch size="sm" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          <Tooltip title="Refresh now" placement="bottom">
            <IconButton size="sm" variant="plain" color="neutral" onClick={refresh}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Clear all logs" placement="bottom">
            <IconButton
              size="sm"
              variant="plain"
              color="danger"
              loading={clearing}
              onClick={clearLogs}
            >
              <TrashIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Log table */}
      <Sheet variant="outlined" sx={{ borderRadius: 'sm', overflow: 'auto', flex: 1 }}>
        <Table size="sm" stickyHeader hoverRow>
          <thead>
            <tr>
              <th style={{ width: 80, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} onClick={() => handleSort('ts')}>
                Date <SortIcon active={sortCol === 'ts'} dir={sortDir} />
              </th>
              <th style={{ width: 80 }}>Time</th>
              <th style={{ width: 90, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} onClick={() => handleSort('type')}>
                Type <SortIcon active={sortCol === 'type'} dir={sortDir} />
              </th>
              <th style={{ width: modelColWidth, minWidth: modelColWidth, maxWidth: modelColWidth, position: 'relative', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} onClick={() => handleSort('model_id')}>
                Model <SortIcon active={sortCol === 'model_id'} dir={sortDir} />
                <span
                  onMouseDown={startModelResize}
                  onClick={(e) => e.stopPropagation()}
                  style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'col-resize' }}
                />
              </th>
              <th style={{ width: 70, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} onClick={() => handleSort('status')}>
                Status <SortIcon active={sortCol === 'status'} dir={sortDir} />
              </th>
              <th style={{ width: 80, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} onClick={() => handleSort('duration_ms')}>
                Duration <SortIcon active={sortCol === 'duration_ms'} dir={sortDir} />
              </th>
              <th>Search query</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: 'var(--joy-palette-text-tertiary)' }}>
                  No logs yet
                </td>
              </tr>
            )}
            {sortedLogs.map((row) => (
              <tr
                key={row.id}
                style={row.status === 'error' ? { background: 'var(--joy-palette-danger-softBg)' } : undefined}
              >
                <td>
                  <Typography level="body-xs" noWrap>{fmtDate(row.ts)}</Typography>
                </td>
                <td>
                  <Typography level="body-xs" noWrap>{fmtTs(row.ts)}</Typography>
                </td>
                <td>
                  <Chip size="sm" variant="soft" color={row.type === 'search_chat' ? 'primary' : 'neutral'}>
                    {row.type}
                  </Chip>
                </td>
                <td>
                  <Typography level="body-xs" noWrap>{row.model_id || '—'}</Typography>
                </td>
                <td>
                  <Chip
                    size="sm"
                    variant="soft"
                    color={row.status === 'ok' ? 'success' : 'danger'}
                  >
                    {row.status}
                  </Chip>
                </td>
                <td>
                  <Typography level="body-xs" textColor={durationColor(row.duration_ms)}>
                    {fmtMs(row.duration_ms)}
                  </Typography>
                </td>
                <td>
                  <Typography level="body-xs" sx={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.search_query || '—'}
                  </Typography>
                </td>
                <td>
                  <Typography level="body-xs" textColor="danger.plainColor" sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.error_msg || ''}
                  </Typography>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Sheet>
    </Box>
  );
}

function SortIcon({ active, dir }) {
  return (
    <span style={{ marginLeft: 2, opacity: active ? 1 : 0.3, fontSize: 10 }}>
      {!active || dir === 'asc' ? '▲' : '▼'}
    </span>
  );
}

function RefreshIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}
