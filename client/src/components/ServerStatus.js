import { useEffect, useState } from 'react';
import Chip from '@mui/joy/Chip';
import CircularProgress from '@mui/joy/CircularProgress';
import Typography from '@mui/joy/Typography';
import Stack from '@mui/joy/Stack';

function ServerStatus() {
  const [status, setStatus] = useState('loading'); // 'loading' | 'ok' | 'error'
  const [info, setInfo] = useState(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        setInfo(data);
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, []);

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography level="body-sm" textColor="neutral.400">
        Server
      </Typography>
      {status === 'loading' && <CircularProgress size="sm" />}
      {status === 'ok' && (
        <Chip color="success" size="sm" variant="soft">
          {info?.status ?? 'ok'}
        </Chip>
      )}
      {status === 'error' && (
        <Chip color="danger" size="sm" variant="soft">
          unreachable
        </Chip>
      )}
    </Stack>
  );
}

export default ServerStatus;
