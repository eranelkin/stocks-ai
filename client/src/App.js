import { useState } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { CssVarsProvider, useColorScheme } from '@mui/joy/styles';
import CssBaseline from '@mui/joy/CssBaseline';
import Box from '@mui/joy/Box';
import IconButton from '@mui/joy/IconButton';
import Tooltip from '@mui/joy/Tooltip';
import Typography from '@mui/joy/Typography';
import ChatWindow from './components/ChatWindow';
import ModelSelector from './components/ModelSelector';
import ServerStatus from './components/ServerStatus';
import MarketPage from './pages/MarketPage';
import ModelsPage from './pages/ModelsPage';
import PromptsPage from './pages/PromptsPage';
import ReportsPage from './pages/ReportsPage';

function DarkModeToggle() {
  const { mode, setMode } = useColorScheme();
  return (
    <IconButton
      size="sm"
      variant="plain"
      color="neutral"
      onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
      title="Toggle dark mode"
    >
      {mode === 'dark' ? <SunIcon /> : <MoonIcon />}
    </IconButton>
  );
}

function NavTab({ to, children }) {
  return (
    <NavLink to={to} style={{ textDecoration: 'none' }}>
      {({ isActive }) => (
        <Box
          sx={{
            px: 1.5,
            py: 0.5,
            borderRadius: 'sm',
            cursor: 'pointer',
            fontSize: 'sm',
            fontWeight: isActive ? 'lg' : 'md',
            color: isActive ? 'primary.plainColor' : 'text.secondary',
            bgcolor: isActive ? 'primary.softBg' : 'transparent',
            '&:hover': { bgcolor: 'neutral.softBg' },
            transition: 'background 0.15s',
          }}
        >
          {children}
        </Box>
      )}
    </NavLink>
  );
}

function App() {
  const [selectedModel, setSelectedModel] = useState(
    () => localStorage.getItem('selectedModel') || ''
  );

  const handleModelChange = (model) => {
    setSelectedModel(model);
    localStorage.setItem('selectedModel', model);
  };
  const [chatKey, setChatKey] = useState(0);
  const [modelsVersion, setModelsVersion] = useState(0);

  return (
    <CssVarsProvider defaultMode="dark">
      <CssBaseline />
      <Box
        sx={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.body',
        }}
      >
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2.5,
            py: 1.25,
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.surface',
            flexShrink: 0,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography level="title-md" fontWeight="lg">
              Stocks AI
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <NavTab to="/chat">Chat</NavTab>
              <NavTab to="/prompts">Prompts</NavTab>
              <NavTab to="/reports">Reports</NavTab>
              <NavTab to="/market">Market</NavTab>
              <NavTab to="/models">Models</NavTab>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <ModelSelector value={selectedModel} onChange={handleModelChange} refreshTrigger={modelsVersion} />
            <ServerStatus />
            <Tooltip title="Clear chat" placement="bottom">
              <IconButton
                size="sm"
                variant="plain"
                color="neutral"
                onClick={() => setChatKey((k) => k + 1)}
              >
                <ClearIcon />
              </IconButton>
            </Tooltip>
            <DarkModeToggle />
          </Box>
        </Box>

        {/* Pages */}
        <Routes>
          <Route path="/" element={<Navigate to="/prompts" replace />} />
          <Route
            path="/chat"
            element={<ChatWindow key={chatKey} selectedModel={selectedModel} />}
          />
          <Route path="/prompts" element={<PromptsPage selectedModel={selectedModel} />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/market" element={<MarketPage selectedModel={selectedModel} />} />
          <Route path="/models" element={<ModelsPage onModelsChanged={() => setModelsVersion((v) => v + 1)} />} />
        </Routes>
      </Box>
    </CssVarsProvider>
  );
}

function ClearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79zM4 10.5H1v2h3zm9-9.95h-2V3.5h2zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79zM20 10.5v2h3v-2zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41z" />
    </svg>
  );
}

export default App;
