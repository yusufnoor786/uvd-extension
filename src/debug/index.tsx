import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  ThemeProvider, createTheme, CssBaseline, Box, Typography,
  Button, Chip, Divider, Card, CardContent,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import type { LogEntry } from '../types';
import Logger from '../utils/logger';

const LEVEL_COLORS: Record<string, string> = {
  info: '#90CAF9', warn: '#FFE082', error: '#EF9A9A', debug: '#A5D6A7', trace: '#CE93D8',
};

function DebugApp() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [tabUrl, setTabUrl] = useState('');

  useEffect(() => {
    Logger.loadFromStorage().then(setLogs);
    const unsub = Logger.addListener(entry => setLogs(prev => [...prev, entry]));
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]) setTabUrl(tabs[0].url || '');
    });
    return unsub;
  }, []);

  const rescan = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) chrome.runtime.sendMessage({ type: 'RESCAN_PAGE', tabId: tab.id, timestamp: Date.now() });
  };

  const exportLogs = () => {
    const text = Logger.export();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `uvd-logs-${Date.now()}.txt`; a.click();
  };

  const theme = createTheme({ palette: { mode: 'dark', primary: { main: '#6750A4' } } });

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
          <Typography variant="h6" fontWeight={700}>🐛 UVD Debug Panel</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" startIcon={<RefreshIcon />} onClick={rescan}>Re-scan</Button>
            <Button size="small" startIcon={<DownloadIcon />} onClick={exportLogs}>Export Logs</Button>
            <Button size="small" startIcon={<DeleteIcon />} onClick={() => { setLogs([]); Logger.clearStorage(); }}>Clear</Button>
          </Box>
        </Box>

        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="caption" color="text.secondary">Current Tab</Typography>
            <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>{tabUrl || '—'}</Typography>
          </CardContent>
        </Card>

        <Box sx={{
          height: 'calc(100vh - 200px)', overflow: 'auto',
          fontFamily: 'monospace', fontSize: 12,
          bgcolor: '#0D0D0D', p: 1, borderRadius: 1,
        }}>
          {logs.length === 0 ? (
            <Typography color="text.secondary" sx={{ p: 2 }}>No logs yet. Navigate to a video page.</Typography>
          ) : (
            logs.map(log => (
              <Box key={log.id} sx={{ display: 'flex', gap: 1, mb: 0.25 }}>
                <Typography variant="caption" sx={{ color: '#666', flexShrink: 0 }}>
                  {new Date(log.timestamp).toLocaleTimeString()}
                </Typography>
                <Typography variant="caption" sx={{ color: LEVEL_COLORS[log.level] || '#fff', fontWeight: 700, minWidth: 45, flexShrink: 0 }}>
                  {log.level.toUpperCase()}
                </Typography>
                <Typography variant="caption" sx={{ color: '#BB86FC', flexShrink: 0 }}>[{log.module}]</Typography>
                <Typography variant="caption" sx={{ color: '#E0E0E0' }}>{log.message}</Typography>
              </Box>
            ))
          )}
        </Box>
      </Box>
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<DebugApp />);
