import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BatchRunModal from '../components/BatchRunModal';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import Chip from '@mui/joy/Chip';
import CircularProgress from '@mui/joy/CircularProgress';
import DialogActions from '@mui/joy/DialogActions';
import DialogContent from '@mui/joy/DialogContent';
import DialogTitle from '@mui/joy/DialogTitle';
import FormControl from '@mui/joy/FormControl';
import FormHelperText from '@mui/joy/FormHelperText';
import FormLabel from '@mui/joy/FormLabel';
import IconButton from '@mui/joy/IconButton';
import Input from '@mui/joy/Input';
import Modal from '@mui/joy/Modal';
import ModalClose from '@mui/joy/ModalClose';
import ModalDialog from '@mui/joy/ModalDialog';
import Sheet from '@mui/joy/Sheet';
import Table from '@mui/joy/Table';
import Textarea from '@mui/joy/Textarea';
import Tooltip from '@mui/joy/Tooltip';
import Typography from '@mui/joy/Typography';

const ACCEPTED_TYPES = '.json,.csv,.txt,.md,.xml,.yaml,.yml,.toml,.log';
const MAX_FILE_BYTES = 512 * 1024;

const EMPTY_FORM = { title: '', text: '', attachments: [] };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function truncate(str, n = 100) {
  return str.length > n ? str.slice(0, n) + '…' : str;
}

// ─── File attachment sub-component (reused in the modal form) ─────────────────

function FileAttacher({ attachments, onChange }) {
  const fileInputRef = useRef(null);
  const [fileError, setFileError] = useState('');

  function handleFileChange(e) {
    setFileError('');
    const files = Array.from(e.target.files);
    e.target.value = '';

    const readers = files.map(
      (file) =>
        new Promise((resolve, reject) => {
          if (file.size > MAX_FILE_BYTES) {
            reject(`"${file.name}" exceeds 512 KB.`);
            return;
          }
          const reader = new FileReader();
          reader.onload = () =>
            resolve({ name: file.name, content: reader.result, mime_type: file.type || 'text/plain' });
          reader.onerror = () => reject(`Failed to read "${file.name}".`);
          reader.readAsText(file);
        }),
    );

    Promise.allSettled(readers).then((results) => {
      const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
      const errors = results.filter((r) => r.status === 'rejected').map((r) => r.reason);
      if (errors.length) setFileError(errors.join(' '));

      onChange((prev) => {
        const existing = new Set(prev.map((a) => a.name));
        return [...prev, ...ok.filter((a) => !existing.has(a.name))];
      });
    });
  }

  function remove(name) {
    onChange((prev) => prev.filter((a) => a.name !== name));
  }

  return (
    <Box>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Button
          size="sm"
          variant="outlined"
          color="neutral"
          startDecorator={<PaperclipIcon />}
          onClick={() => fileInputRef.current?.click()}
        >
          Attach file
        </Button>

        {attachments.map((a) => (
          <Chip
            key={a.name}
            size="sm"
            variant="soft"
            color="primary"
            startDecorator={<FileIcon />}
            endDecorator={
              <Box
                component="span"
                onClick={() => remove(a.name)}
                sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: 0.7, '&:hover': { opacity: 1 } }}
              >
                <CloseIcon />
              </Box>
            }
          >
            {a.name}
          </Chip>
        ))}
      </Box>

      {fileError && (
        <Typography level="body-xs" color="danger" sx={{ mt: 0.5 }}>
          {fileError}
        </Typography>
      )}
    </Box>
  );
}

// ─── Add / Edit modal ─────────────────────────────────────────────────────────

function PromptModal({ open, onClose, onSave, initial, saving }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (open) {
      setForm(initial ?? EMPTY_FORM);
      setErrors({});
    }
  }, [open, initial]);

  function validate() {
    const e = {};
    if (!form.title.trim()) e.title = 'Title is required';
    if (!form.text.trim())  e.text  = 'Prompt text is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSave() {
    if (validate()) onSave(form);
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        sx={{ width: { xs: '95vw', sm: 640 }, maxHeight: '90vh', overflow: 'auto' }}
      >
        <ModalClose />
        <DialogTitle>{initial ? 'Edit Prompt' : 'Add Prompt'}</DialogTitle>

        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {/* Title */}
          <FormControl error={!!errors.title}>
            <FormLabel>Title</FormLabel>
            <Input
              placeholder="e.g. AAPL Long Analysis"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              autoFocus
            />
            {errors.title && <FormHelperText>{errors.title}</FormHelperText>}
          </FormControl>

          {/* Prompt text */}
          <FormControl error={!!errors.text} sx={{ flex: 1 }}>
            <FormLabel>Prompt text</FormLabel>
            <Textarea
              minRows={8}
              maxRows={16}
              placeholder="Write your prompt here…"
              value={form.text}
              onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
              sx={{ resize: 'vertical' }}
            />
            {errors.text && <FormHelperText>{errors.text}</FormHelperText>}
          </FormControl>

          {/* File attachments */}
          <FormControl>
            <FormLabel>Attached files</FormLabel>
            <FileAttacher
              attachments={form.attachments}
              onChange={(updater) =>
                setForm((f) => ({ ...f, attachments: typeof updater === 'function' ? updater(f.attachments) : updater }))
              }
            />
          </FormControl>
        </DialogContent>

        <DialogActions>
          <Button variant="plain" color="neutral" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving}>
            Save
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function PromptsPage({ selectedModel }) {
  const navigate = useNavigate();
  const [prompts, setPrompts]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [modalOpen, setModalOpen]   = useState(false);
  const [editing, setEditing]       = useState(null); // null = add mode, object = edit mode
  const [batchPrompt, setBatchPrompt] = useState(null); // prompt being batch-run

  const fetchPrompts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/prompts');
      const data = await res.json();
      setPrompts(data);
    } catch {
      // ignore — table will stay empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPrompts(); }, [fetchPrompts]);

  function openAdd() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(prompt) {
    setEditing(prompt);
    setModalOpen(true);
  }

  function handleRun(prompt) {
    navigate('/chat', {
      state: {
        promptPayload: { text: prompt.text, attachments: prompt.attachments },
        promptTitle: prompt.title,
      },
    });
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this prompt?')) return;
    await fetch(`/api/prompts/${id}`, { method: 'DELETE' });
    setPrompts((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleSave(form) {
    setSaving(true);
    try {
      const isEdit = !!editing;
      const url    = isEdit ? `/api/prompts/${editing.id}` : '/api/prompts';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Save failed');
      }

      const saved = await res.json();

      setPrompts((prev) =>
        isEdit
          ? prev.map((p) => (p.id === saved.id ? saved : p))
          : [saved, ...prev],
      );
      setModalOpen(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
      {/* Page header */}
      <Box sx={{ mb: 3 }}>
        <Typography level="h3">Prompts Manager</Typography>
        <Typography level="body-sm" textColor="neutral.500">
          Save, organise, and reuse your analysis prompts.
        </Typography>
      </Box>

      {/* Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : prompts.length === 0 ? (
        <Sheet
          variant="outlined"
          sx={{ borderRadius: 'md', p: 6, textAlign: 'center', mb: 2 }}
        >
          <Typography level="body-md" textColor="neutral.500">
            No prompts yet. Click <strong>Add Prompt</strong> to create your first one.
          </Typography>
        </Sheet>
      ) : (
        <Sheet variant="outlined" sx={{ borderRadius: 'md', overflow: 'auto', mb: 2 }}>
          <Table
            hoverRow
            stickyHeader
            sx={{ '& th': { bgcolor: 'background.surface' } }}
          >
            <thead>
              <tr>
                <th style={{ width: 180 }}>Title</th>
                <th>Prompt</th>
                <th style={{ width: 160 }}>Files</th>
                <th style={{ width: 160 }}>Created</th>
                <th style={{ width: 160 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {prompts.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Typography level="body-sm" fontWeight="lg">
                      {p.title}
                    </Typography>
                  </td>
                  <td>
                    <Typography level="body-sm" textColor="neutral.600">
                      {truncate(p.text)}
                    </Typography>
                  </td>
                  <td>
                    {p.attachments.length === 0 ? (
                      <Typography level="body-xs" textColor="neutral.400">—</Typography>
                    ) : (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {p.attachments.slice(0, 2).map((a) => (
                          <Chip key={a.name} size="sm" variant="soft" startDecorator={<FileIcon />}>
                            {a.name}
                          </Chip>
                        ))}
                        {p.attachments.length > 2 && (
                          <Chip size="sm" variant="soft" color="neutral">
                            +{p.attachments.length - 2} more
                          </Chip>
                        )}
                      </Box>
                    )}
                  </td>
                  <td>
                    <Typography level="body-xs" textColor="neutral.500">
                      {formatDate(p.created_at)}
                    </Typography>
                  </td>
                  <td>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title="Run in chat" placement="top">
                        <IconButton size="sm" variant="plain" color="primary" onClick={() => handleRun(p)}>
                          <PlayIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Batch run" placement="top">
                        <IconButton size="sm" variant="plain" color="success" onClick={() => setBatchPrompt(p)}>
                          <BatchIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit" placement="top">
                        <IconButton size="sm" variant="plain" color="neutral" onClick={() => openEdit(p)}>
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete" placement="top">
                        <IconButton size="sm" variant="plain" color="danger" onClick={() => handleDelete(p.id)}>
                          <TrashIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Sheet>
      )}

      {/* Add button */}
      <Button startDecorator={<PlusIcon />} onClick={openAdd}>
        Add Prompt
      </Button>

      {/* Add / Edit modal */}
      <PromptModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        initial={editing}
        saving={saving}
      />

      {/* Batch run modal */}
      <BatchRunModal
        open={!!batchPrompt}
        onClose={() => setBatchPrompt(null)}
        prompt={batchPrompt}
        selectedModel={selectedModel}
      />
    </Box>
  );
}

// ─── Inline SVG icons ─────────────────────────────────────────────────────────

function BatchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="4" rx="1" />
      <rect x="2" y="10" width="20" height="4" rx="1" />
      <rect x="2" y="17" width="20" height="4" rx="1" />
      <path d="M18 5l2-2M18 5l2 2" strokeWidth="1.5" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

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

function PaperclipIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default PromptsPage;
