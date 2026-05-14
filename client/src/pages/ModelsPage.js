import { useCallback, useEffect, useState } from 'react';
import Box from '@mui/joy/Box';
import Button from '@mui/joy/Button';
import Chip from '@mui/joy/Chip';
import CircularProgress from '@mui/joy/CircularProgress';
import Switch from '@mui/joy/Switch';
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
import Tooltip from '@mui/joy/Tooltip';
import Typography from '@mui/joy/Typography';

// ─── Modal ────────────────────────────────────────────────────────────────────

const EMPTY_FORM = { id: '', name: '', provider: 'openai_compatible', base_url: '', api_key: '' };

function ModelModal({ open, editing, onClose, onSaved }) {
  const isEdit = !!editing;
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(editing
      ? { id: editing.id, name: editing.name, provider: editing.provider, base_url: editing.base_url, api_key: '' }
      : EMPTY_FORM
    );
    setErrors({});
    setServerError('');
  }, [open, editing]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: '' }));
  }

  function validate() {
    const e = {};
    if (!form.id.trim())       e.id       = 'Required';
    if (!form.name.trim())     e.name     = 'Required';
    if (!form.base_url.trim()) e.base_url = 'Required';
    if (!isEdit && !form.api_key.trim()) e.api_key = 'Required for new models';
    return e;
  }

  async function handleSubmit() {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }

    setSaving(true);
    setServerError('');
    try {
      const body = isEdit
        ? {
            name: form.name.trim(),
            provider: form.provider.trim() || 'openai_compatible',
            base_url: form.base_url.trim(),
            ...(form.api_key.trim() ? { api_key: form.api_key } : {}),
          }
        : {
            id: form.id.trim(),
            name: form.name.trim(),
            provider: form.provider.trim() || 'openai_compatible',
            base_url: form.base_url.trim(),
            api_key: form.api_key,
          };

      const url = isEdit ? `/api/ai/models/${editing.id}` : '/api/ai/models';
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? `Error ${res.status}`);
      }
      const saved = await res.json();
      onSaved(saved, isEdit);
    } catch (err) {
      setServerError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ width: { xs: '95vw', sm: 520 } }}>
        <ModalClose />
        <DialogTitle>{isEdit ? 'Edit Model' : 'Add Model'}</DialogTitle>

        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 0.5 }}>
          {serverError && (
            <Typography level="body-sm" color="danger">{serverError}</Typography>
          )}

          <FormControl error={!!errors.id}>
            <FormLabel>Model ID</FormLabel>
            <Input
              value={form.id}
              onChange={(e) => set('id', e.target.value)}
              placeholder="e.g. gpt-4o, llama-3.3-70b-versatile"
              disabled={isEdit}
            />
            {errors.id && <FormHelperText>{errors.id}</FormHelperText>}
          </FormControl>

          <FormControl error={!!errors.name}>
            <FormLabel>Display Name</FormLabel>
            <Input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. GPT-4o"
            />
            {errors.name && <FormHelperText>{errors.name}</FormHelperText>}
          </FormControl>

          <FormControl>
            <FormLabel>Provider</FormLabel>
            <Input
              value={form.provider}
              onChange={(e) => set('provider', e.target.value)}
              placeholder="openai_compatible"
            />
          </FormControl>

          <FormControl error={!!errors.base_url}>
            <FormLabel>Base URL</FormLabel>
            <Input
              value={form.base_url}
              onChange={(e) => set('base_url', e.target.value)}
              placeholder="https://api.groq.com/openai/v1"
            />
            {errors.base_url && <FormHelperText>{errors.base_url}</FormHelperText>}
          </FormControl>

          <FormControl error={!!errors.api_key}>
            <FormLabel>API Key</FormLabel>
            <Input
              type="password"
              value={form.api_key}
              onChange={(e) => set('api_key', e.target.value)}
              placeholder={isEdit ? 'Leave blank to keep existing key' : 'Paste your API key'}
            />
            {errors.api_key
              ? <FormHelperText>{errors.api_key}</FormHelperText>
              : isEdit && <FormHelperText>Stored securely — never shown after saving.</FormHelperText>
            }
          </FormControl>
        </DialogContent>

        <DialogActions>
          <Button variant="plain" color="neutral" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            {isEdit ? 'Save Changes' : 'Add Model'}
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ModelsPage({ onModelsChanged }) {
  const [models, setModels]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(new Set());
  const [toggling, setToggling] = useState(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [probing, setProbing] = useState(false);
  const [probeResults, setProbeResults] = useState(null);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/models');
      const data = await res.json();
      setModels(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  function openAdd() { setEditing(null); setModalOpen(true); }
  function openEdit(model) { setEditing(model); setModalOpen(true); }
  function closeModal() { setModalOpen(false); }

  function handleSaved(saved, isEdit) {
    setModels((prev) =>
      isEdit
        ? prev.map((m) => (m.id === saved.id ? saved : m))
        : [...prev, saved]
    );
    setModalOpen(false);
    onModelsChanged?.();
  }

  async function handleProbe() {
    setProbing(true);
    setProbeResults(null);
    try {
      const res = await fetch('/api/ai/models/probe-web-search', { method: 'POST' });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setProbeResults(data.results);
      await fetchModels();
      onModelsChanged?.();
    } catch (err) {
      alert(`Probe failed: ${err.message}`);
    } finally {
      setProbing(false);
    }
  }

  async function handleToggleActive(id, newActive) {
    setToggling((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/ai/models/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newActive }),
      });
      if (!res.ok) throw new Error('Failed to update');
      const saved = await res.json();
      setModels((prev) => prev.map((m) => (m.id === saved.id ? saved : m)));
      onModelsChanged?.();
    } finally {
      setToggling((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this model?')) return;
    setDeleting((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/ai/models/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? `Delete failed (${res.status})`);
      }
      setModels((prev) => prev.filter((m) => m.id !== id));
      onModelsChanged?.();
    } finally {
      setDeleting((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  }

  return (
    <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography level="h3">Models</Typography>
          <Typography level="body-sm" textColor="neutral.500">
            Configure AI providers and API keys. Keys are stored securely and never exposed.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            color="neutral"
            size="sm"
            loading={probing}
            onClick={handleProbe}
            startDecorator={<SearchIcon />}
          >
            Probe Web Search
          </Button>
          <Button startDecorator={<PlusIcon />} onClick={openAdd} size="sm">
            Add Model
          </Button>
        </Box>
      </Box>

      {probeResults && (
        <Sheet variant="soft" color="neutral" sx={{ borderRadius: 'md', p: 2, mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography level="body-sm" fontWeight="lg">Probe Results</Typography>
            <Button size="sm" variant="plain" color="neutral" onClick={() => setProbeResults(null)}>
              Dismiss
            </Button>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {probeResults.map((r) => (
              <Box key={r.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Chip size="sm" color={r.success ? 'success' : 'danger'} variant="soft">
                  {r.success ? 'OK' : 'FAIL'}
                </Chip>
                <Typography level="body-xs" fontFamily="monospace">{r.id}</Typography>
                {r.strategy && (
                  <Chip size="sm" variant="outlined" color="neutral">{r.strategy}</Chip>
                )}
                {r.error && (
                  <Typography level="body-xs" color="danger">{r.error}</Typography>
                )}
              </Box>
            ))}
          </Box>
        </Sheet>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : models.length === 0 ? (
        <Sheet variant="outlined" sx={{ borderRadius: 'md', p: 6, textAlign: 'center' }}>
          <Typography level="body-md" textColor="neutral.500">
            No models configured. Add one to get started.
          </Typography>
        </Sheet>
      ) : (
        <Sheet variant="outlined" sx={{ borderRadius: 'md', overflow: 'auto' }}>
          <Table hoverRow stickyHeader sx={{ '& th': { bgcolor: 'background.surface' } }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Model ID</th>
                <th style={{ width: 160 }}>Provider</th>
                <th>Base URL</th>
                <th style={{ width: 90 }}>Status</th>
                <th style={{ width: 110 }}>Search</th>
                <th style={{ width: 80 }}>Active</th>
                <th style={{ width: 96 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography level="body-sm" fontWeight="lg">{m.name}</Typography>
                      {m.default && (
                        <Chip size="sm" variant="soft" color="primary">default</Chip>
                      )}
                    </Box>
                  </td>
                  <td>
                    <Typography level="body-xs" fontFamily="monospace" textColor="neutral.600">
                      {m.id}
                    </Typography>
                  </td>
                  <td>
                    <Typography level="body-xs" textColor="neutral.500">{m.provider}</Typography>
                  </td>
                  <td>
                    <Typography level="body-xs" textColor="neutral.500"
                      sx={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.base_url || '—'}
                    </Typography>
                  </td>
                  <td>
                    <Chip size="sm" variant="soft" color={m.ready ? 'success' : 'warning'}>
                      {m.ready ? 'Ready' : 'No key'}
                    </Chip>
                  </td>
                  <td>
                    <Chip
                      size="sm"
                      variant="soft"
                      color={m.web_search === 1 ? 'success' : m.web_search === 0 ? 'danger' : 'neutral'}
                    >
                      {m.web_search === 1
                        ? (m.web_search_strategy ?? 'yes')
                        : m.web_search === 0
                        ? 'no'
                        : '?'}
                    </Chip>
                  </td>
                  <td>
                    <Switch
                      size="sm"
                      checked={m.active !== false}
                      disabled={toggling.has(m.id)}
                      onChange={(e) => handleToggleActive(m.id, e.target.checked)}
                    />
                  </td>
                  <td>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title="Edit" placement="top">
                        <IconButton size="sm" variant="plain" color="neutral" onClick={() => openEdit(m)}>
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete" placement="top">
                        <IconButton
                          size="sm"
                          variant="plain"
                          color="danger"
                          loading={deleting.has(m.id)}
                          onClick={() => handleDelete(m.id)}
                        >
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

      <ModelModal
        open={modalOpen}
        editing={editing}
        onClose={closeModal}
        onSaved={handleSaved}
      />
    </Box>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

export default ModelsPage;
