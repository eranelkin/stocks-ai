import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import Chip from '@mui/joy/Chip';
import DialogActions from '@mui/joy/DialogActions';
import DialogContent from '@mui/joy/DialogContent';
import DialogTitle from '@mui/joy/DialogTitle';
import FormControl from '@mui/joy/FormControl';
import FormHelperText from '@mui/joy/FormHelperText';
import FormLabel from '@mui/joy/FormLabel';
import Input from '@mui/joy/Input';
import LinearProgress from '@mui/joy/LinearProgress';
import Modal from '@mui/joy/Modal';
import ModalClose from '@mui/joy/ModalClose';
import ModalDialog from '@mui/joy/ModalDialog';
import Typography from '@mui/joy/Typography';

import { parseMarkdownTable } from '../utils/parseMarkdownTable';
import { streamChat } from '../utils/streamChat';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractList(jsonContent) {
  const parsed = JSON.parse(jsonContent);
  if (Array.isArray(parsed)) return parsed;
  for (const val of Object.values(parsed)) {
    if (Array.isArray(val)) return val;
  }
  throw new Error('No array found in the JSON attachment.');
}

function isMetaRow(row) {
  return row.some((cell) =>
    /\(\s*(?:additional|\d+\s+more)\s+\d*\s*stocks?/i.test(cell) ||
    /^\(.*(?:next\s+batch|next\s+chunk|continu|will\s+be\s+process)/i.test(cell)
  );
}

function mergeTables(tables) {
  const valid = tables.filter(Boolean);
  if (valid.length === 0) return null;
  const columns = valid[0].columns;
  const rows = valid.flatMap((t) => t.rows).filter((r) => !isMetaRow(r));
  return { columns, rows };
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function deriveReportTitle(promptTitle) {
  const date = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${promptTitle} — Batch — ${date}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BatchRunModal({ open, onClose, prompt, selectedModel }) {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const abortRef = useRef(null);

  const [chunkSize, setChunkSize]       = useState(5);
  const [chunkSizeError, setChunkSizeError] = useState('');
  const [overrideJson, setOverrideJson] = useState(null); // replaces saved JSON for this run
  const [phase, setPhase]               = useState('idle');
  const [progress, setProgress]         = useState({ current: 0, total: 0, label: '' });
  const [streamPreview, setStreamPreview] = useState('');
  const [errorMsg, setErrorMsg]         = useState('');
  const [savedTitle, setSavedTitle]     = useState('');

  useEffect(() => {
    if (open) {
      setPhase('idle');
      setChunkSize(5);
      setChunkSizeError('');
      setOverrideJson(null);
      setProgress({ current: 0, total: 0, label: '' });
      setStreamPreview('');
      setErrorMsg('');
      setSavedTitle('');
    }
  }, [open]);

  // The JSON source: override takes priority over the saved attachment
  const savedJson = prompt?.attachments?.find(
    (a) => a.name.endsWith('.json') || a.mime_type === 'application/json'
  ) ?? null;
  const activeJson = overrideJson ?? savedJson;

  // Context-only attachments (non-JSON) sent with every chunk
  const contextAttachments = prompt?.attachments?.filter((a) => a !== savedJson) ?? [];

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () =>
      setOverrideJson({ name: file.name, content: reader.result, mime_type: 'application/json' });
    reader.readAsText(file);
  }

  function handleCancel() {
    abortRef.current?.abort();
    setPhase('idle');
  }

  async function handleStart() {
    const size = parseInt(chunkSize, 10);
    if (!size || size < 1) { setChunkSizeError('Must be at least 1'); return; }
    setChunkSizeError('');

    if (!activeJson) {
      setErrorMsg('No JSON file found. Upload a JSON file containing a list of items.');
      setPhase('error');
      return;
    }

    let stocksList;
    try {
      stocksList = extractList(activeJson.content);
    } catch (e) {
      setErrorMsg(`Could not parse JSON: ${e.message}`);
      setPhase('error');
      return;
    }

    const chunks = chunkArray(stocksList, size);
    const total = chunks.length;
    setPhase('running');
    setProgress({ current: 0, total, label: 'Starting…' });

    const controller = new AbortController();
    abortRef.current = controller;
    const collectedTables = [];

    try {
      for (let i = 0; i < chunks.length; i++) {
        if (controller.signal.aborted) break;

        const chunkItems = chunks[i];
        setProgress({ current: i + 1, total, label: `Chunk ${i + 1} of ${total} (${chunkItems.length} items)` });
        setStreamPreview('');

        const chunkAttachment = {
          name: `chunk_${i + 1}.json`,
          content: JSON.stringify(chunkItems, null, 2),
          mime_type: 'application/json',
        };

        const fullText = await streamChat({
          model: selectedModel,
          messages: [{ role: 'user', content: prompt.text }],
          attachments: [...contextAttachments, chunkAttachment],
          signal: controller.signal,
          onToken: (token) =>
            setStreamPreview((prev) => {
              const next = prev + token;
              return next.length > 600 ? next.slice(-600) : next;
            }),
        });

        const table = parseMarkdownTable(fullText);
        if (table) collectedTables.push(table);
      }

      if (controller.signal.aborted) { setPhase('idle'); return; }

      const merged = mergeTables(collectedTables);
      if (!merged) {
        setErrorMsg('No tables were found in any AI response. Make sure your prompt produces a table with the correct markers.');
        setPhase('error');
        return;
      }

      const title = deriveReportTitle(prompt.title);
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, columns: merged.columns, rows: merged.rows, source_prompt_title: prompt.title }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to save report');
      }

      setSavedTitle(title);
      setPhase('done');
    } catch (err) {
      if (err.name === 'AbortError') { setPhase('idle'); return; }
      setErrorMsg(err.message);
      setPhase('error');
    }
  }

  const progressPct = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  return (
    <Modal open={open} onClose={phase === 'running' ? undefined : onClose}>
      <ModalDialog sx={{ width: { xs: '95vw', sm: 520 } }}>
        {phase !== 'running' && <ModalClose />}
        <DialogTitle>Batch Run — {prompt?.title}</DialogTitle>

        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>

          {/* ── IDLE ── */}
          {phase === 'idle' && (
            <>
              {/* JSON file selector */}
              <Box>
                <Typography level="body-xs" fontWeight="md" textColor="neutral.500" sx={{ mb: 0.75 }}>
                  DATA FILE (JSON)
                </Typography>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />

                {activeJson ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip
                      size="sm"
                      variant="soft"
                      color={overrideJson ? 'success' : 'primary'}
                      endDecorator={
                        overrideJson && (
                          <Box
                            component="span"
                            onClick={() => setOverrideJson(null)}
                            sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: 0.7, '&:hover': { opacity: 1 } }}
                          >
                            <SmallCloseIcon />
                          </Box>
                        )
                      }
                    >
                      {activeJson.name}
                      {overrideJson && ' (replaced)'}
                    </Chip>
                    <Button size="sm" variant="plain" color="neutral" onClick={() => fileInputRef.current?.click()}>
                      Replace file
                    </Button>
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography level="body-sm" textColor="warning.400">No JSON file attached.</Typography>
                    <Button size="sm" variant="outlined" color="neutral" onClick={() => fileInputRef.current?.click()}>
                      Upload file
                    </Button>
                  </Box>
                )}
              </Box>

              {/* Chunk size */}
              <FormControl error={!!chunkSizeError}>
                <FormLabel>Chunk size</FormLabel>
                <Input
                  type="number"
                  value={chunkSize}
                  onChange={(e) => { setChunkSize(e.target.value); setChunkSizeError(''); }}
                  slotProps={{ input: { min: 1, max: 100 } }}
                  sx={{ width: 120 }}
                />
                {chunkSizeError
                  ? <FormHelperText>{chunkSizeError}</FormHelperText>
                  : <FormHelperText>Items per AI call (default 5)</FormHelperText>
                }
              </FormControl>
            </>
          )}

          {/* ── RUNNING ── */}
          {phase === 'running' && (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography level="body-sm" fontWeight="md">{progress.label}</Typography>
                <Chip size="sm" variant="soft" color="primary">{progress.current}/{progress.total}</Chip>
              </Box>
              <LinearProgress determinate value={progressPct} sx={{ borderRadius: 'sm' }} />
              {streamPreview && (
                <Box sx={{ bgcolor: 'background.level1', borderRadius: 'sm', p: 1.5, maxHeight: 160, overflow: 'hidden' }}>
                  <Typography level="body-xs" sx={{ whiteSpace: 'pre-wrap', opacity: 0.75, fontFamily: 'monospace' }}>
                    {streamPreview}
                  </Typography>
                </Box>
              )}
            </>
          )}

          {/* ── DONE ── */}
          {phase === 'done' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Typography level="body-sm" color="success" fontWeight="md">All chunks processed. Report saved.</Typography>
              <Typography level="body-sm" textColor="neutral.500">"{savedTitle}"</Typography>
            </Box>
          )}

          {/* ── ERROR ── */}
          {phase === 'error' && (
            <Typography level="body-sm" color="danger">{errorMsg}</Typography>
          )}

        </DialogContent>

        <DialogActions>
          {phase === 'idle' && (
            <>
              <Button variant="plain" color="neutral" onClick={onClose}>Cancel</Button>
              <Button onClick={handleStart} disabled={!activeJson}>Start Batch</Button>
            </>
          )}
          {phase === 'running' && (
            <Button variant="outlined" color="danger" onClick={handleCancel}>Cancel</Button>
          )}
          {phase === 'done' && (
            <>
              <Button variant="plain" color="neutral" onClick={onClose}>Close</Button>
              <Button onClick={() => { onClose(); navigate('/reports'); }}>View in Reports</Button>
            </>
          )}
          {phase === 'error' && (
            <>
              <Button variant="plain" color="neutral" onClick={onClose}>Close</Button>
              <Button onClick={() => setPhase('idle')}>Try Again</Button>
            </>
          )}
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}

function SmallCloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
