import { useEffect, useState } from 'react';
import Select from '@mui/joy/Select';
import Option from '@mui/joy/Option';
import Tooltip from '@mui/joy/Tooltip';

function ModelSelector({ value, onChange, refreshTrigger = 0 }) {
  const [models, setModels] = useState([]);

  useEffect(() => {
    fetch('/api/ai/models')
      .then((r) => r.json())
      .then((data) => {
        setModels(data);
        if (!value) {
          const def = data.find((m) => m.default) ?? data[0];
          if (def) onChange(def.id);
        }
      })
      .catch(() => {});
  }, [refreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  if (models.length === 0) return null;

  return (
    <Select
      size="sm"
      value={value ?? ''}
      onChange={(_, v) => onChange(v)}
      sx={{ minWidth: 160 }}
    >
      {models.map((m) => (
        <Tooltip
          key={m.id}
          title={m.ready ? '' : 'API key not configured'}
          placement="left"
        >
          <Option value={m.id} disabled={!m.ready}>
            {m.name}
            {!m.ready && ' ⚠'}
          </Option>
        </Tooltip>
      ))}
    </Select>
  );
}

export default ModelSelector;
