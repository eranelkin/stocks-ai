import { CssVarsProvider } from '@mui/joy/styles';
import CssBaseline from '@mui/joy/CssBaseline';
import Box from '@mui/joy/Box';
import Typography from '@mui/joy/Typography';
import ServerStatus from './components/ServerStatus';

function App() {
  return (
    <CssVarsProvider>
      <CssBaseline />
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          bgcolor: 'background.body',
        }}
      >
        <Typography level="h2">Stocks AI</Typography>
        <Typography level="body-md" textColor="neutral.500">
          AI-powered stock analysis platform
        </Typography>
        <ServerStatus />
      </Box>
    </CssVarsProvider>
  );
}

export default App;
