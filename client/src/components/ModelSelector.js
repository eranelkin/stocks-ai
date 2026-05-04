import { useEffect, useState } from 'react';
import Box from '@mui/joy/Box';
import Chip from '@mui/joy/Chip';
import Option from '@mui/joy/Option';
import Select from '@mui/joy/Select';
import Tooltip from '@mui/joy/Tooltip';

function ModelSelector({ value = [], onChange, refreshTrigger = 0 }) {
  const [models, setModels] = useState([]);

  useEffect(() => {
    fetch('/api/ai/models')
      .then((r) => r.json())
      .then((data) => {
        setModels(data);
        if (value.length === 0) {
          try {
            const saved = JSON.parse(localStorage.getItem('selectedModels') || '[]');
            const valid = saved.filter((id) => data.some((m) => m.id === id && m.ready));
            if (valid.length > 0) { onChange(valid); return; }
          } catch {}
          const def = data.find((m) => m.default && m.ready) || data.find((m) => m.ready);
          if (def) onChange([def.id]);
        }
      })
      .catch(() => {});
  }, [refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  if (models.length === 0) return null;

  return (
    <Select
      multiple
      size="sm"
      value={value}
      onChange={(_, v) => onChange(v)}
      placeholder="Select model…"
      renderValue={(selected) => (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {selected.map((opt) => (
            <Chip key={opt.value} size="sm" variant="soft" color="primary">
              {opt.label}
            </Chip>
          ))}
        </Box>
      )}
      sx={{ minWidth: 160 }}
    >
      {models.map((m) => (
        <Tooltip key={m.id} title={m.ready ? '' : 'API key not configured'} placement="left">
          <Option value={m.id} disabled={!m.ready}>
            {m.name}{!m.ready && ' ⚠'}
          </Option>
        </Tooltip>
      ))}
    </Select>
  );
}

export default ModelSelector;
